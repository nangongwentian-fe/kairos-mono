import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Model,
  ModelRequest,
  ModelResponse,
  ModelStream,
  ModelStreamEvent,
} from "@kairos/ai";
import {
  createCodingSessionRecord,
  listCodingSessionRecords,
  writeCodingSessionRecord,
} from "@kairos/coding-agent";
import type { TuiIo } from "@kairos/tui";
import {
  parseCodingTuiInteractiveInput,
  runCodingTuiInteractive,
} from "../src/index";
import type { CodingTuiLineReader } from "../src/types";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1",
  apiKeyEnv: "TEST_API_KEY",
  supportsTools: true,
};

describe("@kairos/coding-tui interactive mode", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-coding-tui-interactive-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("parses interactive commands", () => {
    expect(parseCodingTuiInteractiveInput("")).toEqual({ type: "empty" });
    expect(parseCodingTuiInteractiveInput("  hello  ")).toEqual({
      type: "input",
      input: "hello",
    });
    expect(parseCodingTuiInteractiveInput("/help")).toEqual({ type: "help" });
    expect(parseCodingTuiInteractiveInput("/clear")).toEqual({ type: "clear" });
    expect(parseCodingTuiInteractiveInput("/quit")).toEqual({ type: "exit" });
    expect(parseCodingTuiInteractiveInput("/unknown arg")).toEqual({
      type: "unknown_command",
      command: "/unknown",
    });
  });

  test("runs multiple prompts in one coding session", async () => {
    const chunks: string[] = [];
    const prompts: string[] = [];
    const requests: ModelRequest[] = [];
    const io: TuiIo = {
      write: (text) => {
        chunks.push(text);
      },
      confirm: () => true,
    };
    const lineReader = createLineReader(
      ["first question", "second question", "/exit"],
      prompts,
    );

    await runCodingTuiInteractive({
      root,
      model: TEST_MODEL,
      io,
      lineReader,
      workspaceGuard: false,
      stream: createSequenceStream(requests, [
        createTextResponse("first answer"),
        createTextResponse("second answer"),
      ]),
    });

    const output = chunks.join("");
    expect(prompts).toEqual(["kairos> ", "kairos> ", "kairos> "]);
    expect(output).toContain("Kairos coding agent interactive mode");
    expect(output).toContain("Session:");
    expect(output).toContain("> first question");
    expect(output).toContain("assistant: first answer");
    expect(output).toContain("> second question");
    expect(output).toContain("assistant: second answer");
    expect(output).toContain("bye");
    expect(requests[1]?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);

    const [saved] = await listCodingSessionRecords(join(root, ".kairos", "sessions"));
    expect(saved).toMatchObject({
      messageCount: 4,
      firstUserMessage: "first question",
    });
  });

  test("clears the conversation with /clear", async () => {
    const chunks: string[] = [];
    const requests: ModelRequest[] = [];
    const io: TuiIo = {
      write: (text) => {
        chunks.push(text);
      },
      confirm: () => true,
    };

    await runCodingTuiInteractive({
      root,
      model: TEST_MODEL,
      io,
      lineReader: createLineReader([
        "first question",
        "/clear",
        "fresh question",
        "/exit",
      ]),
      workspaceGuard: false,
      stream: createSequenceStream(requests, [
        createTextResponse("first answer"),
        createTextResponse("fresh answer"),
      ]),
    });

    expect(chunks.join("")).toContain("session cleared");
    expect(requests[1]?.messages).toEqual([
      { role: "user", content: "fresh question" },
    ]);
  });

  test("lists and resumes saved sessions", async () => {
    const chunks: string[] = [];
    const requests: ModelRequest[] = [];
    const io: TuiIo = {
      write: (text) => {
        chunks.push(text);
      },
      confirm: () => true,
    };
    const record = createCodingSessionRecord({
      id: "saved-session",
      root,
      model: TEST_MODEL,
      messages: [
        { role: "user", content: "saved question" },
        {
          role: "assistant",
          content: [{ type: "text", text: "saved answer" }],
        },
      ],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    await writeCodingSessionRecord(record);

    await runCodingTuiInteractive({
      root,
      model: TEST_MODEL,
      io,
      lineReader: createLineReader([
        "/sessions",
        "/resume saved-session",
        "follow up",
        "/exit",
      ]),
      workspaceGuard: false,
      stream: createSequenceStream(requests, [createTextResponse("followed")]),
    });

    const output = chunks.join("");
    expect(output).toContain("Saved sessions:");
    expect(output).toContain("saved-session");
    expect(output).toContain("resumed session saved-session");
    expect(requests[0]?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });
});

function createLineReader(
  lines: string[],
  prompts: string[] = [],
): CodingTuiLineReader {
  return {
    question: async (prompt) => {
      prompts.push(prompt);
      return lines.shift();
    },
    close: () => {},
  };
}

function createTextResponse(text: string): ModelResponse {
  return {
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text,
        },
      ],
    },
    stopReason: "end_turn",
  };
}

function createSequenceStream(
  requests: ModelRequest[],
  responses: ModelResponse[],
) {
  let index = 0;

  return (_: Model, request: ModelRequest): ModelStream => {
    requests.push(request);
    const response = responses[index];
    index += 1;
    if (!response) {
      throw new Error("No mock response left.");
    }

    return createModelStream(response);
  };
}

function createModelStream(response: ModelResponse): ModelStream {
  const events = createEvents(response);

  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    result: async () => response,
  };
}

function createEvents(response: ModelResponse): ModelStreamEvent[] {
  return [
    {
      type: "response_start",
      message: {
        role: "assistant",
        content: [],
      },
    },
    ...response.message.content.map((block): ModelStreamEvent => {
      if (block.type === "text") {
        return {
          type: "text_delta",
          delta: block.text,
        };
      }

      return {
        type: "tool_call",
        toolCall: block.call,
      };
    }),
    {
      type: "response_end",
      response,
    },
  ];
}
