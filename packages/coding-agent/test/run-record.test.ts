import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentRunResult, AgentTrace } from "@kairos/agent";
import type { Model } from "@kairos/ai";
import type { WorkspaceDiffReport, WorkspaceDiffResult } from "../src/index";
import {
  CODING_RUN_RECORD_VERSION,
  createCodingRunRecord,
  formatCodingRunRecordModel,
  writeCodingRunRecord,
} from "../src/index";

const TEST_MODEL: Model = {
  id: "kimi-k2.6",
  name: "Kimi K2.6",
  provider: "opencode-go",
  api: "openai-completions",
  baseUrl: "https://opencode.ai/zen/go/v1",
  apiKeyEnv: "OPENCODE_API_KEY",
  supportsTools: true,
};

const TEST_RESULT: AgentRunResult = {
  messages: [
    { role: "user", content: "Read README.md" },
    {
      role: "assistant",
      content: [{ type: "text", text: "README summary" }],
    },
  ],
  response: {
    message: {
      role: "assistant",
      content: [{ type: "text", text: "README summary" }],
    },
    stopReason: "end_turn",
  },
  turns: 1,
  stopReason: "end_turn",
};

const TEST_TRACE: AgentTrace = {
  status: "ended",
  input: "Read README.md",
  startedAt: "2026-04-27T00:00:00.000Z",
  endedAt: "2026-04-27T00:00:01.000Z",
  turns: [],
  items: [],
  result: TEST_RESULT,
};

const TEST_WORKSPACE_DIFF: WorkspaceDiffResult = {
  root: "/repo",
  gitRoot: "/repo",
  status: "dirty",
  isGitRepository: true,
  changedFiles: [
    {
      path: "README.md",
      status: "modified",
      rawStatus: " M",
    },
  ],
  diff: "diff --git a/README.md b/README.md\n",
  diffTruncated: false,
};

const TEST_WORKSPACE_DIFF_REPORT: WorkspaceDiffReport = {
  before: {
    root: "/repo",
    gitRoot: "/repo",
    status: "clean",
    isGitRepository: true,
    changedFiles: [],
    diff: "",
    diffTruncated: false,
  },
  after: TEST_WORKSPACE_DIFF,
  hadPreExistingChanges: false,
  preExistingChangedFiles: [],
};

describe("@kairos/coding-agent run records", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  test("creates a versioned record from a coding task result", () => {
    const record = createCodingRunRecord({
      id: "run_1",
      createdAt: new Date("2026-04-27T00:00:02.000Z"),
      root: "/repo",
      model: TEST_MODEL,
      input: "Read README.md",
      trace: TEST_TRACE,
      workspaceDiff: TEST_WORKSPACE_DIFF,
      workspaceDiffReport: TEST_WORKSPACE_DIFF_REPORT,
      result: TEST_RESULT,
    });

    expect(record).toEqual({
      version: CODING_RUN_RECORD_VERSION,
      id: "run_1",
      createdAt: "2026-04-27T00:00:02.000Z",
      root: "/repo",
      model: "opencode-go/kimi-k2.6",
      input: "Read README.md",
      trace: TEST_TRACE,
      workspaceDiff: TEST_WORKSPACE_DIFF,
      workspaceDiffReport: TEST_WORKSPACE_DIFF_REPORT,
      result: TEST_RESULT,
    });
  });

  test("keeps string model names unchanged", () => {
    expect(formatCodingRunRecordModel("custom/model")).toBe("custom/model");
  });

  test("writes records to nested JSON files", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kairos-run-record-"));
    const path = join(tempDir, ".kairos", "runs", "last.json");
    const record = createCodingRunRecord({
      id: "run_2",
      createdAt: "2026-04-27T00:00:03.000Z",
      root: tempDir,
      model: TEST_MODEL,
      input: "Read README.md",
      trace: TEST_TRACE,
      result: TEST_RESULT,
    });

    await writeCodingRunRecord(record, path);

    const saved = await readFile(path, "utf8");
    expect(saved.endsWith("\n")).toBe(true);
    expect(JSON.parse(saved)).toEqual(record);
  });
});
