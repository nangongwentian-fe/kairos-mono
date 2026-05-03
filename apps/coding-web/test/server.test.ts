import { describe, expect, test } from "bun:test";
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

  test("formats server-sent events", () => {
    expect(formatSseEvent("state", { status: "idle" })).toBe(
      'event: state\ndata: {"status":"idle"}\n\n',
    );
  });

  test("returns an empty state for unknown sessions", () => {
    const service = new CodingWebRunService(".", "missing-provider", "missing-model");
    const state = service.getState("session_1");

    expect(state.items).toEqual([]);
    expect(state.status).toBe("idle");
  });
});
