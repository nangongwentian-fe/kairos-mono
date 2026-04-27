import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Model,
  ModelRequest,
  ModelResponse,
  ModelStream,
  ModelStreamEvent,
} from "@kairos/ai";
import { runCodingTask } from "../src/index";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1",
  apiKeyEnv: "TEST_API_KEY",
  supportsTools: true,
};

describe("@kairos/coding-agent runCodingTask", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-coding-task-"));
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("runs a coding task and returns both result and trace", async () => {
    const confirmations: Array<{ name: string; preview?: string }> = [];
    const events: string[] = [];
    const run = await runCodingTask({
      root,
      model: TEST_MODEL,
      input: "Update README.md.",
      stream: createSequenceStream([
        createToolCallResponse("call_read", "read_file", {
          path: "README.md",
        }),
        createToolCallResponse("call_edit", "edit_file", {
          path: "README.md",
          oldText: "old",
          newText: "new",
        }),
        createTextResponse("updated"),
      ]),
      confirmToolCall: (_toolCall, tool, preview) => {
        confirmations.push({ name: tool.name, preview });
        return true;
      },
      onEvent: (event) => {
        events.push(event.type);
      },
    });

    expect(run.result.stopReason).toBe("end_turn");
    expect(run.result.turns).toBe(3);
    expect(run.trace.status).toBe("ended");
    expect(run.trace.input).toBe("Update README.md.");
    expect(run.trace.result).toBe(run.result);
    expect(run.trace.turns).toHaveLength(3);
    expect(run.trace.items.map((item) => item.type)).toEqual([
      "tool_call",
      "assistant_message",
      "tool_result",
      "tool_call",
      "assistant_message",
      "tool_result",
      "assistant_message",
    ]);
    expect(run.trace.items).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        toolName: "edit_file",
        isError: false,
      }),
    );
    expect(events).toContain("agent_start");
    expect(events).toContain("turn_start");
    expect(events).toContain("model_event");
    expect(events).toContain("tool_start");
    expect(events).toContain("tool_end");
    expect(events).toContain("agent_end");
    expect(events.at(-1)).toBe("agent_end");
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]?.name).toBe("edit_file");
    expect(confirmations[0]?.preview).toContain("-hello old world");
    expect(confirmations[0]?.preview).toContain("+hello new world");
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello new world\n",
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
    if (!request.tools?.some((tool) => tool.name === "edit_file")) {
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
