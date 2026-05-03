import { requireModel } from "@kairos/ai";
import {
  DEFAULT_CODING_AGENT_MAX_TURNS,
  createCodingSession,
  createCodingSessionRecord,
  deleteCodingSessionRecord,
  getDefaultCodingSessionStoreDir,
  listCodingSessionRecords,
  readCodingSessionRecord,
  updateCodingSessionRecord,
  writeCodingSessionRecord,
  type CodingSession,
  type CodingSessionRecord,
  type CodingSessionSummary,
} from "@kairos/coding-agent";
import {
  createInitialWebUiState,
  createWebUiEventStore,
  createWebUiStateFromMessages,
  type WebUiEventStore,
  type WebUiState,
} from "@kairos/web-ui";
import { CodingWebApprovalBroker } from "./approvals.js";
import { BadRequestError, formatError, formatSseEvent } from "./responses.js";
import type {
  CodingWebApprovalDecisionRequest,
  CodingWebRunRequest,
  CodingWebSessionSummary,
} from "./types.js";

interface CodingWebSessionRecord {
  session: CodingSession;
  sessionRecord: CodingSessionRecord;
  store: WebUiEventStore;
  approvals: CodingWebApprovalBroker;
}

export class CodingWebRunService {
  private readonly sessions = new Map<string, CodingWebSessionRecord>();
  private readonly sessionStoreDir: string;

  constructor(
    private readonly root: string,
    private readonly provider: string,
    private readonly modelId: string,
    private readonly maxTurns: number = DEFAULT_CODING_AGENT_MAX_TURNS,
    sessionStoreDir?: string,
  ) {
    this.sessionStoreDir = sessionStoreDir ?? getDefaultCodingSessionStoreDir(root);
  }

  async listSessions(): Promise<CodingWebSessionSummary[]> {
    const summaries = await listCodingSessionRecords(this.sessionStoreDir);
    return summaries.map(formatSessionSummary);
  }

  async createSession(): Promise<CodingWebSessionSummary> {
    const sessionRecord = createCodingSessionRecord({
      root: this.root,
      model: this.getModel(),
    });
    await writeCodingSessionRecord(sessionRecord, this.sessionStoreDir);
    return formatSessionSummary({
      id: sessionRecord.id,
      createdAt: sessionRecord.createdAt,
      updatedAt: sessionRecord.updatedAt,
      messageCount: sessionRecord.messages.length,
      firstUserMessage: undefined,
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const existing = this.sessions.get(sessionId);
    if (existing?.session.state.isRunning) {
      throw new BadRequestError("session is already running.");
    }

    existing?.approvals.cancelAll();
    this.sessions.delete(sessionId);
    return deleteCodingSessionRecord(this.sessionStoreDir, sessionId);
  }

  async getState(sessionId: string): Promise<WebUiState> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing.store.getState();
    }

    const sessionRecord = await readCodingSessionRecord(
      this.sessionStoreDir,
      sessionId,
    );
    return sessionRecord
      ? createWebUiStateFromMessages(sessionRecord.messages)
      : createInitialWebUiState();
  }

  async run(request: CodingWebRunRequest): Promise<ReadableStream<Uint8Array>> {
    const record = await this.getOrCreateSession(request.sessionId);
    if (record.session.state.isRunning) {
      throw new BadRequestError("session is already running.");
    }

    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(formatSseEvent(event, data)));
        };
        record.approvals.setEmitter((approval) => {
          send("approval", approval);
        });
        const unsubscribe = record.session.subscribe((event) => {
          send("state", record.store.dispatch(event));
        });

        try {
          send("state", record.store.getState());
          const run = await record.session.run(request.input, {
            recordWorkspaceDiff: { includeDiff: false },
          });
          record.sessionRecord = await this.saveSessionRecord(
            record.sessionRecord,
            run.result.messages,
          );
          send("done", { state: record.store.getState() });
        } catch (error) {
          const state = record.store.fail(error);
          record.sessionRecord = await this.saveSessionRecord(
            record.sessionRecord,
            record.session.state.messages,
          );
          send("error", {
            message: formatError(error),
            state,
          });
        } finally {
          record.approvals.setEmitter(undefined);
          unsubscribe();
          controller.close();
        }
      },
      cancel: () => {
        record.approvals.cancelAll();
      },
    });
  }

  resolveApproval(request: CodingWebApprovalDecisionRequest): void {
    const record = this.sessions.get(request.sessionId);
    const resolved = record?.approvals.resolve(
      request.sessionId,
      request.approvalId,
      request.decision === "allow",
    );
    if (!resolved) {
      throw new BadRequestError("approval not found.");
    }
  }

  private async getOrCreateSession(
    sessionId: string,
  ): Promise<CodingWebSessionRecord> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const model = this.getModel();
    const sessionRecord =
      (await readCodingSessionRecord(this.sessionStoreDir, sessionId)) ??
      createCodingSessionRecord({
        id: sessionId,
        root: this.root,
        model,
      });
    if (sessionRecord.messages.length === 0) {
      await writeCodingSessionRecord(sessionRecord, this.sessionStoreDir);
    }

    const approvals = new CodingWebApprovalBroker();
    const record: CodingWebSessionRecord = {
      session: createCodingSession({
        root: this.root,
        model,
        maxTurns: this.maxTurns,
        messages: sessionRecord.messages,
        recordWorkspaceDiff: { includeDiff: false },
        confirmToolCall: (toolCall, tool, preview) =>
          approvals.request(sessionId, toolCall, tool, preview),
      }),
      sessionRecord,
      store: createWebUiEventStore(
        createWebUiStateFromMessages(sessionRecord.messages),
      ),
      approvals,
    };
    this.sessions.set(sessionId, record);
    return record;
  }

  private async saveSessionRecord(
    record: CodingSessionRecord,
    messages: readonly CodingSessionRecord["messages"][number][],
  ): Promise<CodingSessionRecord> {
    const nextRecord = updateCodingSessionRecord(record, { messages });
    await writeCodingSessionRecord(nextRecord, this.sessionStoreDir);
    return nextRecord;
  }

  private getModel() {
    return requireModel(this.provider, this.modelId);
  }
}

function formatSessionSummary(
  summary: Pick<
    CodingSessionSummary,
    "id" | "createdAt" | "updatedAt" | "messageCount" | "firstUserMessage"
  >,
): CodingWebSessionSummary {
  return {
    id: summary.id,
    title: formatSessionTitle(summary.firstUserMessage),
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
  };
}

function formatSessionTitle(firstUserMessage: string | undefined): string {
  const normalized = firstUserMessage?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Session";
  }
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
}
