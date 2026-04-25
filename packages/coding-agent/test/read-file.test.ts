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
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createReadFileTool } from "../src/index";

describe("@kairos/coding-agent read_file tool", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-read-file-root-"));
    outside = await mkdtemp(join(tmpdir(), "kairos-read-file-outside-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test("reads a text file inside the root", async () => {
    await writeFile(join(root, "README.md"), "hello kairos\n", "utf8");
    const tool = createReadFileTool({ root });

    await expect(tool.execute({ path: "README.md" })).resolves.toBe(
      "hello kairos\n",
    );
  });

  test("rejects files that do not exist", async () => {
    const tool = createReadFileTool({ root });

    await expect(tool.execute({ path: "missing.md" })).rejects.toThrow(
      "File not found: missing.md",
    );
  });

  test("rejects directories", async () => {
    await mkdir(join(root, "src"));
    const tool = createReadFileTool({ root });

    await expect(tool.execute({ path: "src" })).rejects.toThrow(
      "Path is a directory: src",
    );
  });

  test("rejects relative path escapes", async () => {
    const tool = createReadFileTool({ root });

    await expect(tool.execute({ path: "../secret.txt" })).rejects.toThrow(
      "Path escapes workspace root",
    );
  });

  test("rejects absolute path escapes", async () => {
    const secretPath = join(outside, "secret.txt");
    await writeFile(secretPath, "secret", "utf8");
    const tool = createReadFileTool({ root });

    await expect(tool.execute({ path: secretPath })).rejects.toThrow(
      "Path escapes workspace root",
    );
  });

  test("rejects symlinks that point outside the root", async () => {
    const secretPath = join(outside, "secret.txt");
    await writeFile(secretPath, "secret", "utf8");
    await symlink(secretPath, join(root, "secret-link.txt"));
    const tool = createReadFileTool({ root });

    await expect(tool.execute({ path: "secret-link.txt" })).rejects.toThrow(
      "Path escapes workspace root",
    );
  });
});

