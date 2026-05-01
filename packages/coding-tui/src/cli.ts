#!/usr/bin/env bun
import { requireModel } from "@kairos/ai";
import {
  createCodingRunRecord,
  getDefaultCodingSessionStoreDir,
  resolveCodingSessionRecord,
  runCodingTask,
  writeCodingRunRecord,
  type RunCodingTaskResult,
} from "@kairos/coding-agent";
import { resolve } from "node:path";
import {
  argv,
  cwd as getCwd,
  exit,
  stdin,
  stderr,
  stdout,
} from "node:process";
import {
  createTuiJsonEventContext,
  formatTuiJsonEvent,
  toTuiJsonEvents,
} from "@kairos/tui";
import { runCodingTuiInteractive } from "./interactive.js";
import { runCodingTuiTask } from "./task.js";

const DEFAULT_MODEL_ID = "kimi-k2.6";
const DEFAULT_PROVIDER = "opencode-go";

export type TuiCliOutputMode = "tui" | "print" | "json";

export interface TuiCliArgs {
  input: string;
  modelId: string;
  outputMode: TuiCliOutputMode;
  readStdin: boolean;
  recordPath?: string;
  resumeSessionId?: string;
  root: string;
  help: boolean;
}

export interface ParseTuiCliArgsOptions {
  cwd?: string;
}

