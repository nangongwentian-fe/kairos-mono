import {
  createCodingSession,
  createCodingSessionRecord,
  getDefaultCodingSessionStoreDir,
  listCodingSessionRecords,
  resolveCodingSessionRecord,
  updateCodingSessionRecord,
  writeCodingSessionRecord,
  type CodingSession,
  type CodingSessionRecord,
  type CodingSessionSummary,
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
type InteractiveSessionMessage = CodingSessionRecord["messages"][number];

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
    sessionRecord: providedSessionRecord,
    sessionStoreDir,
    ...sessionOptions
  } = options;
  const renderer = createTuiEventRenderer(io);
  const storeDir =
    sessionStoreDir ?? getDefaultCodingSessionStoreDir(sessionOptions.root);
  let activeRecord =
    providedSessionRecord ??
    createCodingSessionRecord({
      root: sessionOptions.root,
      model: sessionOptions.model,
      messages: sessionOptions.messages,
    });
  const session =
    providedSession ??
    createCodingSession({
      ...sessionOptions,
      messages: activeRecord.messages,
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
    await io.write(createInteractiveWelcome(activeRecord.id));

    if (initialInput?.trim()) {
      activeRecord = await runInteractiveTurn(
        session,
        activeRecord,
        storeDir,
        initialInput.trim(),
        {
          io,
          recordWorkspaceDiff: sessionOptions.recordWorkspaceDiff,
          workspaceGuard: sessionOptions.workspaceGuard,
        },
      );
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

      if (parsed.type === "new") {
        activeRecord = createCodingSessionRecord({
          root: sessionOptions.root,
          model: sessionOptions.model,
        });
        session.reset();
        await io.write(`started new session ${activeRecord.id}\n`);
        continue;
      }

      if (parsed.type === "sessions") {
        await io.write(
          formatInteractiveSessions(await listCodingSessionRecords(storeDir)),
        );
        continue;
      }

      if (parsed.type === "resume") {
        const record = await resolveCodingSessionRecord(storeDir, parsed.id);
        if (!record) {
          await io.write(`session not found: ${parsed.id}\n`);
          continue;
        }

        activeRecord = record;
        session.reset(record.messages);
        await io.write(`resumed session ${record.id}\n`);
        continue;
      }

      if (parsed.type === "unknown_command") {
        await io.write(`unknown command: ${parsed.command}\n`);
        await io.write("type /help for commands\n");
        continue;
      }

      activeRecord = await runInteractiveTurn(
        session,
        activeRecord,
        storeDir,
        parsed.input,
        {
          io,
          recordWorkspaceDiff: sessionOptions.recordWorkspaceDiff,
          workspaceGuard: sessionOptions.workspaceGuard,
        },
      );
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
  const [, argument] = input.split(/\s+/, 2);
  switch (command) {
    case "/exit":
    case "/quit":
      return { type: "exit" };
    case "/help":
      return { type: "help" };
    case "/new":
      return { type: "new" };
    case "/sessions":
      return { type: "sessions" };
    case "/resume":
      return { type: "resume", id: argument ?? "latest" };
    default:
      return { type: "unknown_command", command };
  }
}

export function createInteractiveWelcome(sessionId?: string): string {
  return [
    "Kairos coding agent interactive mode",
    ...(sessionId ? [`Session: ${sessionId}`] : []),
    "Type /help for commands, /exit to quit.",
    "",
  ].join("\n");
}

export function createInteractiveHelp(): string {
  return [
    "Commands:",
    "  /help   Show this help",
    "  /new    Start a new conversation",
    "  /sessions  List saved sessions",
    "  /resume <id|latest>  Resume a saved session",
    "  /exit   Exit interactive mode",
    "",
  ].join("\n");
}

function createDefaultLineReader(): CodingTuiLineReader {
  return createInterface({ input: stdin, output: stdout });
}

async function runInteractiveTurn(
  session: CodingSession,
  record: CodingSessionRecord,
  storeDir: string,
  input: string,
  options: Pick<RunCodingTuiInteractiveOptions, "io"> &
    Omit<CodingSessionRunOptions, "onEvent">,
): Promise<CodingSessionRecord> {
  try {
    const run = await session.run(input, {
      recordWorkspaceDiff: options.recordWorkspaceDiff,
      workspaceGuard: options.workspaceGuard,
    });
    const workspaceSummary = formatWorkspaceSummary(run.workspaceDiffReport);
    if (workspaceSummary) {
      await options.io?.write(workspaceSummary);
    }
    return await saveInteractiveSession(record, storeDir, run.result.messages);
  } catch (error) {
    await options.io?.write(`error: ${formatInteractiveError(error)}\n`);
    return record;
  }
}

function formatInteractiveError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function saveInteractiveSession(
  record: CodingSessionRecord,
  storeDir: string,
  messages: readonly InteractiveSessionMessage[],
): Promise<CodingSessionRecord> {
  const nextRecord = updateCodingSessionRecord(record, { messages });
  await writeCodingSessionRecord(nextRecord, storeDir);
  return nextRecord;
}

function formatInteractiveSessions(
  sessions: readonly CodingSessionSummary[],
): string {
  if (sessions.length === 0) {
    return "no saved sessions\n";
  }

  return [
    "Saved sessions:",
    ...sessions.map((session) => {
      const title = session.firstUserMessage ?? "(empty)";
      return `  ${session.id}  ${session.updatedAt}  ${session.messageCount} messages  ${title}`;
    }),
    "",
  ].join("\n");
}
