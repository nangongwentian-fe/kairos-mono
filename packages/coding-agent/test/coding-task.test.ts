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

  test("optionally returns a workspace diff", async () => {
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

    const run = await runCodingTask({
      root,
      model: TEST_MODEL,
      input: "Update README.md.",
      recordWorkspaceDiff: true,
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
      confirmToolCall: () => true,
    });

    expect(run.workspaceDiffReport).toMatchObject({
      hadPreExistingChanges: false,
      before: {
        status: "clean",
        isGitRepository: true,
        changedFiles: [],
      },
      after: {
        status: "dirty",
        isGitRepository: true,
      },
      preExistingChangedFiles: [],
    });
    expect(run.workspaceDiffReport?.after).toBe(run.workspaceDiff);
    expect(run.workspaceDiff).toMatchObject({
      status: "dirty",
      isGitRepository: true,
      changedFiles: [
        expect.objectContaining({
          path: "README.md",
          status: "modified",
        }),
      ],
      diffTruncated: false,
    });
    expect(run.workspaceDiff?.diff).toContain("-hello old world");
    expect(run.workspaceDiff?.diff).toContain("+hello new world");
  });

  test("records pre-existing workspace changes and reminds the model", async () => {
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

    let firstRequest: ModelRequest | undefined;
    const run = await runCodingTask({
      root,
      model: TEST_MODEL,
      input: "Inspect the workspace.",
      recordWorkspaceDiff: true,
      stream: (_model, request) => {
        firstRequest = request;
        return createModelStream(createTextResponse("inspected"));
      },
    });

    expect(run.workspaceDiffReport).toMatchObject({
      hadPreExistingChanges: true,
      before: {
        status: "dirty",
        isGitRepository: true,
        changedFiles: [
          expect.objectContaining({
            path: "notes.txt",
            status: "untracked",
          }),
        ],
      },
      preExistingChangedFiles: [
        expect.objectContaining({
          path: "notes.txt",
          status: "untracked",
        }),
      ],
    });
    expect(run.workspaceDiffReport?.after).toBe(run.workspaceDiff);
    expect(firstRequest?.systemPrompt).toContain(
      "the git workspace already had changes",
    );
    expect(firstRequest?.systemPrompt).toContain("notes.txt");
  });

  test("reminds the model about pre-existing changes by default", async () => {
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

    let firstRequest: ModelRequest | undefined;
    const run = await runCodingTask({
      root,
      model: TEST_MODEL,
      input: "Inspect the workspace.",
      stream: (_model, request) => {
        firstRequest = request;
        return createModelStream(createTextResponse("inspected"));
      },
    });

    expect(run.workspaceDiff).toBeUndefined();
    expect(run.workspaceDiffReport).toBeUndefined();
    expect(firstRequest?.systemPrompt).toContain(
      "the git workspace already had changes",
    );
    expect(firstRequest?.systemPrompt).toContain("notes.txt");
  });

  test("can disable the default workspace guard", async () => {
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

    let firstRequest: ModelRequest | undefined;
    await runCodingTask({
      root,
      model: TEST_MODEL,
      input: "Inspect the workspace.",
      workspaceGuard: false,
      stream: (_model, request) => {
        firstRequest = request;
        return createModelStream(createTextResponse("inspected"));
      },
    });

    expect(firstRequest?.systemPrompt).not.toContain(
      "the git workspace already had changes",
    );
    expect(firstRequest?.systemPrompt).not.toContain("notes.txt");
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