export function parseTuiCliArgs(
  args: readonly string[],
  options: ParseTuiCliArgsOptions = {},
): TuiCliArgs {
  const cwd = options.cwd ?? getCwd();
  const inputParts: string[] = [];
  let modelId = DEFAULT_MODEL_ID;
  let outputMode: TuiCliOutputMode = "tui";
  let readStdin = false;
  let recordPath: string | undefined;
  let resumeSessionId: string | undefined;
  let root = cwd;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--print" || arg === "-p") {
      outputMode = setOutputMode(outputMode, "print");
      continue;
    }

    if (arg === "--json") {
      outputMode = setOutputMode(outputMode, "json");
      continue;
    }

    if (arg === "--record") {
      recordPath = resolve(cwd, readFlagValue(args, index, "--record"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--record=")) {
      recordPath = resolve(cwd, readInlineFlagValue(arg, "--record"));
      continue;
    }

    if (arg === "--resume") {
      resumeSessionId = readFlagValue(args, index, "--resume");
      index += 1;
      continue;
    }

    if (arg.startsWith("--resume=")) {
      resumeSessionId = readInlineFlagValue(arg, "--resume");
      continue;
    }

    if (arg === "--model") {
      modelId = readFlagValue(args, index, "--model");
      index += 1;
      continue;
    }

    if (arg.startsWith("--model=")) {
      modelId = readInlineFlagValue(arg, "--model");
      continue;
    }

    if (arg === "--root") {
      root = resolve(cwd, readFlagValue(args, index, "--root"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--root=")) {
      root = resolve(cwd, readInlineFlagValue(arg, "--root"));
      continue;
    }

    if (arg === "-") {
      readStdin = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    inputParts.push(arg);
  }

  return {
    input: inputParts.join(" ").trim(),
    modelId,
    outputMode,
    readStdin,
    recordPath,
    resumeSessionId,
    root,
    help,
  };
}

export async function runTuiCli(args: readonly string[] = argv.slice(2)): Promise<number> {
  let parsed: TuiCliArgs;
  try {
    parsed = parseTuiCliArgs(args);
  } catch (error) {
    stderr.write(`${formatCliError(error)}\n\n${createTuiCliHelp()}`);
    return 1;
  }

  if (parsed.help) {
    stdout.write(createTuiCliHelp());
    return 0;
  }

  const input = await resolveTuiCliInput(parsed);
  if (!input && parsed.outputMode !== "tui") {
    stderr.write(`Missing task input.\n\n${createTuiCliHelp()}`);
    return 1;
  }

  try {
    const model = requireModel(DEFAULT_PROVIDER, parsed.modelId);
    const sessionStoreDir = getDefaultCodingSessionStoreDir(parsed.root);
    let run: RunCodingTaskResult;

    if (parsed.outputMode === "tui") {
      if (!parsed.recordPath) {
        const sessionRecord = parsed.resumeSessionId
          ? await resolveCodingSessionRecord(sessionStoreDir, parsed.resumeSessionId)
          : undefined;
        if (parsed.resumeSessionId && !sessionRecord) {
          stderr.write(`Session not found: ${parsed.resumeSessionId}\n`);
          return 1;
        }

        await runCodingTuiInteractive({
          root: parsed.root,
          model,
          initialInput: input,
          recordWorkspaceDiff: { includeDiff: false },
          sessionRecord,
          sessionStoreDir,
        });
        return 0;
      }

      if (parsed.resumeSessionId) {
        stderr.write("--resume cannot be used with --record.\n");
        return 1;
      }

      if (!input) {
        stderr.write(`Missing task input.\n\n${createTuiCliHelp()}`);
        return 1;
      }

      run = await runCodingTuiTask({
        root: parsed.root,
        model,
        input,
        recordWorkspaceDiff: true,
      });
    } else {
      if (parsed.resumeSessionId) {
        stderr.write("--resume is only supported in interactive mode.\n");
        return 1;
      }

      const jsonContext = createTuiJsonEventContext({
        input,
        root: parsed.root,
        model,
      });
      run = await runCodingTask({
        root: parsed.root,
        model,
        input,
        recordWorkspaceDiff: Boolean(parsed.recordPath),
        onEvent:
          parsed.outputMode === "json"
            ? (event) => {
                for (const jsonEvent of toTuiJsonEvents(event, jsonContext)) {
                  stdout.write(formatTuiJsonEvent(jsonEvent));
                }
              }
            : undefined,
      });
    }

    if (parsed.recordPath) {
      await writeCodingRunRecord(
        createCodingRunRecord({
          root: parsed.root,
          model,
          input,
          trace: run.trace,
          workspaceDiff: run.workspaceDiff,
          workspaceDiffReport: run.workspaceDiffReport,
          result: run.result,
        }),
        parsed.recordPath,
      );
    }

    if (parsed.outputMode === "print") {
      stdout.write(formatPrintOutput(run));
    }
  } catch (error) {
    stderr.write(`${formatCliError(error)}\n`);
    return 1;
  }

  return 0;
}

export async function resolveTuiCliInput(
  parsed: Pick<TuiCliArgs, "input" | "readStdin">,
  stdinText?: string,
): Promise<string> {
  if (!parsed.readStdin) {
    return parsed.input;
  }

  const pipedText = stdinText ?? (await readAllStdin());
  return [pipedText.trim(), parsed.input].filter(Boolean).join("\n").trim();
}

export function formatPrintOutput(run: RunCodingTaskResult): string {
  const text = run.result.response.message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");

  return text.length > 0 ? `${text}\n` : "";
}

export function createTuiCliHelp(): string {
  return [
    "Usage:",
    "  bun --env-file=.env.local packages/coding-tui/src/cli.ts",
    '  bun --env-file=.env.local packages/coding-tui/src/cli.ts "task"',
    "  echo \"task\" | bun --env-file=.env.local packages/coding-tui/src/cli.ts -",
    "",
    "Options:",
    "  --print          Print only the final assistant text and exit",
    "  --json           Print agent events as JSON lines and exit",
    "  --record <path>  Write a one-shot run record to a JSON file",
    "  --resume <id>    Resume a saved interactive session. Use latest for newest",
    `  --model <id>     OpenCode Go model id. Default: ${DEFAULT_MODEL_ID}`,
    "  --root <path>    Workspace root. Default: current directory",
    "  -h, --help       Show this help message",
    "",
    "Interactive commands:",
    "  /help   Show commands",
    "  /new    Start a new conversation",
    "  /sessions  List saved sessions",
    "  /resume <id|latest>  Resume a saved session",
    "  /exit   Exit interactive mode",
    "",
  ].join("\n");
}

function setOutputMode(
  current: TuiCliOutputMode,
  next: Exclude<TuiCliOutputMode, "tui">,
): TuiCliOutputMode {
  if (current !== "tui" && current !== next) {
    throw new Error("--print and --json cannot be used together");
  }

  return next;
}

function readFlagValue(
  args: readonly string[],
  index: number,
  flag: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function readInlineFlagValue(arg: string, flag: string): string {
  const value = arg.slice(flag.length + 1);
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function formatCliError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readAllStdin(): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";

  for await (const chunk of stdin) {
    text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
  }

  text += decoder.decode();
  return text;
}

if (import.meta.main) {
  const code = await runTuiCli();
  exit(code);
}
