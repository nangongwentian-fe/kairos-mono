import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createCodingSessionRecord,
  getDefaultCodingSessionStoreDir,
  writeCodingSessionRecord,
} from "@kairos/coding-agent";
import { requireModel } from "@kairos/ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BadRequestError,
  CodingWebApprovalBroker,
  CodingWebRunService,
  formatSseEvent,
  parseApprovalDecisionRequest,
  parseRunRequest,
  type CodingWebApprovalRequest,
} from "../src/server.js";

describe("@kairos/coding-web server helpers", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-coding-web-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("parses a valid run request", async () => {
    const request = new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({
        input: "Read README.md",
        sessionId: "session_1",
      }),
    });

    await expect(parseRunRequest(request)).resolves.toEqual({
      input: "Read README.md",
      sessionId: "session_1",
    });
  });

  test("rejects empty input", async () => {
    const request = new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({
        input: "   ",
        sessionId: "session_1",
      }),
    });

    await expect(parseRunRequest(request)).rejects.toThrow(BadRequestError);
  });

  test("rejects unsafe session ids", async () => {
    const request = new Request("http://localhost/api/run", {
      method: "POST",
      body: JSON.stringify({
        input: "Read README.md",
        sessionId: "../bad",
      }),
    });

    await expect(parseRunRequest(request)).rejects.toThrow("sessionId is invalid.");
  });

  test("parses an approval decision", async () => {
    const request = new Request("http://localhost/api/approval", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "session_1",
        approvalId: "approval_1",
        decision: "allow",
      }),
    });

    await expect(parseApprovalDecisionRequest(request)).resolves.toEqual({
      sessionId: "session_1",
      approvalId: "approval_1",
      decision: "allow",
    });
  });

  test("rejects invalid approval decisions", async () => {
    const request = new Request("http://localhost/api/approval", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "session_1",
        approvalId: "approval_1",
        decision: "later",
      }),
    });

    await expect(parseApprovalDecisionRequest(request)).rejects.toThrow(
      "decision must be allow or deny.",
    );
  });

  test("resolves browser approval decisions", async () => {
    const approvals = new CodingWebApprovalBroker();
    const emitted: CodingWebApprovalRequest[] = [];
    approvals.setEmitter((approval) => {
      emitted.push(approval);
    });

    const toolCall = {
      id: "call_1",
      name: "edit_file",
      arguments: { path: "README.md" },
    } as Parameters<CodingWebApprovalBroker["request"]>[1];
    const tool = {
      name: "edit_file",
      risk: "write",
    } as Parameters<CodingWebApprovalBroker["request"]>[2];

    const decision = approvals.request("session_1", toolCall, tool, "diff");

    expect(emitted).toEqual([
      {
        id: expect.any(String),
        sessionId: "session_1",
        toolCallId: "call_1",
        toolName: "edit_file",
        risk: "write",
        arguments: { path: "README.md" },
        preview: "diff",
      },
    ]);
    expect(approvals.resolve("session_1", emitted[0].id, true)).toBe(true);
    await expect(decision).resolves.toBe(true);
  });

  test("treats duplicate approval decisions as resolved", async () => {
    const approvals = new CodingWebApprovalBroker();
    const emitted: CodingWebApprovalRequest[] = [];
    approvals.setEmitter((approval) => {
      emitted.push(approval);
    });

    const toolCall = {
      id: "call_1",
      name: "run_command",
      arguments: { command: "echo", args: ["hello"] },
    } as Parameters<CodingWebApprovalBroker["request"]>[1];
    const tool = {
      name: "run_command",
      risk: "execute",
    } as Parameters<CodingWebApprovalBroker["request"]>[2];

    const decision = approvals.request("session_1", toolCall, tool, "echo hello");
    const approvalId = emitted[0].id;

    expect(approvals.resolve("session_1", approvalId, true)).toBe(true);
    expect(approvals.resolve("session_1", approvalId, true)).toBe(true);
    expect(approvals.resolve("session_1", approvalId, false)).toBe(false);
    await expect(decision).resolves.toBe(true);
  });

  test("formats server-sent events", () => {
    expect(formatSseEvent("state", { status: "idle" })).toBe(
      'event: state\ndata: {"status":"idle"}\n\n',
    );
  });

  test("returns an empty state for unknown sessions", async () => {
    const service = new CodingWebRunService(".", "missing-provider", "missing-model");
    const state = await service.getState("session_1");

    expect(state.items).toEqual([]);
    expect(state.status).toBe("idle");
  });

  test("creates and lists persistent sessions", async () => {
    const service = new CodingWebRunService(root, "opencode-go", "kimi-k2.6");

    const session = await service.createSession();
    const sessions = await service.listSessions();

    expect(session).toMatchObject({
      id: expect.any(String),
      title: "Session",
      messageCount: 0,
    });
    expect(sessions).toEqual([session]);
  });

  test("deletes persistent sessions", async () => {
    const service = new CodingWebRunService(root, "opencode-go", "kimi-k2.6");

    const session = await service.createSession();

    await expect(service.deleteSession(session.id)).resolves.toBe(true);
    await expect(service.listSessions()).resolves.toEqual([]);
    await expect(service.deleteSession(session.id)).resolves.toBe(false);
  });

  test("loads saved session messages into web state", async () => {
    const model = requireModel("opencode-go", "kimi-k2.6");
    const record = createCodingSessionRecord({
      id: "saved_session",
      root,
      model,
      messages: [
        { role: "user", content: "Read README" },
        {
          role: "assistant",
          content: [{ type: "text", text: "README summary" }],
        },
      ],
    });
    await writeCodingSessionRecord(
      record,
      getDefaultCodingSessionStoreDir(root),
    );
    const service = new CodingWebRunService(root, "opencode-go", "kimi-k2.6");

    const sessions = await service.listSessions();
    const state = await service.getState("saved_session");

    expect(sessions[0]).toMatchObject({
      id: "saved_session",
      title: "Read README",
      messageCount: 2,
    });
    expect(state).toMatchObject({
      status: "completed",
      runId: 1,
    });
    expect(state.items.map((item) => item.kind)).toEqual(["user", "assistant"]);
  });
});
