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
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEditFileTool,
  type EditFileResult,
} from "../src/index";

describe("@kairos/coding-agent edit_file tool", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-edit-file-root-"));
    outside = await mkdtemp(join(tmpdir(), "kairos-edit-file-outside-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test("replaces exact text inside the root", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
    const tool = createEditFileTool({ root });

    const result = parseEditFileResult(
      await tool.execute({
        path: "README.md",
        oldText: "old",
        newText: "new",
      }),
    );

    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello new world\n",
    );
    expect(result).toEqual({
      path: "README.md",
      replacements: 1,
      diff: expect.stringContaining("-hello old world"),
    });
    expect(result.diff).toContain("+hello new world");
  });

  test("previews the diff without writing the file", async () => {
    await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
    const tool = createEditFileTool({ root });

    const preview = await tool.preview?.({
      path: "README.md",
      oldText: "old",
      newText: "new",
    });

    expect(preview).toContain("-hello old world");
    expect(preview).toContain("+hello new world");
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "hello old world\n",
    );
  });

  test("uses the same validation for preview and execute", async () => {
    await writeFile(join(root, "README.md"), "hello kairos\n", "utf8");
    const tool = createEditFileTool({ root });

    await expect(
      tool.preview?.({
        path: "README.md",
        oldText: "missing",
        newText: "new",
      }),
    ).rejects.toThrow("oldText was not found in README.md.");
  });

  test("allows deleting text with an empty replacement", async () => {
    await writeFile(join(root, "README.md"), "alpha beta gamma\n", "utf8");
    const tool = createEditFileTool({ root });

    const result = parseEditFileResult(
      await tool.execute({
        path: "README.md",
        oldText: " beta",
        newText: "",
      }),
    );

    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "alpha gamma\n",
    );
    expect(result.replacements).toBe(1);
  });

  test("replaces every match when replaceAll is true", async () => {
    await writeFile(join(root, "README.md"), "old one\nold two\n", "utf8");
    const tool = createEditFileTool({ root });

    const result = parseEditFileResult(
      await tool.execute({
        path: "README.md",
        oldText: "old",
        newText: "new",
        replaceAll: true,
      }),
    );

    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "new one\nnew two\n",
    );
    expect(result.replacements).toBe(2);
  });

  test("rejects multiple matches unless replaceAll is true", async () => {
    await writeFile(join(root, "README.md"), "old one\nold two\n", "utf8");
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: "README.md",
        oldText: "old",
        newText: "new",
      }),
    ).rejects.toThrow("oldText matched 2 times in README.md");
  });

  test("rejects missing oldText", async () => {
    await writeFile(join(root, "README.md"), "hello kairos\n", "utf8");
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: "README.md",
        oldText: "missing",
        newText: "new",
      }),
    ).rejects.toThrow("oldText was not found in README.md.");
  });

  test("rejects unchanged replacements", async () => {
    await writeFile(join(root, "README.md"), "hello kairos\n", "utf8");
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: "README.md",
        oldText: "kairos",
        newText: "kairos",
      }),
    ).rejects.toThrow("oldText and newText must be different.");
  });

  test("preserves CRLF line endings when oldText uses LF", async () => {
    await writeFile(join(root, "README.md"), "first\r\nold\r\nlast\r\n", "utf8");
    const tool = createEditFileTool({ root });

    await tool.execute({
      path: "README.md",
      oldText: "old\nlast",
      newText: "new\nlast",
    });

    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe(
      "first\r\nnew\r\nlast\r\n",
    );
  });

  test("rejects files that do not exist", async () => {
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: "missing.md",
        oldText: "old",
        newText: "new",
      }),
    ).rejects.toThrow("File not found: missing.md");
  });

  test("rejects directories", async () => {
    await mkdir(join(root, "src"));
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: "src",
        oldText: "old",
        newText: "new",
      }),
    ).rejects.toThrow("Path is a directory: src");
  });

  test("rejects relative path escapes", async () => {
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: "../secret.txt",
        oldText: "old",
        newText: "new",
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });

  test("rejects absolute path escapes", async () => {
    const secretPath = join(outside, "secret.txt");
    await writeFile(secretPath, "secret", "utf8");
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: secretPath,
        oldText: "secret",
        newText: "new",
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });

  test("rejects symlinks that point outside the root", async () => {
    const secretPath = join(outside, "secret.txt");
    await writeFile(secretPath, "secret", "utf8");
    await symlink(secretPath, join(root, "secret-link.txt"));
    const tool = createEditFileTool({ root });

    await expect(
      tool.execute({
        path: "secret-link.txt",
        oldText: "secret",
        newText: "new",
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });
});

function parseEditFileResult(value: string): EditFileResult {
  return JSON.parse(value) as EditFileResult;
}
