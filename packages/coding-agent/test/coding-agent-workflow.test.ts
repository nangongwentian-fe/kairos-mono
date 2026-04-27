import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Message,
  Model,
  ModelRequest,
  ModelResponse,
  ModelStream,
  ModelStreamEvent,
} from "@kairos/ai";
import {
  createCodingAgent,
  type RunCommandResult,
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

describe("@kairos/coding-agent workflow", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-coding-agent-workflow-"));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src/math.ts"),
      [
        "export function add(a: number, b: number): number {",
        "  return a - b;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "math.test.ts"),
      [
        'import { expect, test } from "bun:test";',
        'import { add } from "./src/math";',
        "",
        'test("adds numbers", () => {',
        "  expect(add(2, 3)).toBe(5);",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("can read, edit, and verify a code change", async () => {
    const responses: ModelResponse[] = [
      createToolCallResponse("call_read", "read_file", {
        path: "src/math.ts",
      }),
      createToolCallResponse("call_edit", "edit_file", {
        path: "src/math.ts",
        oldText: "return a - b;",
        newText: "return a + b;",
      }),
      createToolCallResponse("call_test", "run_command", {
        command: process.execPath,
        args: ["test", "math.test.ts"],
      }),
      createTextResponse("fixed"),
    ];
    const confirmations: Array<{ name: string; preview?: string }> = [];
    const agent = createCodingAgent({
      root,
      model: TEST_MODEL,
      stream: createSequenceStream(responses),
      confirmToolCall: (_toolCall, tool, preview) => {
        confirmations.push({ name: tool.name, preview });
        return true;
      },
    });

    const result = await agent.run("Fix and verify the add function.");
    const toolMessages = result.messages.filter(
      (message): message is Extract<Message, { role: "tool" }> =>
        message.role === "tool",
    );
    const runCommandMessage = toolMessages.find(
      (message) => message.toolName === "run_command",
    );

    expect(result.stopReason).toBe("end_turn");
    expect(toolMessages.map((message) => message.toolName)).toEqual([
      "read_file",
      "edit_file",
      "run_command",
    ]);
    expect(confirmations.map((confirmation) => confirmation.name)).toEqual([
      "edit_file",
      "run_command",
    ]);
    expect(confirmations[0]?.preview).toContain("-  return a - b;");
    expect(confirmations[0]?.preview).toContain("+  return a + b;");
    expect(confirmations[1]?.preview).toContain(process.execPath);
    expect(runCommandMessage).toBeDefined();
    if (!runCommandMessage) {
      throw new Error("Expected run_command result.");
    }
    expect(JSON.parse(runCommandMessage.content) as RunCommandResult)
      .toMatchObject({
        command: process.execPath,
        args: ["test", "math.test.ts"],
        cwd: ".",
        exitCode: 0,
        timedOut: false,
      });
    await expect(readFile(join(root, "src/math.ts"), "utf8")).resolves.toContain(
      "return a + b;",
    );
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
  args: Record<string, unknown>,
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

  return (_: Model, request: ModelRequest): ModelStream => {
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
