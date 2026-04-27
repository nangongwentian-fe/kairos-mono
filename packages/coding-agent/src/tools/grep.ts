import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import type { AgentTool } from "@kairos/agent";
import type {
  GrepMatch,
  GrepResult,
  GrepToolArgs,
  GrepToolOptions,
} from "../types.js";
import {
  getOptionalBoolean,
  getOptionalNumber,
  getOptionalString,
  getRequiredString,
  normalizeNonNegativeInteger,
  normalizePositiveInteger,
} from "./args.js";
import {
  assertInsideRoot,
  resolveExistingPathInsideRoot,
  toToolPath,
} from "./path.js";

const DEFAULT_GREP_MAX_RESULTS = 100;
const MAX_GREP_MAX_RESULTS = 1_000;
const MAX_GREP_CONTEXT = 5;
const MAX_GREP_LINE_LENGTH = 500;
const DEFAULT_GREP_IGNORE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
] as const;

export function createGrepTool(
  options: GrepToolOptions,
): AgentTool<GrepToolArgs> {
  return {
    name: "grep",
    risk: "read",
    description:
      "Search file contents inside the configured workspace root using ripgrep. Supports regex patterns, optional file glob filtering, literal matching, ignore-case matching, context lines, and capped results.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description:
            "Regex pattern to search for. Use literal=true to treat this as plain text.",
        },
        path: {
          type: "string",
          description:
            "File or directory to search. Relative paths are resolved from the workspace root. Defaults to \".\".",
        },
        include: {
          type: "string",
          description:
            "Optional file glob filter, for example \"*.ts\" or \"**/*.java\".",
        },
        literal: {
          type: "boolean",
          description:
            "Treat pattern as a plain string instead of a regular expression.",
        },
        ignoreCase: {
          type: "boolean",
          description: "Search case-insensitively.",
        },
        context: {
          type: "number",
          description:
            "Number of context lines before and after each match. Maximum 5.",
        },
        maxResults: {
          type: "number",
          description:
            "Maximum number of matching lines to return. Defaults to 100 and is capped at 1000.",
        },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const pattern = getRequiredString(args, "pattern");

      const searchPath = getOptionalString(args, "path") ?? ".";
      const { root, target } = await resolveExistingPathInsideRoot(
        options.root,
        searchPath,
        `Path not found: ${searchPath}`,
      );
      const targetStat = await stat(target);
      if (!targetStat.isDirectory() && !targetStat.isFile()) {
        throw new Error(`Path is not a file or directory: ${searchPath}`);
      }

      const maxResults = normalizePositiveInteger(
        getOptionalNumber(args, "maxResults"),
        DEFAULT_GREP_MAX_RESULTS,
        MAX_GREP_MAX_RESULTS,
        "maxResults",
      );
      const context = normalizeNonNegativeInteger(
        getOptionalNumber(args, "context"),
        0,
        MAX_GREP_CONTEXT,
        "context",
      );
      const result = await runRipgrepSearch({
        rgPath: options.rgPath ?? "rg",
        root,
        target,
        pattern,
        include: getOptionalString(args, "include"),
        literal: getOptionalBoolean(args, "literal"),
        ignoreCase: getOptionalBoolean(args, "ignoreCase"),
        context,
        maxResults,
      });

      return JSON.stringify(result, null, 2);
    },
  };
}

interface RunRipgrepSearchOptions {
  rgPath: string;
  root: string;
  target: string;
  pattern: string;
  include?: string;
  literal: boolean;
  ignoreCase: boolean;
  context: number;
  maxResults: number;
}

function runRipgrepSearch(options: RunRipgrepSearchOptions): Promise<GrepResult> {
  const args = createRipgrepArgs(options);
  const matches: GrepMatch[] = [];
  let matchingLineCount = 0;
  let truncated = false;
  let killedDueToLimit = false;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(options.rgPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };
    const resolveResult = (): void => {
      settle(() =>
        resolvePromise({
          pattern: options.pattern,
          path: toToolPath(relative(options.root, options.target)),
          matches,
          truncated,
        }),
      );
    };

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        settle(() =>
          reject(
            new Error(
              "ripgrep (rg) is required for grep but was not found in PATH.",
            ),
          ),
        );
        return;
      }

      settle(() => reject(error));
    });

    if (!child.stdout || !child.stderr) {
      settle(() => reject(new Error("ripgrep output was not available.")));
      return;
    }

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const event = parseRipgrepEvent(line);
      if (!event) {
        return;
      }

      if (event.type === "context" && options.context > 0) {
        const contextLine = toGrepMatch(options.root, event, false);
        if (contextLine) {
          matches.push(contextLine);
        }
        return;
      }

      if (event.type !== "match") {
        return;
      }
      if (matchingLineCount >= options.maxResults) {
        truncated = true;
        if (!killedDueToLimit) {
          killedDueToLimit = true;
          child.kill();
        }
        return;
      }

      const match = toGrepMatch(options.root, event, true);
      if (!match) {
        return;
      }

      matchingLineCount += 1;
      matches.push(match);
      if (matchingLineCount >= options.maxResults) {
        truncated = true;
        killedDueToLimit = true;
        child.kill();
      }
    });

    child.on("close", (code) => {
      lines.close();
      if (killedDueToLimit) {
        resolveResult();
        return;
      }

      if (code === 0 || code === 1) {
        resolveResult();
        return;
      }

      const message = stderr.trim() || `ripgrep exited with code ${code}`;
      settle(() => reject(new Error(message)));
    });
  });
}

function createRipgrepArgs(options: RunRipgrepSearchOptions): string[] {
  const args = [
    "--json",
    "--line-number",
    "--color=never",
    "--hidden",
    "--no-messages",
  ];

  for (const ignore of DEFAULT_GREP_IGNORE_GLOBS) {
    args.push("--glob", `!${ignore}`);
  }
  if (options.include) {
    args.push("--glob", options.include);
  }
  if (options.literal) {
    args.push("--fixed-strings");
  }
  if (options.ignoreCase) {
    args.push("--ignore-case");
  }
  if (options.context > 0) {
    args.push("--context", String(options.context));
  }

  args.push("--", options.pattern, options.target);
  return args;
}

interface RipgrepJsonEvent {
  type?: string;
  data?: {
    path?: {
      text?: string;
    };
    line_number?: number;
    lines?: {
      text?: string;
    };
  };
}

function parseRipgrepEvent(line: string): RipgrepJsonEvent | undefined {
  try {
    const value = JSON.parse(line) as RipgrepJsonEvent;
    if (value && typeof value === "object") {
      return value;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function toGrepMatch(
  root: string,
  event: RipgrepJsonEvent,
  isMatch: boolean,
): GrepMatch | undefined {
  const filePath = event.data?.path?.text;
  const line = event.data?.line_number;
  const text = event.data?.lines?.text;
  if (!filePath || typeof line !== "number" || text === undefined) {
    return undefined;
  }

  const absolutePath = resolve(filePath);
  try {
    assertInsideRoot(root, absolutePath);
  } catch {
    return undefined;
  }

  return {
    file: toToolPath(relative(root, absolutePath)),
    line,
    text: truncateLine(sanitizeRipgrepLine(text)),
    isMatch,
  };
}

function sanitizeRipgrepLine(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/\n$/, "");
}

function truncateLine(value: string): string {
  if (value.length <= MAX_GREP_LINE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_GREP_LINE_LENGTH)}...`;
}
