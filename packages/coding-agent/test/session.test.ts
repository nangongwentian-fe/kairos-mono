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
import { createCodingSession } from "../src/index";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1",
  apiKeyEnv: "TEST_API_KEY",
  supportsTools: true,
};

describe("@kairos/coding-agent CodingSession", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-coding-session-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("preserves conversation state across runs", async () => {
    const requests: ModelRequest[] = [];
    const session = createCodingSession({
      root,
      model: TEST_MODEL,
      workspaceGuard: false,
      stream: createSequenceStream(requests, [
        createTextResponse("first answer"),
        createTextResponse("second answer"),
      ]),
    });

    const first = await session.run("first question");
    const second = await session.run("second question");

    expect(first.result.response.message.content).toEqual([
      { type: "text", text: "first answer" },
    ]);
    expect(second.result.response.message.content).toEqual([
      { type: "text", text: "second answer" },
    ]);
    expect(session.state.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(requests[0]?.messages.map((message) => message.role)).toEqual([
      "user",
    ]);
    expect(requests[1]?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });

  test("reset clears conversation state for the next run", async () => {
    const requests: ModelRequest[] = [];
    const session = createCodingSession({
      root,
      model: TEST_MODEL,
      workspaceGuard: false,
      stream: createSequenceStream(requests, [
        createTextResponse("first answer"),
        createTextResponse("fresh answer"),
      ]),
    });

    await session.run("first question");
    session.reset();
    await session.run("fresh question");

    expect(session.state.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(requests[1]?.messages).toEqual([
      { role: "user", content: "fresh question" },
    ]);
  });
});

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
    if (!request.tools?.some((tool) => tool.name === "read_file")) {
      throw new Error("Expected coding tools to be sent to the model.");
    }

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
