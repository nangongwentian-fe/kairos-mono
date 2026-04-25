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
  createListDirTool,
  type ListDirResult,
} from "../src/index";

describe("@kairos/coding-agent list_dir tool", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-list-dir-root-"));
    outside = await mkdtemp(join(tmpdir(), "kairos-list-dir-outside-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test("lists entries inside the root", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "hello kairos\n", "utf8");
    const tool = createListDirTool({ root });

    const result = parseListDirResult(await tool.execute({ path: "." }));

    expect(result).toEqual({
      path: ".",
      entries: [
        {
          name: "README.md",
          path: "README.md",
          type: "file",
        },
        {
          name: "src",
          path: "src",
          type: "directory",
        },
      ],
    });
  });

  test("lists nested directories with workspace-relative paths", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "index.ts"), "export {};\n", "utf8");
    const tool = createListDirTool({ root });

    const result = parseListDirResult(await tool.execute({ path: "src" }));

    expect(result).toEqual({
      path: "src",
      entries: [
        {
          name: "index.ts",
          path: "src/index.ts",
          type: "file",
        },
      ],
    });
  });

  test("reports symlink entries without following them", async () => {
    const secretPath = join(outside, "secret.txt");
    await writeFile(secretPath, "secret", "utf8");
    await symlink(secretPath, join(root, "secret-link.txt"));
    const tool = createListDirTool({ root });

    const result = parseListDirResult(await tool.execute({ path: "." }));

    expect(result.entries).toEqual([
      {
        name: "secret-link.txt",
        path: "secret-link.txt",
        type: "symlink",
      },
    ]);
  });

  test("rejects directories that do not exist", async () => {
    const tool = createListDirTool({ root });

    await expect(tool.execute({ path: "missing" })).rejects.toThrow(
      "Directory not found: missing",
    );
  });

  test("rejects files", async () => {
    await writeFile(join(root, "README.md"), "hello kairos\n", "utf8");
    const tool = createListDirTool({ root });

    await expect(tool.execute({ path: "README.md" })).rejects.toThrow(
      "Path is not a directory: README.md",
    );
  });

  test("rejects relative path escapes", async () => {
    const tool = createListDirTool({ root });

    await expect(tool.execute({ path: "../secret" })).rejects.toThrow(
      "Path escapes workspace root",
    );
  });

  test("rejects absolute path escapes", async () => {
    const tool = createListDirTool({ root });

    await expect(tool.execute({ path: outside })).rejects.toThrow(
      "Path escapes workspace root",
    );
  });

  test("rejects symlink paths that point outside the root", async () => {
    await symlink(outside, join(root, "outside-link"));
    const tool = createListDirTool({ root });

    await expect(tool.execute({ path: "outside-link" })).rejects.toThrow(
      "Path escapes workspace root",
    );
  });
});

function parseListDirResult(value: string): ListDirResult {
  return JSON.parse(value) as ListDirResult;
}
