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
  createGrepTool,
  type GrepResult,
} from "../src/index";

describe("@kairos/coding-agent grep tool", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-grep-root-"));
    outside = await mkdtemp(join(tmpdir(), "kairos-grep-outside-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test("searches file contents inside the root", async () => {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "index.ts"),
      "const token = 'TARGET_TOKEN';\n",
      "utf8",
    );
    const tool = createGrepTool({ root });

    const result = parseGrepResult(
      await tool.execute({ pattern: "TARGET_TOKEN", path: "." }),
    );

    expect(result).toEqual({
      pattern: "TARGET_TOKEN",
      path: ".",
      matches: [
        {
          file: "src/index.ts",
          line: 1,
          text: "const token = 'TARGET_TOKEN';",
          isMatch: true,
        },
      ],
      truncated: false,
    });
  });

  test("filters files with include glob", async () => {
    await writeFile(join(root, "README.md"), "alpha in markdown\n", "utf8");
    await writeFile(join(root, "index.ts"), "alpha in typescript\n", "utf8");
    const tool = createGrepTool({ root });

    const result = parseGrepResult(
      await tool.execute({
        pattern: "alpha",
        path: ".",
        include: "*.ts",
      }),
    );

    expect(result.matches.map((match) => match.file)).toEqual(["index.ts"]);
  });

  test("supports literal and ignore-case search", async () => {
    await writeFile(
      join(root, "example.txt"),
      "foo.bar\nfooXbar\nALPHA\n",
      "utf8",
    );
    const tool = createGrepTool({ root });

    const literalResult = parseGrepResult(
      await tool.execute({
        pattern: "foo.bar",
        path: ".",
        literal: true,
      }),
    );
    const ignoreCaseResult = parseGrepResult(
      await tool.execute({
        pattern: "alpha",
        path: ".",
        ignoreCase: true,
      }),
    );

    expect(literalResult.matches.map((match) => match.line)).toEqual([1]);
    expect(ignoreCaseResult.matches.map((match) => match.line)).toEqual([3]);
  });

  test("returns context lines when requested", async () => {
    await writeFile(
      join(root, "example.txt"),
      "before\nneedle\nafter\n",
      "utf8",
    );
    const tool = createGrepTool({ root });

    const result = parseGrepResult(
      await tool.execute({
        pattern: "needle",
        path: "example.txt",
        context: 1,
      }),
    );

    expect(result.matches).toEqual([
      {
        file: "example.txt",
        line: 1,
        text: "before",
        isMatch: false,
      },
      {
        file: "example.txt",
        line: 2,
        text: "needle",
        isMatch: true,
      },
      {
        file: "example.txt",
        line: 3,
        text: "after",
        isMatch: false,
      },
    ]);
  });

  test("skips noisy generated directories by default", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "index.ts"), "hidden_token\n", "utf8");
    for (const directory of [".git", "node_modules", "dist", "build", "coverage"]) {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, "ignored.txt"), "hidden_token\n", "utf8");
    }
    const tool = createGrepTool({ root });

    const result = parseGrepResult(
      await tool.execute({ pattern: "hidden_token", path: "." }),
    );

    expect(result.matches.map((match) => match.file)).toEqual(["src/index.ts"]);
  });

  test("caps results with maxResults", async () => {
    await writeFile(
      join(root, "example.txt"),
      "alpha one\nalpha two\nalpha three\n",
      "utf8",
    );
    const tool = createGrepTool({ root });

    const result = parseGrepResult(
      await tool.execute({
        pattern: "alpha",
        path: ".",
        maxResults: 2,
      }),
    );

    expect(result.matches.filter((match) => match.isMatch)).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  test("returns an empty match list when nothing matches", async () => {
    await writeFile(join(root, "example.txt"), "omega\n", "utf8");
    const tool = createGrepTool({ root });

    const result = parseGrepResult(
      await tool.execute({ pattern: "alpha", path: "." }),
    );

    expect(result.matches).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  test("rejects path escapes", async () => {
    const tool = createGrepTool({ root });

    await expect(
      tool.execute({ pattern: "secret", path: "../secret" }),
    ).rejects.toThrow("Path escapes workspace root");
  });

  test("rejects symlink paths that point outside the root", async () => {
    await symlink(outside, join(root, "outside-link"));
    const tool = createGrepTool({ root });

    await expect(
      tool.execute({ pattern: "secret", path: "outside-link" }),
    ).rejects.toThrow("Path escapes workspace root");
  });
});

function parseGrepResult(value: string): GrepResult {
  return JSON.parse(value) as GrepResult;
}
