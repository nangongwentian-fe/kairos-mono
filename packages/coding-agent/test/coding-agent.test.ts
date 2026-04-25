import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  createCodingAgent,
  DEFAULT_CODING_AGENT_SYSTEM_PROMPT,
  type GrepResult,
  type ListDirResult,
} from "../src/index";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1",
  apiKeyEnv: "TEST_API_KEY",
  supportsTools: true,
};

describe("@kairos/coding-agent createCodingAgent", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-coding-agent-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("creates an agent with the default read_file tool", async () => {
    await writeFile(join(root, "README.md"), "hello from README\n", "utf8");
    const responses: ModelResponse[] = [
      {
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
      },
      createTextResponse("summary"),
    ];
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses, requests),
    });

    const result = await agent.run("Read README.md");

    expect(result.stopReason).toBe("end_turn");
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "read_file",
      content: "hello from README\n",
    });
    expect(requests[0]?.systemPrompt).toBe(DEFAULT_CODING_AGENT_SYSTEM_PROMPT);
    expect(requests[0]?.tools?.map((tool) => tool.name)).toEqual([
      "list_dir",
      "grep",
      "read_file",
    ]);
  });

  test("creates an agent with the default list_dir tool", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "hello from README\n", "utf8");
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "list_dir",
                arguments: {
                  path: ".",
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("found files"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
    });

    const result = await agent.run("List the workspace root");
    const toolMessage = result.messages[2];

    expect(toolMessage?.role).toBe("tool");
    if (toolMessage?.role !== "tool") {
      throw new Error("Expected a tool message.");
    }
    expect(toolMessage.toolName).toBe("list_dir");
    expect(JSON.parse(toolMessage.content) as ListDirResult).toEqual({
      path: ".",
      entries: [
        {
          name: "README.md",
          path: "README.md",
          type: "file",
        },
        {
          name: "src",
          path: "src",
          type: "directory",
        },
      ],
    });
  });

  test("creates an agent with the default grep tool", async () => {
    await writeFile(join(root, "README.md"), "hello grep target\n", "utf8");
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "grep",
                arguments: {
                  pattern: "grep target",
                  path: ".",
                  literal: true,
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("found target"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
    });

    const result = await agent.run("Search for grep target");
    const toolMessage = result.messages[2];

    expect(toolMessage?.role).toBe("tool");
    if (toolMessage?.role !== "tool") {
      throw new Error("Expected a tool message.");
    }
    expect(toolMessage.toolName).toBe("grep");
    expect(JSON.parse(toolMessage.content) as GrepResult).toEqual({
      pattern: "grep target",
      path: ".",
      matches: [
        {
          file: "README.md",
          line: 1,
          text: "hello grep target",
          isMatch: true,
        },
      ],
      truncated: false,
    });
  });

  test("allows additional custom tools", async () => {
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "echo",
                arguments: {
                  text: "hello",
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("done"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      tools: [
        {
          name: "echo",
          description: "Echo text",
          execute: (args) => String((args as { text?: string }).text),
        },
      ],
      stream: createSequenceStream(responses),
    });

    const result = await agent.run("Echo hello");

    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "echo",
      content: "hello",
    });
  });

  test("allows overriding the system prompt", async () => {
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      systemPrompt: "custom coding prompt",
      stream: createSequenceStream([createTextResponse("ok")], requests),
    });

    await agent.run("hello");

    expect(requests[0]?.systemPrompt).toBe("custom coding prompt");
  });

  test("allows custom tools to replace built-in tools with the same name", async () => {
    let customReadFileExecuted = false;
    const responses: ModelResponse[] = [
      {
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
      },
      createTextResponse("done"),
    ];
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      tools: [
        {
          name: "read_file",
          description: "Custom read file",
          execute: () => {
            customReadFileExecuted = true;
            return "custom content";
          },
        },
      ],
      stream: createSequenceStream(responses, requests),
    });

    const result = await agent.run("Read README.md");

    expect(customReadFileExecuted).toBe(true);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "read_file",
      content: "custom content",
    });
    expect(requests[0]?.tools?.filter((tool) => tool.name === "read_file")).toHaveLength(1);
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
  responses: ModelResponse[],
  requests: ModelRequest[] = [],
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
