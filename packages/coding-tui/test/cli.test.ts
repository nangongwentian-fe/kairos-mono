import { describe, expect, test } from "bun:test";

import type { RunCodingTaskResult } from "@kairos/coding-agent";
import {
  createTuiCliHelp,
  formatPrintOutput,
  parseTuiCliArgs,
  resolveTuiCliInput,
} from "../src/cli";

describe("@kairos/coding-tui CLI args", () => {
  test("uses OpenCode Go defaults and current directory root", () => {
    const parsed = parseTuiCliArgs(["Read", "README.md"], {
      cwd: "/repo",
    });

    expect(parsed).toEqual({
      input: "Read README.md",
      modelId: "kimi-k2.6",
      outputMode: "tui",
      readStdin: false,
      recordPath: undefined,
      resumeSessionId: undefined,
      root: "/repo",
      help: false,
    });
  });

  test("parses model and root flags", () => {
    const parsed = parseTuiCliArgs(
      ["--model", "glm-5.1", "--root", "packages/ai", "Run", "tests"],
      { cwd: "/repo" },
    );

    expect(parsed).toEqual({
      input: "Run tests",
      modelId: "glm-5.1",
      outputMode: "tui",
      readStdin: false,
      recordPath: undefined,
      resumeSessionId: undefined,
      root: "/repo/packages/ai",
      help: false,
    });
  });

  test("parses inline flag values", () => {
    const parsed = parseTuiCliArgs(
      ["--model=qwen3.6-plus", "--root=/tmp/project", "Inspect"],
      { cwd: "/repo" },
    );

    expect(parsed).toEqual({
      input: "Inspect",
      modelId: "qwen3.6-plus",
      outputMode: "tui",
      readStdin: false,
      recordPath: undefined,
      resumeSessionId: undefined,
      root: "/tmp/project",
      help: false,
    });
  });

  test("parses print, json, stdin, and record options", () => {
    expect(parseTuiCliArgs(["--print", "-"], { cwd: "/repo" })).toMatchObject({
      outputMode: "print",
      readStdin: true,
    });
    expect(parseTuiCliArgs(["--json", "Inspect"], { cwd: "/repo" })).toMatchObject({
      input: "Inspect",
      outputMode: "json",
      readStdin: false,
    });
    expect(
      parseTuiCliArgs(["--record", ".kairos/runs/last.json", "Inspect"], {
        cwd: "/repo",
      }),
    ).toMatchObject({
      input: "Inspect",
      recordPath: "/repo/.kairos/runs/last.json",
    });
    expect(
      parseTuiCliArgs(["--record=/tmp/run.json", "Inspect"], {
        cwd: "/repo",
      }),
    ).toMatchObject({
      recordPath: "/tmp/run.json",
    });
    expect(
      parseTuiCliArgs(["--resume", "latest"], {
        cwd: "/repo",
      }),
    ).toMatchObject({
      resumeSessionId: "latest",
    });
  });

  test("rejects unknown options and missing values", () => {
    expect(() => parseTuiCliArgs(["--bad"], { cwd: "/repo" })).toThrow(
      "Unknown option: --bad",
    );
    expect(() => parseTuiCliArgs(["--model"], { cwd: "/repo" })).toThrow(
      "Missing value for --model",
    );
    expect(() => parseTuiCliArgs(["--root="], { cwd: "/repo" })).toThrow(
      "Missing value for --root",
    );
    expect(() => parseTuiCliArgs(["--record"], { cwd: "/repo" })).toThrow(
      "Missing value for --record",
    );
    expect(() => parseTuiCliArgs(["--resume"], { cwd: "/repo" })).toThrow(
      "Missing value for --resume",
    );
    expect(() => parseTuiCliArgs(["--print", "--json"], { cwd: "/repo" })).toThrow(
      "--print and --json cannot be used together",
    );
  });

  test("prints the executable bun command in help", () => {
    expect(createTuiCliHelp()).toContain(
      "bun --env-file=.env.local packages/coding-tui/src/cli.ts",
    );
    expect(createTuiCliHelp()).toContain(
      'bun --env-file=.env.local packages/coding-tui/src/cli.ts "task"',
    );
    expect(createTuiCliHelp()).toContain("echo \"task\"");
    expect(createTuiCliHelp()).toContain("--print");
    expect(createTuiCliHelp()).toContain("--json");
    expect(createTuiCliHelp()).toContain("--record");
    expect(createTuiCliHelp()).toContain("--resume");
    expect(createTuiCliHelp()).toContain("Interactive commands");
    expect(createTuiCliHelp()).toContain("/new");
    expect(createTuiCliHelp()).not.toContain("/clear");
    expect(createTuiCliHelp()).toContain("/sessions");
  });

  test("combines piped stdin with optional prompt text", async () => {
    await expect(
      resolveTuiCliInput({ input: "Summarize it.", readStdin: true }, "README text\n"),
    ).resolves.toBe("README text\nSummarize it.");
    await expect(
      resolveTuiCliInput({ input: "No pipe.", readStdin: false }, "ignored"),
    ).resolves.toBe("No pipe.");
  });

  test("formats print mode as final assistant text only", () => {
    const run = {
      result: {
        response: {
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "hello" },
              {
                type: "tool-call",
                call: {
                  id: "call_1",
                  name: "read_file",
                  arguments: { path: "README.md" },
                },
              },
              { type: "text", text: " world" },
            ],
          },
        },
      },
    } as RunCodingTaskResult;

    expect(formatPrintOutput(run)).toBe("hello world\n");
  });
});
