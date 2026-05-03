import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  DEFAULT_CODING_AGENT_MAX_TURNS,
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
      "todo_write",
      "write_file",
      "edit_file",
      "run_command",
    ]);
  });

  test("uses a coding-agent default turn budget above short inspection loops", async () => {
    const responses = [
      ...Array.from({ length: 10 }, (_, index) =>
        createListDirToolCallResponse(`call_${index + 1}`),
      ),
      createTextResponse("done"),
    ];
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses, requests),
    });

    const result = await agent.run("Inspect the project");

    expect(DEFAULT_CODING_AGENT_MAX_TURNS).toBeGreaterThanOrEqual(50);
    expect(result.stopReason).toBe("end_turn");
    expect(result.turns).toBe(11);
    expect(requests).toHaveLength(11);
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

  test("rejects the default edit_file tool without confirmation", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "edit_file",
                arguments: {
                  path: "README.md",
                  oldText: "old",
                  newText: "new",
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("could not edit"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
    });

    const result = await agent.run("Edit README.md");

    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content: "Tool edit_file requires confirmation for write access.",
      isError: true,
    });
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello old world\n",
    );
  });

  test("runs the default edit_file tool after confirmation", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
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
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_2",
                name: "edit_file",
                arguments: {
                  path: "README.md",
                  oldText: "old",
                  newText: "new",
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("edited"),
    ];
    const previews: Array<string | undefined> = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
      confirmToolCall: (_toolCall, _tool, preview) => {
        previews.push(preview);
        return true;
      },
    });

    const result = await agent.run("Edit README.md");
    const toolMessage = result.messages[4];

    expect(toolMessage?.role).toBe("tool");
    if (toolMessage?.role !== "tool") {
      throw new Error("Expected a tool message.");
    }
    expect(toolMessage.toolName).toBe("edit_file");
    expect(toolMessage.isError).toBeUndefined();
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      path: "README.md",
      replacements: 1,
    });
    expect(previews).toHaveLength(1);
    expect(previews[0]).toContain("-hello old world");
    expect(previews[0]).toContain("+hello new world");
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello new world\n",
    );
  });

  test("does not write when edit_file confirmation rejects the preview", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
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
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_2",
                name: "edit_file",
                arguments: {
                  path: "README.md",
                  oldText: "old",
                  newText: "new",
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("not edited"),
    ];
    const previews: Array<string | undefined> = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
      confirmToolCall: (_toolCall, _tool, preview) => {
        previews.push(preview);
        return false;
      },
    });

    const result = await agent.run("Edit README.md");

    expect(previews).toHaveLength(1);
    expect(previews[0]).toContain("-hello old world");
    expect(previews[0]).toContain("+hello new world");
    expect(result.messages[4]).toEqual({
      role: "tool",
      toolCallId: "call_2",
      toolName: "edit_file",
      content: "Tool edit_file requires confirmation for write access.",
      isError: true,
    });
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello old world\n",
    );
  });

  test("requires read_file before the default edit_file tool", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "edit_file",
                arguments: {
                  path: "README.md",
                  oldText: "old",
                  newText: "new",
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("could not edit"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
      confirmToolCall: () => true,
    });

    const result = await agent.run("Edit README.md");

    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content: "File must be read with read_file before edit_file: README.md",
      isError: true,
    });
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello old world\n",
    );
  });

  test("rejects edit_file when a file changed after read_file", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
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
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_2",
                name: "edit_file",
                arguments: {
                  path: "README.md",
                  oldText: "old",
                  newText: "new",
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("could not edit"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses, [], (index) => {
        if (index === 1) {
          writeFileSync(join(root, "README.md"), "external old change\n", "utf8");
        }
      }),
      confirmToolCall: () => true,
    });

    const result = await agent.run("Edit README.md");

    expect(result.messages[4]).toEqual({
      role: "tool",
      toolCallId: "call_2",
      toolName: "edit_file",
      content:
        "File changed since it was read. Read it again before edit_file: README.md",
      isError: true,
    });
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "external old change\n",
    );
  });

  test("rejects the default run_command tool without confirmation", async () => {
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "run_command",
                arguments: {
                  command: process.execPath,
                  args: ["--version"],
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("not run"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
    });

    const result = await agent.run("Run bun version");

    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "run_command",
      content: "Tool run_command requires confirmation for execute access.",
      isError: true,
    });
  });

  test("runs the default run_command tool after confirmation", async () => {
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "run_command",
                arguments: {
                  command: process.execPath,
                  args: ["--version"],
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("ran"),
    ];
    const previews: Array<string | undefined> = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
      confirmToolCall: (_toolCall, _tool, preview) => {
        previews.push(preview);
        return true;
      },
    });

    const result = await agent.run("Run bun version");
    const toolMessage = result.messages[2];

    expect(toolMessage?.role).toBe("tool");
    if (toolMessage?.role !== "tool") {
      throw new Error("Expected a tool message.");
    }
    expect(toolMessage.toolName).toBe("run_command");
    expect(toolMessage.isError).toBeUndefined();
    expect(previews).toHaveLength(1);
    expect(previews[0]).toContain(process.execPath);
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      command: process.execPath,
      args: ["--version"],
      cwd: ".",
      exitCode: 0,
      timedOut: false,
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

  test("creates an agent with the default todo_write tool", async () => {
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "todo_write",
                arguments: {
                  todos: [
                    {
                      id: "inspect",
                      content: "Inspect existing tools",
                      status: "completed",
                    },
                    {
                      id: "implement",
                      content: "Implement todo_write",
                      status: "in_progress",
                    },
                  ],
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createTextResponse("tracked"),
    ];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
    });

    const result = await agent.run("Track progress");
    const toolMessage = result.messages[2];

    expect(toolMessage?.role).toBe("tool");
    if (toolMessage?.role !== "tool") {
      throw new Error("Expected a tool message.");
    }
    expect(toolMessage.toolName).toBe("todo_write");
    expect(toolMessage.isError).toBeUndefined();
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      pendingCount: 0,
      inProgressCount: 1,
      completedCount: 1,
      metadata: {
        todos: [
          {
            id: "inspect",
            content: "Inspect existing tools",
            status: "completed",
          },
          {
            id: "implement",
            content: "Implement todo_write",
            status: "in_progress",
          },
        ],
      },
    });
  });

  test("adds a todo reminder after configured turns without todo_write", async () => {
    const responses: ModelResponse[] = [
      createListDirToolCallResponse("call_1"),
      createListDirToolCallResponse("call_2"),
      createTextResponse("done"),
    ];
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      maxTurns: 3,
      todoReminder: {
        turnsSinceTodoWrite: 2,
        turnsBetweenReminders: 2,
      },
      stream: createSequenceStream(responses, requests),
    });

    await agent.run("Inspect the project without planning");

    expect(requests[0]?.systemPrompt).toBe(DEFAULT_CODING_AGENT_SYSTEM_PROMPT);
    expect(requests[1]?.systemPrompt).not.toContain(
      "todo_write has not been used recently",
    );
    expect(requests[2]?.systemPrompt).toContain(
      "todo_write has not been used recently",
    );
  });

  test("keeps todo reminders spaced apart", async () => {
    const responses: ModelResponse[] = [
      createListDirToolCallResponse("call_1"),
      createListDirToolCallResponse("call_2"),
      createListDirToolCallResponse("call_3"),
      createTextResponse("done"),
    ];
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      maxTurns: 4,
      todoReminder: {
        turnsSinceTodoWrite: 1,
        turnsBetweenReminders: 2,
      },
      stream: createSequenceStream(responses, requests),
    });

    await agent.run("Inspect the project without planning");

    expect(requests[1]?.systemPrompt).toContain(
      "todo_write has not been used recently",
    );
    expect(requests[2]?.systemPrompt).not.toContain(
      "todo_write has not been used recently",
    );
    expect(requests[3]?.systemPrompt).toContain(
      "todo_write has not been used recently",
    );
  });

  test("does not add todo reminders after recent todo_write usage", async () => {
    const responses: ModelResponse[] = [
      {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              call: {
                id: "call_1",
                name: "todo_write",
                arguments: {
                  todos: [
                    {
                      id: "inspect",
                      content: "Inspect the project",
                      status: "in_progress",
                    },
                  ],
                },
              },
            },
          ],
        },
        stopReason: "tool_calls",
      },
      createListDirToolCallResponse("call_2"),
      createTextResponse("done"),
    ];
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      maxTurns: 3,
      todoReminder: {
        turnsSinceTodoWrite: 2,
        turnsBetweenReminders: 2,
      },
      stream: createSequenceStream(responses, requests),
    });

    await agent.run("Track and inspect the project");

    expect(requests[1]?.systemPrompt).not.toContain(
      "todo_write has not been used recently",
    );
    expect(requests[2]?.systemPrompt).not.toContain(
      "todo_write has not been used recently",
    );
  });

  test("can disable todo reminders", async () => {
    const responses: ModelResponse[] = [
      createListDirToolCallResponse("call_1"),
      createListDirToolCallResponse("call_2"),
      createListDirToolCallResponse("call_3"),
      createTextResponse("done"),
    ];
    const requests: ModelRequest[] = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      maxTurns: 4,
      todoReminder: false,
      stream: createSequenceStream(responses, requests),
    });

    await agent.run("Inspect the project without planning");

    expect(
      requests.some((request) =>
        request.systemPrompt?.includes("todo_write has not been used recently"),
      ),
    ).toBe(false);
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

function createListDirToolCallResponse(toolCallId: string): ModelResponse {
  return {
    message: {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          call: {
            id: toolCallId,
            name: "list_dir",
            arguments: {
              path: ".",
            },
          },
        },
      ],
    },
    stopReason: "tool_calls",
  };
}

function createSequenceStream(
  responses: ModelResponse[],
  requests: ModelRequest[] = [],
  onRequest?: (index: number, request: ModelRequest) => void,
) {
  let index = 0;

  return (_: Model, request: ModelRequest): ModelStream => {
    requests.push(request);
    onRequest?.(index, request);
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
