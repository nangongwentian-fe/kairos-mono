import type { Dirent } from "node:fs";
import { spawn } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import {
  Agent,
  type AgentOptions,
  type AgentStreamFunction,
  type AgentTool,
} from "@kairos/agent";
import type { JsonValue, Message, Model } from "@kairos/ai";

export const KAIROS_CODING_AGENT_PACKAGE = "@kairos/coding-agent";

export interface ReadFileToolOptions {
  root: string;
}

export interface ReadFileToolArgs extends Record<string, JsonValue> {
  path: string;
}

export interface ListDirToolOptions {
  root: string;
}

export interface ListDirToolArgs extends Record<string, JsonValue> {
  path: string;
}

export type ListDirEntryType = "file" | "directory" | "symlink" | "other";

export interface ListDirEntry {
  name: string;
  path: string;
  type: ListDirEntryType;
}

export interface ListDirResult {
  path: string;
  entries: ListDirEntry[];
}

export interface GrepToolOptions {
  root: string;
  rgPath?: string;
}

export interface GrepToolArgs extends Record<string, JsonValue> {
  pattern: string;
}

export interface GrepMatch {
  file: string;
  line: number;
  text: string;
  isMatch: boolean;
}

export interface GrepResult {
  pattern: string;
  path: string;
  matches: GrepMatch[];
  truncated: boolean;
}

export interface CodingAgentOptions {
  root: string;
  model: Model;
  systemPrompt?: string;
  tools?: readonly AgentTool<any>[];
  maxTurns?: number;
  messages?: readonly Message[];
  stream?: AgentStreamFunction;
}

export const DEFAULT_CODING_AGENT_SYSTEM_PROMPT =
  "You are a coding agent. Use list_dir to inspect directories, grep to search file contents, and read_file to inspect files before answering. Do not claim to have inspected a path unless you used a tool.";

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

export function createCodingAgent(options: CodingAgentOptions): Agent {
  const agentOptions: AgentOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt ?? DEFAULT_CODING_AGENT_SYSTEM_PROMPT,
    tools: mergeTools(
      [
        createListDirTool({ root: options.root }),
        createGrepTool({ root: options.root }),
        createReadFileTool({ root: options.root }),
      ],
      options.tools ?? [],
    ),
    maxTurns: options.maxTurns,
    messages: options.messages,
    stream: options.stream,
  };

  return new Agent(agentOptions);
}

function mergeTools(
  builtInTools: readonly AgentTool<any>[],
  customTools: readonly AgentTool<any>[],
): AgentTool<any>[] {
  const tools = new Map<string, AgentTool<any>>();
  for (const tool of builtInTools) {
    tools.set(tool.name, tool);
  }
  for (const tool of customTools) {
    tools.set(tool.name, tool);
  }

  return Array.from(tools.values());
}

export function createReadFileTool(
  options: ReadFileToolOptions,
): AgentTool<ReadFileToolArgs> {
  return {
    name: "read_file",
    description:
      "Read a UTF-8 text file inside the configured workspace root. Input must be an object with a path string.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "File path to read. Relative paths are resolved from the workspace root.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const { target } = await resolveExistingPathInsideRoot(
        options.root,
        args.path,
        `File not found: ${args.path}`,
      );

      const targetStat = await stat(target);
      if (targetStat.isDirectory()) {
        throw new Error(`Path is a directory: ${args.path}`);
      }
      if (!targetStat.isFile()) {
        throw new Error(`Path is not a regular file: ${args.path}`);
      }

      return await readFile(target, "utf8");
    },
  };
}

export function createListDirTool(
  options: ListDirToolOptions,
): AgentTool<ListDirToolArgs> {
  return {
    name: "list_dir",
    description:
      "List entries in a directory inside the configured workspace root. Input must be an object with a path string, for example {\"path\":\".\"}.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path to list. Relative paths are resolved from the workspace root. Use \".\" for the workspace root.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const { root, target } = await resolveExistingPathInsideRoot(
        options.root,
        args.path,
        `Directory not found: ${args.path}`,
      );

      const targetStat = await stat(target);
      if (!targetStat.isDirectory()) {
        throw new Error(`Path is not a directory: ${args.path}`);
      }

      const entries = (await readdir(target, { withFileTypes: true }))
        .map((entry) => toListDirEntry(root, target, entry))
        .sort((a, b) => a.name.localeCompare(b.name));
      const result: ListDirResult = {
        path: toToolPath(relative(root, target)),
        entries,
      };

      return JSON.stringify(result, null, 2);
    },
  };
}

export function createGrepTool(
  options: GrepToolOptions,
): AgentTool<GrepToolArgs> {
  return {
    name: "grep",
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

async function resolveExistingPathInsideRoot(
  rootPath: string,
  requestedPath: string,
  notFoundMessage: string,
): Promise<{ root: string; target: string }> {
  const root = await realpath(rootPath);
  const candidate = resolveCandidatePath(root, requestedPath);
  assertInsideRoot(root, candidate);

  const target = await realpath(candidate).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(notFoundMessage);
    }
    throw error;
  });
  assertInsideRoot(root, target);

  return { root, target };
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

function normalizePositiveInteger(
  value: number | undefined,
  defaultValue: number,
  maxValue: number,
  name: string,
): number {
  const numberValue = Number(value ?? defaultValue);
  if (!Number.isFinite(numberValue) || numberValue < 1) {
    throw new Error(`${name} must be a positive number.`);
  }

  return Math.min(Math.floor(numberValue), maxValue);
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  defaultValue: number,
  maxValue: number,
  name: string,
): number {
  const numberValue = Number(value ?? defaultValue);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return Math.min(Math.floor(numberValue), maxValue);
}

function getRequiredString(args: Record<string, JsonValue>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function getOptionalString(
  args: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }

  return value;
}

function getOptionalNumber(
  args: Record<string, JsonValue>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`${key} must be a number.`);
  }

  return value;
}

function getOptionalBoolean(
  args: Record<string, JsonValue>,
  key: string,
): boolean {
  const value = args[key];
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean.`);
  }

  return value;
}

function resolveCandidatePath(root: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    return resolve(filePath);
  }

  return resolve(root, filePath);
}

function assertInsideRoot(root: string, target: string): void {
  const relativePath = relative(root, target);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes workspace root: ${target}`);
  }
}

function toListDirEntry(
  root: string,
  directory: string,
  entry: Dirent,
): ListDirEntry {
  const absolutePath = resolve(directory, entry.name);
  return {
    name: entry.name,
    path: toToolPath(relative(root, absolutePath)),
    type: getDirEntryType(entry),
  };
}

function getDirEntryType(entry: Dirent): ListDirEntryType {
  if (entry.isFile()) {
    return "file";
  }
  if (entry.isDirectory()) {
    return "directory";
  }
  if (entry.isSymbolicLink()) {
    return "symlink";
  }

  return "other";
}

function toToolPath(relativePath: string): string {
  if (relativePath === "") {
    return ".";
  }

  return relativePath.split(sep).join("/");
}

interface NodeError extends Error {
  code?: string;
}

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error && "code" in error;
}
