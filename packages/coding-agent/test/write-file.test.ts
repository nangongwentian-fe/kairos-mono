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
  createCodingAgentFileState,
  createReadFileTool,
  createWriteFileTool,
  type WriteFileResult,
} from "../src/index";

describe("@kairos/coding-agent write_file tool", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-write-file-root-"));
    outside = await mkdtemp(join(tmpdir(), "kairos-write-file-outside-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test("creates a new UTF-8 file inside the root", async () => {
    const tool = createWriteFileTool({ root });

    const result = parseWriteFileResult(
      await tool.execute({
        path: "hello.md",
        content: "# Hello\n",
      }),
    );

    await expect(readFile(join(root, "hello.md"), "utf8")).resolves.toBe(
      "# Hello\n",
    );
    expect(result).toEqual({
      path: "hello.md",
      operation: "create",
      bytes: 8,
      diff: expect.stringContaining("+# Hello"),
    });
  });

  test("previews a new file diff without writing", async () => {
    const tool = createWriteFileTool({ root });

    const preview = await tool.preview?.({
      path: "hello.md",
      content: "# Hello\n",
    });

    expect(preview).toContain("+# Hello");
    await expect(readFile(join(root, "hello.md"), "utf8")).rejects.toThrow();
  });

  test("rejects existing files unless overwrite is true", async () => {
    await writeFile(join(root, "README.md"), "old\n", "utf8");
    const tool = createWriteFileTool({ root });

    await expect(
      tool.execute({
        path: "README.md",
        content: "new\n",
      }),
    ).rejects.toThrow("File already exists: README.md");

    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe("old\n");
  });

  test("requires read_file before overwriting an existing file", async () => {
    await writeFile(join(root, "README.md"), "old\n", "utf8");
    const fileState = createCodingAgentFileState();
    const tool = createWriteFileTool({ root, fileState });

    await expect(
      tool.execute({
        path: "README.md",
        content: "new\n",
        overwrite: true,
      }),
    ).rejects.toThrow("File must be read with read_file before write_file");
  });

  test("overwrites an existing file after read_file", async () => {
    await writeFile(join(root, "README.md"), "old\n", "utf8");
    const fileState = createCodingAgentFileState();
    const readTool = createReadFileTool({ root, fileState });
    const writeTool = createWriteFileTool({ root, fileState });

    await readTool.execute({ path: "README.md" });
    const result = parseWriteFileResult(
      await writeTool.execute({
        path: "README.md",
        content: "new\n",
        overwrite: true,
      }),
    );

    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toBe("new\n");
    expect(result.operation).toBe("update");
    expect(result.diff).toContain("-old");
    expect(result.diff).toContain("+new");
  });

  test("rejects overwrite when the file changed after read_file", async () => {
    await writeFile(join(root, "README.md"), "old\n", "utf8");
    const fileState = createCodingAgentFileState();
    const readTool = createReadFileTool({ root, fileState });
    const writeTool = createWriteFileTool({ root, fileState });

    await readTool.execute({ path: "README.md" });
    await writeFile(join(root, "README.md"), "external\n", "utf8");

    await expect(
      writeTool.execute({
        path: "README.md",
        content: "new\n",
        overwrite: true,
      }),
    ).rejects.toThrow("File changed since it was read");
  });

  test("records a newly written file for later edit_file use", async () => {
    const fileState = createCodingAgentFileState();
    const tool = createWriteFileTool({ root, fileState });

    await tool.execute({
      path: "hello.md",
      content: "# Hello\n",
    });

    expect(Array.from(fileState.readFiles.values())).toContainEqual({
      path: "hello.md",
      mtimeMs: expect.any(Number),
      size: 8,
    });
  });

  test("rejects missing parent directories", async () => {
    const tool = createWriteFileTool({ root });

    await expect(
      tool.execute({
        path: "missing/hello.md",
        content: "# Hello\n",
      }),
    ).rejects.toThrow("Parent directory not found: missing/hello.md");
  });

  test("rejects directories", async () => {
    await mkdir(join(root, "src"));
    const tool = createWriteFileTool({ root });

    await expect(
      tool.execute({
        path: "src",
        content: "not a file",
        overwrite: true,
      }),
    ).rejects.toThrow("Path is a directory: src");
  });

  test("rejects relative path escapes", async () => {
    const tool = createWriteFileTool({ root });

    await expect(
      tool.execute({
        path: "../secret.txt",
        content: "secret",
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });

  test("rejects absolute path escapes", async () => {
    const secretPath = join(outside, "secret.txt");
    const tool = createWriteFileTool({ root });

    await expect(
      tool.execute({
        path: secretPath,
        content: "secret",
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });

  test("rejects symlinks that point outside the root", async () => {
    const secretPath = join(outside, "secret.txt");
    await writeFile(secretPath, "secret", "utf8");
    await symlink(secretPath, join(root, "secret-link.txt"));
    const tool = createWriteFileTool({ root });

    await expect(
      tool.execute({
        path: "secret-link.txt",
        content: "new",
        overwrite: true,
      }),
    ).rejects.toThrow("Path escapes workspace root");
  });
});

function parseWriteFileResult(value: string): WriteFileResult {
  return JSON.parse(value) as WriteFileResult;
}
