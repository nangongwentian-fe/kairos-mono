import { describe, expect, test } from "bun:test";

import {
  Agent,
  createTraceRecorder,
  type AgentStreamFunction,
  type AgentTool,
} from "../src/index";
import type {
  Model,
  ModelResponse,
  ModelStream,
  ModelStreamEvent,
} from "@kairos/ai";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1",
  apiKeyEnv: "TEST_API_KEY",
  supportsTools: true,
};

describe("@kairos/agent trace recorder", () => {
  test("records turns, tool calls, tool results, and the final result", async () => {
    const readFile: AgentTool<{ path: string }> = {
      name: "read_file",
      description: "Read a file",
      execute: (args) => `content of ${args.path}`,
    };
    const toolResponse: ModelResponse = {
      message: {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            call: {
              id: "call_1",
              name: "read_file",
              arguments: {
                path: "README.md",
              },
            },
          },
        ],
      },
      stopReason: "tool_calls",
    };
    const finalResponse = createTextResponse("README 里写着项目介绍。");
    const recorder = createTraceRecorder();
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [readFile],
      stream: createSequenceStream([toolResponse, finalResponse]),
    });
    agent.subscribe(recorder.onEvent);

    const result = await agent.run("读 README");

    expect(recorder.trace.status).toBe("ended");
    expect(recorder.trace.input).toBe("读 README");
    expect(recorder.trace.startedAt).toEqual(expect.any(String));
    expect(recorder.trace.endedAt).toEqual(expect.any(String));
    expect(recorder.trace.result).toBe(result);
    expect(recorder.trace.turns).toHaveLength(2);
    expect(recorder.trace.turns[0]).toMatchObject({
      turn: 1,
      text: "",
      toolCalls: [
        {
          id: "call_1",
          name: "read_file",
          arguments: {
            path: "README.md",
          },
        },
      ],
    });
    expect(recorder.trace.turns[1]).toMatchObject({
      turn: 2,
      text: "README 里写着项目介绍。",
      toolCalls: [],
    });
    expect(recorder.trace.items.map((item) => item.type)).toEqual([
      "tool_call",
      "assistant_message",
      "tool_result",
      "assistant_message",
    ]);
    expect(recorder.trace.items[0]).toMatchObject({
      type: "tool_call",
      turn: 1,
      toolCall: {
        id: "call_1",
        name: "read_file",
      },
      startedAt: expect.any(String),
    });
    expect(recorder.trace.items[2]).toMatchObject({
      type: "tool_result",
      turn: 1,
      toolCallId: "call_1",
      toolName: "read_file",
      content: "content of README.md",
      isError: false,
      startedAt: expect.any(String),
      endedAt: expect.any(String),
      durationMs: expect.any(Number),
    });
    expect(recorder.trace.items[3]).toMatchObject({
      type: "assistant_message",
      turn: 2,
      text: "README 里写着项目介绍。",
    });
  });

  test("records tool errors and can be reset", async () => {
    const failingTool: AgentTool = {
      name: "read_file",
      description: "Read a file",
      execute: () => {
        throw new Error("file missing");
      },
    };
    const recorder = createTraceRecorder();
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [failingTool],
      stream: createSequenceStream([
        createToolCallResponse("call_1", "read_file"),
        createTextResponse("文件不存在。"),
      ]),
    });
    agent.subscribe(recorder.onEvent);

    await agent.run("读文件");

    expect(recorder.trace.items).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        toolCallId: "call_1",
        toolName: "read_file",
        content: "file missing",
        isError: true,
      }),
    );

    recorder.reset();

    expect(recorder.trace).toEqual({
      status: "idle",
      turns: [],
      items: [],
    });
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

function createToolCallResponse(id: string, name: string): ModelResponse {
  return {
    message: {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          call: {
            id,
            name,
            arguments: {},
          },
        },
      ],
    },
    stopReason: "tool_calls",
  };
}

function createSequenceStream(responses: ModelResponse[]): AgentStreamFunction {
  let index = 0;

  return () => {
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
  const events: ModelStreamEvent[] = [
    {
      type: "response_start",
      message: {
        role: "assistant",
        content: [],
      },
    },
  ];

  for (const block of response.message.content) {
    if (block.type === "text") {
      events.push({
        type: "text_delta",
        delta: block.text,
      });
      continue;
    }

    events.push({
      type: "tool_call",
      toolCall: block.call,
    });
  }

  events.push({
    type: "response_end",
    response,
  });

  return events;
}
