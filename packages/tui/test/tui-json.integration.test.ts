import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import type { TuiJsonEvent } from "../src/index";

const hasOpenCodeApiKey = Boolean(process.env.OPENCODE_API_KEY);
const maybeTest = hasOpenCodeApiKey ? test : test.skip;
const TEST_TIMEOUT_MS = 90_000;

describe("@kairos/tui JSON integration", () => {
  maybeTest(
    "streams todo_update and run_end from a real opencode-go CLI run",
    async () => {
      const events = await runJsonCli([
        "--json",
        "--root",
        repoRoot(),
        [
          "你是 Kairos TUI JSON 集成测试。",
          "必须先调用 todo_write 制定三步计划。",
          '然后调用 read_file 读取 "README.md"。',
          "读取成功后可以再次调用 todo_write 更新进度。",
          "最后用一句中文回答，必须包含 KAIROS_TUI_JSON_SMOKE。",
          "不要调用 edit_file 或 run_command。",
        ].join(" "),
      ]);

      expect(events.some((event) => event.type === "run_start")).toBe(true);
      expect(events.some((event) => event.type === "todo_update")).toBe(true);
      expect(
        events.some(
          (event) => event.type === "tool_end" && event.name === "read_file",
        ),
      ).toBe(true);
      expect(events.at(-1)).toMatchObject({
        type: "run_end",
        stopReason: "end_turn",
      });
    },
    TEST_TIMEOUT_MS,
  );
});

async function runJsonCli(args: readonly string[]): Promise<TuiJsonEvent[]> {
  const { stdout, stderr, exitCode } = await runCliProcess(args);
  if (exitCode !== 0) {
    throw new Error(
      `CLI exited with code ${exitCode}.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TuiJsonEvent);
}

function runCliProcess(args: readonly string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolveProcess, reject) => {
    const root = repoRoot();
    const child = spawn(process.execPath, [join(root, "packages/tui/src/cli.ts"), ...args], {
      cwd: root,
      env: process.env,
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
      resolveProcess({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}
