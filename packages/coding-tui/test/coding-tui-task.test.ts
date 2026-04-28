import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Model,
  ModelRequest,
  ModelResponse,
  ModelStream,
  ModelStreamEvent,
  JsonObject,
} from "@kairos/ai";
import type { TuiIo } from "@kairos/tui";
import { runCodingTuiTask } from "../src/index";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1",
  apiKeyEnv: "TEST_API_KEY",
  supportsTools: true,
};

describe("@kairos/coding-tui runCodingTuiTask", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-tui-task-"));
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("renders a coding task and confirms write tools through TUI IO", async () => {
    const chunks: string[] = [];
    const prompts: string[] = [];
    const events: string[] = [];
    const io: TuiIo = {
      write: (text) => {
        chunks.push(text);
      },
      confirm: (prompt) => {
        prompts.push(prompt);
        return true;
      },
    };

    const run = await runCodingTuiTask({
      root,
      model: TEST_MODEL,
      input: "Update README.md.",
      io,
      onEvent: (event) => {
        events.push(event.type);
      },
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
    });
    const output = chunks.join("");

    expect(run.result.stopReason).toBe("end_turn");
    expect(run.trace.status).toBe("ended");
    expect(prompts).toEqual(["allow? [y/N] "]);
    expect(events).toContain("agent_start");
    expect(events).toContain("tool_start");
    expect(events).toContain("tool_end");
    expect(events.at(-1)).toBe("agent_end");
    expect(output).toContain("> Update README.md.");
    expect(output).toContain("tool read_file README.md started");
    expect(output).toContain("tool read_file done");
    expect(output).toContain("tool edit_file README.md started");
    expect(output).toContain("permission required: edit_file");
    expect(output).toContain("-hello old world");
    expect(output).toContain("+hello new world");
    expect(output).toContain("assistant: updated");
    expect(output).toContain("completed: end_turn in 3 turns");
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello new world\n",
    );
  });

  test("renders rejected confirmations as tool errors", async () => {
    const chunks: string[] = [];
    const io: TuiIo = {
      write: (text) => {
        chunks.push(text);
      },
      confirm: () => false,
    };

    const run = await runCodingTuiTask({
      root,
      model: TEST_MODEL,
      input: "Update README.md.",
      io,
      stream: createSequenceStream([
        createToolCallResponse("call_read", "read_file", {
          path: "README.md",
        }),
        createToolCallResponse("call_edit", "edit_file", {
          path: "README.md",
          oldText: "old",
          newText: "new",
        }),
        createTextResponse("not updated"),
      ]),
    });
    const output = chunks.join("");

    expect(run.result.messages[4]).toMatchObject({
      role: "tool",
      toolName: "edit_file",
      isError: true,
    });
    expect(output).toContain("permission required: edit_file");
    expect(output).toContain("tool edit_file error");
    expect(output).toContain(
      "Tool edit_file requires confirmation for write access.",
    );
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello old world\n",
    );
  });

  test("renders todo_write as a task list", async () => {
    const chunks: string[] = [];
    const io: TuiIo = {
      write: (text) => {
        chunks.push(text);
      },
      confirm: () => true,
    };

    const run = await runCodingTuiTask({
      root,
      model: TEST_MODEL,
      input: "Plan README.md work.",
      io,
      stream: createSequenceStream([
        createToolCallResponse("call_todo", "todo_write", {
          todos: [
            {
              id: "inspect",
              content: "Inspect README.md",
              status: "completed",
            },
            {
              id: "edit",
              content: "Edit README.md",
              status: "in_progress",
            },
            {
              id: "test",
              content: "Run tests",
              status: "pending",
            },
          ],
        }),
        createTextResponse("planned"),
      ]),
    });
    const output = chunks.join("");

    expect(run.result.stopReason).toBe("end_turn");
    expect(output).toContain("todos: 1/3 completed");
    expect(output).toContain("  [x] Inspect README.md");
    expect(output).toContain("  [~] Edit README.md");
    expect(output).toContain("  [ ] Run tests");
    expect(output).not.toContain("tool todo_write started");
    expect(output).not.toContain("tool todo_write done");
    expect(output).toContain("assistant: planned");
  });

  test("renders a workspace change summary after the run", async () => {
    await git(root, ["init"]);
    await git(root, ["add", "README.md"]);
    await git(root, [
      "-c",
      "user.email=kairos@example.com",
      "-c",
      "user.name=Kairos Test",
      "commit",
      "-m",
      "initial commit",
    ]);
    await writeFile(join(root, "notes.txt"), "pre-existing\n", "utf8");

    const chunks: string[] = [];
    const io: TuiIo = {
      write: (text) => {
        chunks.push(text);
      },
      confirm: () => true,
    };

    const run = await runCodingTuiTask({
      root,
      model: TEST_MODEL,
      input: "Update README.md.",
      io,
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
    });
    const output = chunks.join("");

    expect(run.workspaceDiffReport?.after.diff).toBe("");
    expect(output).toContain("workspace changes:");
    expect(output).toContain("  modified README.md");
    expect(output).toContain("  untracked notes.txt");
    expect(output).toContain("pre-existing changes:");
    expect(output).toContain("  untracked notes.txt");
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
  args: JsonObject,
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

function git(root: string, args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(stderr || stdout || `git exited with code ${exitCode}`));
    });
  });
}
