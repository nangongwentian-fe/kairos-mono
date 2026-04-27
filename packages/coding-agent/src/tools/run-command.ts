import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { relative } from "node:path";
import type { AgentTool } from "@kairos/agent";
import type {
  RunCommandResult,
  RunCommandToolArgs,
  RunCommandToolOptions,
} from "../types.js";
import {
  getOptionalNumber,
  getOptionalString,
  getOptionalStringArray,
  getRequiredString,
  normalizePositiveInteger,
} from "./args.js";
import { resolveExistingPathInsideRoot, toToolPath } from "./path.js";

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 20_000;

export function createRunCommandTool(
  options: RunCommandToolOptions,
): AgentTool<RunCommandToolArgs> {
  return {
    name: "run_command",
    risk: "execute",
    description:
      "Run a non-interactive command inside the workspace root without a shell. Put arguments in args instead of command. Use this for tests, type checks, and other bounded verification commands.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Executable to run, for example \"bun\". This is executed directly, not through a shell.",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description:
            "Command arguments. Do not include shell operators such as &&, |, or >.",
        },
        cwd: {
          type: "string",
          description:
            "Working directory. Relative paths are resolved from the workspace root. Defaults to \".\".",
        },
        timeoutMs: {
          type: "number",
          description:
            "Timeout in milliseconds. Defaults to 30000 and is capped at 120000.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
    preview: async (args) => {
      const plan = await createRunCommandPlan(options, args);
      return JSON.stringify(
        {
          cwd: plan.cwdPath,
          command: plan.command,
          args: plan.args,
          timeoutMs: plan.timeoutMs,
        },
        null,
        2,
      );
    },
    execute: async (args) => {
      const plan = await createRunCommandPlan(options, args);
      const result = await runCommand(plan);
      return JSON.stringify(result, null, 2);
    },
  };
}

interface RunCommandPlan {
  command: string;
  args: string[];
  cwd: string;
  cwdPath: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

async function createRunCommandPlan(
  options: RunCommandToolOptions,
  args: RunCommandToolArgs,
): Promise<RunCommandPlan> {
  const command = getRequiredString(args, "command");
  const commandArgs = getOptionalStringArray(args, "args");
  const requestedCwd = getOptionalString(args, "cwd") ?? ".";
  const { root, target } = await resolveExistingPathInsideRoot(
    options.root,
    requestedCwd,
    `Working directory not found: ${requestedCwd}`,
  );
  const targetStat = await stat(target);
  if (!targetStat.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${requestedCwd}`);
  }

  const maxTimeoutMs = options.maxTimeoutMs ?? MAX_COMMAND_TIMEOUT_MS;
  const defaultTimeoutMs =
    options.defaultTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const timeoutMs = normalizePositiveInteger(
    getOptionalNumber(args, "timeoutMs"),
    defaultTimeoutMs,
    maxTimeoutMs,
    "timeoutMs",
  );

  return {
    command,
    args: commandArgs,
    cwd: target,
    cwdPath: toToolPath(relative(root, target)),
    timeoutMs,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  };
}

function runCommand(plan: RunCommandPlan): Promise<RunCommandResult> {
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, 1_000);
    }, plan.timeoutMs);

    const clearTimers = (): void => {
      clearTimeout(timeout);
      if (killTimeout) {
        clearTimeout(killTimeout);
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const next = appendWithLimit(stdout, chunk.toString("utf8"), plan.maxOutputBytes);
      stdout = next.value;
      stdoutTruncated ||= next.truncated;
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const next = appendWithLimit(stderr, chunk.toString("utf8"), plan.maxOutputBytes);
      stderr = next.value;
      stderrTruncated ||= next.truncated;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimers();
      if (error.code === "ENOENT") {
        reject(new Error(`Command not found: ${plan.command}`));
        return;
      }

      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      clearTimers();
      resolvePromise({
        command: plan.command,
        args: plan.args,
        cwd: plan.cwdPath,
        exitCode,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

function appendWithLimit(
  current: string,
  chunk: string,
  maxLength: number,
): { value: string; truncated: boolean } {
  const next = current + chunk;
  if (next.length <= maxLength) {
    return {
      value: next,
      truncated: false,
    };
  }

  return {
    value: next.slice(next.length - maxLength),
    truncated: true,
  };
}
