import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectWorkspaceDiff } from "../src/index";

describe("@kairos/coding-agent workspace diff", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-workspace-diff-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("returns not_git_repository outside git", async () => {
    const result = await collectWorkspaceDiff({ root });

    expect(result).toMatchObject({
      status: "not_git_repository",
      isGitRepository: false,
      changedFiles: [],
      diff: "",
      diffTruncated: false,
    });
  });

  test("reports a clean git workspace", async () => {
    await git(root, ["init"]);

    const result = await collectWorkspaceDiff({ root });

    expect(result).toMatchObject({
      status: "clean",
      isGitRepository: true,
      changedFiles: [],
      diff: "",
      diffTruncated: false,
    });
    await expect(realpath(result.gitRoot ?? "")).resolves.toBe(
      await realpath(root),
    );
  });

  test("reports modified and untracked files", async () => {
    await createInitialCommit(root);
    await writeFile(join(root, "README.md"), "hello new world\n", "utf8");
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "new.ts"),
      "export const value = 1;\n",
      "utf8",
    );

    const result = await collectWorkspaceDiff({ root });

    expect(result.status).toBe("dirty");
    expect(result.changedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "README.md",
          status: "modified",
        }),
        expect.objectContaining({
          path: "src/new.ts",
          status: "untracked",
        }),
      ]),
    );
    expect(result.diff).toContain("-hello old world");
    expect(result.diff).toContain("+hello new world");
    expect(result.diff).toContain("new file mode");
    expect(result.diff).toContain("+export const value = 1;");
    expect(result.diffTruncated).toBe(false);
  });

  test("includes staged changes in the diff", async () => {
    await createInitialCommit(root);
    await writeFile(join(root, "README.md"), "hello staged world\n", "utf8");
    await git(root, ["add", "README.md"]);

    const result = await collectWorkspaceDiff({ root });

    expect(result.status).toBe("dirty");
    expect(result.changedFiles).toContainEqual(
      expect.objectContaining({
        path: "README.md",
        status: "modified",
      }),
    );
    expect(result.diff).toContain("-hello old world");
    expect(result.diff).toContain("+hello staged world");
  });
});

async function createInitialCommit(root: string): Promise<void> {
  await git(root, ["init"]);
  await writeFile(join(root, "README.md"), "hello old world\n", "utf8");
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
