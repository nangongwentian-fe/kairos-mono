import { describe, expect, test } from "bun:test";
import {
  BadRequestError,
  formatSseEvent,
  parseRunRequest,
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

  test("formats server-sent events", () => {
    expect(formatSseEvent("state", { status: "idle" })).toBe(
      'event: state\ndata: {"status":"idle"}\n\n',
    );
  });
});
