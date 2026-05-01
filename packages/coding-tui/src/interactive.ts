import {
  createCodingSession,
  type CodingSession,
  type CodingSessionRunOptions,
} from "@kairos/coding-agent";
import {
  createDefaultTuiIo,
  createTuiEventRenderer,
  createTuiToolConfirmation,
} from "@kairos/tui";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type {
  CodingTuiInteractiveInput,
  CodingTuiLineReader,
  RunCodingTuiInteractiveOptions,
} from "./types.js";
import { formatWorkspaceSummary } from "./workspace-summary.js";

const DEFAULT_PROMPT = "kairos> ";

export async function runCodingTuiInteractive(
  options: RunCodingTuiInteractiveOptions,
): Promise<void> {
  const {
    initialInput,
    io = createDefaultTuiIo(),
    lineReader = createDefaultLineReader(),
    onEvent,
    prompt = DEFAULT_PROMPT,
    confirmToolCall,
    session: providedSession,
    ...sessionOptions
  } = options;
  const renderer = createTuiEventRenderer(io);
  const session =
    providedSession ??
    createCodingSession({
      ...sessionOptions,
      recordWorkspaceDiff: sessionOptions.recordWorkspaceDiff ?? {
        includeDiff: false,
      },
      confirmToolCall:
        confirmToolCall ??
        createTuiToolConfirmation(io, renderer.closeAssistantBlock),
    });
  const unsubscribe = session.subscribe(async (event) => {
    await renderer.onEvent(event);
    await onEvent?.(event);
  });

  try {
    await io.write(createInteractiveWelcome());

    if (initialInput?.trim()) {
      await runInteractiveTurn(session, initialInput.trim(), {
        io,
        recordWorkspaceDiff: sessionOptions.recordWorkspaceDiff,
        workspaceGuard: sessionOptions.workspaceGuard,
      });
    }

    while (true) {
      const line = await lineReader.question(prompt);
      if (line === undefined) {
        await renderer.closeAssistantBlock();
        return;
      }

      const parsed = parseCodingTuiInteractiveInput(line);
      if (parsed.type === "empty") {
        continue;
      }

      if (parsed.type === "exit") {
        await renderer.closeAssistantBlock();
        await io.write("bye\n");
        return;
      }

      if (parsed.type === "help") {
        await io.write(createInteractiveHelp());
        continue;
      }

      if (parsed.type === "clear") {
        session.reset();
        await io.write("session cleared\n");
        continue;
      }

      if (parsed.type === "unknown_command") {
        await io.write(`unknown command: ${parsed.command}\n`);
        await io.write("type /help for commands\n");
        continue;
      }

      await runInteractiveTurn(session, parsed.input, {
        io,
        recordWorkspaceDiff: sessionOptions.recordWorkspaceDiff,
        workspaceGuard: sessionOptions.workspaceGuard,
      });
    }
  } finally {
    unsubscribe();
    await lineReader.close?.();
  }
}

export function parseCodingTuiInteractiveInput(
  line: string,
): CodingTuiInteractiveInput {
  const input = line.trim();
  if (!input) {
    return { type: "empty" };
  }

  if (!input.startsWith("/")) {
    return { type: "input", input };
  }

  const [command = ""] = input.split(/\s+/, 1);
  switch (command) {
    case "/exit":
    case "/quit":
      return { type: "exit" };
    case "/help":
      return { type: "help" };
    case "/clear":
      return { type: "clear" };
    default:
      return { type: "unknown_command", command };
  }
}

export function createInteractiveWelcome(): string {
  return [
    "Kairos coding agent interactive mode",
    "Type /help for commands, /exit to quit.",
    "",
  ].join("\n");
}

export function createInteractiveHelp(): string {
  return [
    "Commands:",
    "  /help   Show this help",
    "  /clear  Clear conversation state",
    "  /exit   Exit interactive mode",
    "",
  ].join("\n");
}

function createDefaultLineReader(): CodingTuiLineReader {
  return createInterface({ input: stdin, output: stdout });
}

async function runInteractiveTurn(
  session: CodingSession,
  input: string,
  options: Pick<RunCodingTuiInteractiveOptions, "io"> &
    Omit<CodingSessionRunOptions, "onEvent">,
): Promise<void> {
  try {
    const run = await session.run(input, {
      recordWorkspaceDiff: options.recordWorkspaceDiff,
      workspaceGuard: options.workspaceGuard,
    });
    const workspaceSummary = formatWorkspaceSummary(run.workspaceDiffReport);
    if (workspaceSummary) {
      await options.io?.write(workspaceSummary);
    }
  } catch (error) {
    await options.io?.write(`error: ${formatInteractiveError(error)}\n`);
  }
}

function formatInteractiveError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
