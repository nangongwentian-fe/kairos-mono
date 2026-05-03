import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Model,
  ModelRequest,
  ModelResponse,
  ModelStream,
  ModelStreamEvent,
  JsonValue,
} from "@kairos/ai";
import {
  createCodingAgent,
  type CodingToolPolicyOptions,
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

describe("@kairos/coding-agent tool policy", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-tool-policy-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("blocks rm -rf before confirmation", async () => {
    let confirmed = false;
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream([
        createToolCallResponse("call_1", "run_command", {
          command: "rm",
          args: ["-rf", "tmp"],
        }),
        createTextResponse("blocked"),
      ]),
      confirmToolCall: () => {
        confirmed = true;
        return true;
      },
    });

    const result = await agent.run("Remove tmp");

    expect(confirmed).toBe(false);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "run_command",
      content: "Tool policy blocked run_command: rm -rf is not allowed.",
      isError: true,
    });
  });

  test("blocks shell-wrapped dangerous commands", async () => {
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream([
        createToolCallResponse("call_1", "run_command", {
          command: "sh",
          args: ["-c", "rm -rf tmp"],
        }),
        createTextResponse("blocked"),
      ]),
      confirmToolCall: () => true,
    });

    const result = await agent.run("Remove tmp through shell");

    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "run_command",
      content: "Tool policy blocked run_command: rm -rf is not allowed.",
      isError: true,
    });
  });

  test("blocks protected edit_file paths before confirmation", async () => {
    await writeFile(join(root, ".env.local"), "TOKEN=old\n", "utf8");
    let confirmed = false;
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream([
        createToolCallResponse("call_1", "edit_file", {
          path: ".env.local",
          oldText: "old",
          newText: "new",
        }),
        createTextResponse("blocked"),
      ]),
      confirmToolCall: () => {
        confirmed = true;
        return true;
      },
    });

    const result = await agent.run("Edit .env.local");

    expect(confirmed).toBe(false);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content:
        'Tool policy blocked edit_file: protected path ".env.local" matches ".env*".',
      isError: true,
    });
    await expect(readFile(join(root, ".env.local"), "utf8")).resolves.toBe(
      "TOKEN=old\n",
    );
  });

  test("blocks protected write_file paths before confirmation", async () => {
    let confirmed = false;
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream([
        createToolCallResponse("call_1", "write_file", {
          path: ".env.local",
          content: "TOKEN=new\n",
        }),
        createTextResponse("blocked"),
      ]),
      confirmToolCall: () => {
        confirmed = true;
        return true;
      },
    });

    const result = await agent.run("Write .env.local");

    expect(confirmed).toBe(false);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "write_file",
      content:
        'Tool policy blocked write_file: protected path ".env.local" matches ".env*".',
      isError: true,
    });
    await expect(readFile(join(root, ".env.local"), "utf8")).rejects.toThrow();
  });

  test("allows custom protected path patterns", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
    const toolPolicy: CodingToolPolicyOptions = {
      protectedPaths: ["README.md"],
    };
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      toolPolicy,
      stream: createSequenceStream([
        createToolCallResponse("call_1", "edit_file", {
          path: "README.md",
          oldText: "old",
          newText: "new",
        }),
        createTextResponse("blocked"),
      ]),
      confirmToolCall: () => true,
    });

    const result = await agent.run("Edit README.md");

    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "edit_file",
      content:
        'Tool policy blocked edit_file: protected path "README.md" matches "README.md".',
      isError: true,
    });
  });

  test("can disable the default tool policy", async () => {
    let executed = false;
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      toolPolicy: false,
      tools: [
        {
          name: "run_command",
          risk: "execute",
          description: "Custom run command",
          execute: () => {
            executed = true;
            return "custom execution";
          },
        },
      ],
      stream: createSequenceStream([
        createToolCallResponse("call_1", "run_command", {
          command: "rm",
          args: ["-rf", "tmp"],
        }),
        createTextResponse("ran"),
      ]),
      confirmToolCall: () => true,
    });

    const result = await agent.run("Run custom command");

    expect(executed).toBe(true);
    expect(result.messages[2]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "run_command",
      content: "custom execution",
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

function createToolCallResponse(
  id: string,
  name: string,
  args: Record<string, JsonValue>,
): ModelResponse {
  return {
    message: {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          call: {
            id,
            name,
            arguments: args,
          },
        },
      ],
    },
    stopReason: "tool_calls",
  };
}

function createSequenceStream(responses: ModelResponse[]) {
  let index = 0;

  return (_: Model, _request: ModelRequest): ModelStream => {
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
