import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRunCommandTool,
  type RunCommandResult,
} from "../src/index";

describe("@kairos/coding-agent run_command tool", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-run-command-root-"));
    outside = await mkdtemp(join(tmpdir(), "kairos-run-command-outside-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test("runs a command in the workspace root without a shell", async () => {
    const tool = createRunCommandTool({ root });

    const result = parseRunCommandResult(
      await tool.execute({
        command: process.execPath,
        args: [
          "-e",
          "console.log('hello stdout'); console.error('hello stderr');",
        ],
      }),
    );

    expect(result).toMatchObject({
      command: process.execPath,
      args: [
        "-e",
        "console.log('hello stdout'); console.error('hello stderr');",
      ],
      cwd: ".",
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "hello stdout\n",
      stderr: "hello stderr\n",
      stdoutTruncated: false,
      stderrTruncated: false,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("previews the command without executing it", async () => {
    const marker = join(root, "marker.txt");
    const tool = createRunCommandTool({ root });

    const preview = await tool.preview?.({
      command: process.execPath,
      args: ["-e", `Bun.write(${JSON.stringify(marker)}, "created")`],
    });

    expect(preview).toContain(process.execPath);
    await expect(Bun.file(marker).exists()).resolves.toBe(false);
  });

  test("runs commands from a nested cwd inside the root", async () => {
    await mkdir(join(root, "src"));
    const tool = createRunCommandTool({ root });

    const result = parseRunCommandResult(
      await tool.execute({
        command: process.execPath,
        args: ["-e", "console.log(process.cwd().endsWith('/src'))"],
        cwd: "src",
      }),
    );

    expect(result.cwd).toBe("src");
    expect(result.stdout).toBe("true\n");
  });

  test("rejects cwd path escapes", async () => {
    const tool = createRunCommandTool({ root });

    await expect(
      tool.execute({
        command: process.execPath,
        args: ["--version"],
        cwd: "../outside",
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });

  test("rejects symlink cwd paths that point outside the root", async () => {
    await symlink(outside, join(root, "outside-link"));
    const tool = createRunCommandTool({ root });

    await expect(
      tool.execute({
        command: process.execPath,
        args: ["--version"],
        cwd: "outside-link",
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });

  test("rejects file cwd paths", async () => {
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const tool = createRunCommandTool({ root });

    await expect(
      tool.execute({
        command: process.execPath,
        args: ["--version"],
        cwd: "README.md",
      }),
    ).rejects.toThrow("Working directory is not a directory: README.md");
  });

  test("caps timeoutMs and marks timed out commands", async () => {
    const tool = createRunCommandTool({
      root,
      defaultTimeoutMs: 10,
      maxTimeoutMs: 10,
    });

    const result = parseRunCommandResult(
      await tool.execute({
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 1000)"],
        timeoutMs: 1000,
      }),
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(null);
    expect(result.signal).toBe("SIGTERM");
  });

  test("truncates stdout and stderr independently", async () => {
    const tool = createRunCommandTool({ root, maxOutputBytes: 8 });

    const result = parseRunCommandResult(
      await tool.execute({
        command: process.execPath,
        args: [
          "-e",
          "console.log('stdout-123456789'); console.error('stderr-123456789');",
        ],
      }),
    );

    expect(result.stdout).toBe("3456789\n");
    expect(result.stderr).toBe("3456789\n");
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(true);
  });

  test("rejects non-string args", async () => {
    const tool = createRunCommandTool({ root });

    await expect(
      tool.execute({
        command: process.execPath,
        args: ["--version", 1],
      }),
    ).rejects.toThrow("args must be an array of strings.");
  });
});

function parseRunCommandResult(value: string): RunCommandResult {
  return JSON.parse(value) as RunCommandResult;
}
