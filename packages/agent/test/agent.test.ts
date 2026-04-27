import { describe, expect, test } from "bun:test";

import {
  Agent,
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

describe("@kairos/agent minimal loop", () => {
  test("stops after a text response without tool calls", async () => {
    const response = createTextResponse("你好");
    const agent = new Agent({
      model: TEST_MODEL,
      stream: createSequenceStream([response]),
    });
    const events: string[] = [];
    agent.subscribe((event) => {
      events.push(event.type);
    });

    const result = await agent.run("打个招呼");

    expect(result.stopReason).toBe("end_turn");
    expect(result.turns).toBe(1);
    expect(result.messages).toEqual([
      {
        role: "user",
        content: "打个招呼",
      },
      response.message,
    ]);
    expect(events).toEqual([
      "agent_start",
      "turn_start",
      "model_event",
      "model_event",
      "model_event",
      "turn_end",
      "agent_end",
    ]);
  });

  test("executes tool calls, appends tool results, and asks the model again", async () => {
    const calls: unknown[] = [];
    const readFile: AgentTool<{ path: string }> = {
      name: "read_file",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
        required: ["path"],
      },
      execute: (args) => {
        calls.push(args);
        return `content of ${args.path}`;
      },
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
    const requests: Array<unknown> = [];
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [readFile],
      stream: createSequenceStream([toolResponse, finalResponse], requests),
    });

    const result = await agent.run("读 README");

    expect(calls).toEqual([{ path: "README.md" }]);
    expect(result.stopReason).toBe("end_turn");
    expect(result.turns).toBe(2);
    expect(result.messages).toEqual([
      {
        role: "user",
        content: "读 README",
      },
      toolResponse.message,
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "read_file",
        content: "content of README.md",
      },
      finalResponse.message,
    ]);
    expect(requests).toHaveLength(2);
  });

  test("records tool errors as tool messages and continues the loop", async () => {
    const failingTool: AgentTool<{ path: string }> = {
      name: "read_file",
      description: "Read a file",
      execute: () => {
        throw new Error("file missing");
      },
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
                path: "missing.md",
              },
            },
          },
        ],
      },
      stopReason: "tool_calls",
    };
    const finalResponse = createTextResponse("文件不存在。");
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [failingTool],
      stream: createSequenceStream([toolResponse, finalResponse]),
    });

    const result = await agent.run("读文件");

    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "read_file",
      content: "file missing",
      isError: true,
    });
    expect(result.stopReason).toBe("end_turn");
  });

  test("executes read tools without confirmation", async () => {
    let executed = false;
    const readTool: AgentTool = {
      name: "read_file",
      description: "Read a file",
      risk: "read",
      execute: () => {
        executed = true;
        return "read result";
      },
    };
    const toolResponse = createToolCallResponse("call_1", "read_file");
    const finalResponse = createTextResponse("读完了。");
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [readTool],
      stream: createSequenceStream([toolResponse, finalResponse]),
    });

    const result = await agent.run("读文件");

    expect(executed).toBe(true);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "read_file",
      content: "read result",
    });
  });

  test("rejects write tools without confirmation", async () => {
    let executed = false;
    const writeTool: AgentTool = {
      name: "edit_file",
      description: "Edit a file",
      risk: "write",
      execute: () => {
        executed = true;
        return "edited";
      },
    };
    const toolResponse = createToolCallResponse("call_1", "edit_file");
    const finalResponse = createTextResponse("没有修改。");
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [writeTool],
      stream: createSequenceStream([toolResponse, finalResponse]),
    });

    const result = await agent.run("改文件");

    expect(executed).toBe(false);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content: "Tool edit_file requires confirmation for write access.",
      isError: true,
    });
    expect(result.stopReason).toBe("end_turn");
  });

  test("executes write tools after confirmation", async () => {
    let executed = false;
    const confirmations: Array<{
      toolCallName: string;
      toolName: string;
      preview: string | undefined;
    }> = [];
    const writeTool: AgentTool = {
      name: "edit_file",
      description: "Edit a file",
      risk: "write",
      preview: () => "diff preview",
      execute: () => {
        executed = true;
        return "edited";
      },
    };
    const toolResponse = createToolCallResponse("call_1", "edit_file");
    const finalResponse = createTextResponse("修改完成。");
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [writeTool],
      confirmToolCall: (toolCall, tool, preview) => {
        confirmations.push({
          toolCallName: toolCall.name,
          toolName: tool.name,
          preview,
        });
        return true;
      },
      stream: createSequenceStream([toolResponse, finalResponse]),
    });

    const result = await agent.run("改文件");

    expect(executed).toBe(true);
    expect(confirmations).toEqual([
      {
        toolCallName: "edit_file",
        toolName: "edit_file",
        preview: "diff preview",
      },
    ]);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content: "edited",
    });
  });

  test("rejects write tools when confirmation rejects the preview", async () => {
    let executed = false;
    const previews: Array<string | undefined> = [];
    const writeTool: AgentTool = {
      name: "edit_file",
      description: "Edit a file",
      risk: "write",
      preview: () => "diff preview",
      execute: () => {
        executed = true;
        return "edited";
      },
    };
    const toolResponse = createToolCallResponse("call_1", "edit_file");
    const finalResponse = createTextResponse("没有修改。");
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [writeTool],
      confirmToolCall: (_toolCall, _tool, preview) => {
        previews.push(preview);
        return false;
      },
      stream: createSequenceStream([toolResponse, finalResponse]),
    });

    const result = await agent.run("改文件");

    expect(executed).toBe(false);
    expect(previews).toEqual(["diff preview"]);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content: "Tool edit_file requires confirmation for write access.",
      isError: true,
    });
  });

  test("records preview errors as tool errors", async () => {
    let executed = false;
    let confirmed = false;
    const writeTool: AgentTool = {
      name: "edit_file",
      description: "Edit a file",
      risk: "write",
      preview: () => {
        throw new Error("preview failed");
      },
      execute: () => {
        executed = true;
        return "edited";
      },
    };
    const toolResponse = createToolCallResponse("call_1", "edit_file");
    const finalResponse = createTextResponse("没有修改。");
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [writeTool],
      confirmToolCall: () => {
        confirmed = true;
        return true;
      },
      stream: createSequenceStream([toolResponse, finalResponse]),
    });

    const result = await agent.run("改文件");

    expect(executed).toBe(false);
    expect(confirmed).toBe(false);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content: "preview failed",
      isError: true,
    });
  });

  test("stops before executing tools when maxTurns is reached", async () => {
    let executed = false;
    const tool: AgentTool = {
      name: "write_file",
      description: "Write a file",
      execute: () => {
        executed = true;
        return "written";
      },
    };
    const response: ModelResponse = {
      message: {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            call: {
              id: "call_1",
              name: "write_file",
              arguments: {},
            },
          },
        ],
      },
      stopReason: "tool_calls",
    };
    const agent = new Agent({
      model: TEST_MODEL,
      tools: [tool],
      maxTurns: 1,
      stream: createSequenceStream([response]),
    });

    const result = await agent.run("写文件");

    expect(executed).toBe(false);
    expect(result.stopReason).toBe("max_turns");
    expect(result.turns).toBe(1);
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

function createSequenceStream(
  responses: ModelResponse[],
  requests: unknown[] = [],
): AgentStreamFunction {
  let index = 0;

  return (_, request) => {
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
