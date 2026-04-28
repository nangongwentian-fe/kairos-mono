import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { devNull } from "node:os";
import type { AgentMiddleware } from "@kairos/agent";
import type {
  CollectWorkspaceDiffOptions,
  WorkspaceChangedFile,
  WorkspaceChangedFileStatus,
  WorkspaceDiffReport,
  WorkspaceDiffResult,
} from "./types.js";

const DEFAULT_MAX_DIFF_BYTES = 200_000;
const DIRTY_REMINDER_FILE_LIMIT = 20;

export async function collectWorkspaceDiff(
  options: CollectWorkspaceDiffOptions,
): Promise<WorkspaceDiffResult> {
  const root = await realpath(options.root);
  const gitPath = options.gitPath ?? "git";
  const includeDiff = options.includeDiff ?? true;
  const maxDiffBytes = options.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
  const repo = await runGit(root, gitPath, ["rev-parse", "--show-toplevel"]);

  if (repo.exitCode !== 0) {
    return {
      root,
      status: "not_git_repository",
      isGitRepository: false,
      changedFiles: [],
      diff: "",
      diffTruncated: false,
    };
  }

  const status = await runGit(root, gitPath, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
  ]);
  if (status.exitCode !== 0) {
    return {
      root,
      gitRoot: repo.stdout.trim(),
      status: "error",
      isGitRepository: true,
      changedFiles: [],
      diff: "",
      diffTruncated: false,
      error: status.stderr || status.stdout || "git status failed",
    };
  }

  const changedFiles = parseGitStatus(status.stdout);
  const { value: diff, truncated: diffTruncated } = includeDiff
    ? truncateText(
        (await collectDiffParts(root, gitPath, changedFiles))
          .filter(Boolean)
          .join("\n"),
        maxDiffBytes,
      )
    : { value: "", truncated: false };

  return {
    root,
    gitRoot: repo.stdout.trim(),
    status: changedFiles.length > 0 ? "dirty" : "clean",
    isGitRepository: true,
    changedFiles,
    diff,
    diffTruncated,
  };
}

export function createWorkspaceDiffReport(
  before: WorkspaceDiffResult,
  after: WorkspaceDiffResult,
): WorkspaceDiffReport {
  return {
    before,
    after,
    hadPreExistingChanges: before.status === "dirty",
    preExistingChangedFiles: [...before.changedFiles],
  };
}

export function createWorkspaceDirtyReminderMiddleware(
  before: WorkspaceDiffResult,
): AgentMiddleware {
  const reminder = formatWorkspaceDirtyReminder(before);

  return {
    name: "kairos.workspace-dirty-reminder",
    beforeModelRequest(request, context) {
      if (!reminder || context.turn !== 1) {
        return;
      }

      return {
        ...request,
        systemPrompt: appendSystemPrompt(request.systemPrompt, reminder),
      };
    },
  };
}

async function collectDiffParts(
  root: string,
  gitPath: string,
  changedFiles: readonly WorkspaceChangedFile[],
): Promise<string[]> {
  const parts: string[] = [];
  const unstaged = await runGit(root, gitPath, [
    "diff",
    "--no-ext-diff",
    "--binary",
    "--",
    ".",
  ]);
  if (unstaged.stdout) {
    parts.push(unstaged.stdout);
  }

  const staged = await runGit(root, gitPath, [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--binary",
    "--",
    ".",
  ]);
  if (staged.stdout) {
    parts.push(staged.stdout);
  }

  for (const file of changedFiles) {
    if (file.status !== "untracked") {
      continue;
    }
    const untracked = await runGit(root, gitPath, [
      "diff",
      "--no-index",
      "--",
      devNull,
      file.path,
    ]);
    if (
      (untracked.exitCode === 0 || untracked.exitCode === 1) &&
      untracked.stdout
    ) {
      parts.push(untracked.stdout);
    }
  }

  return parts;
}

function parseGitStatus(output: string): WorkspaceChangedFile[] {
  const entries = output.split("\0").filter(Boolean);
  const files: WorkspaceChangedFile[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) {
      continue;
    }

    const rawStatus = entry.slice(0, 2);
    const path = toPosixPath(entry.slice(3));
    let oldPath: string | undefined;
    if (rawStatus.includes("R") || rawStatus.includes("C")) {
      const nextEntry = entries[index + 1];
      oldPath = nextEntry ? toPosixPath(nextEntry) : undefined;
      index += 1;
    }

    files.push({
      path,
      oldPath,
      status: mapGitStatus(rawStatus),
      rawStatus,
    });
  }

  return files;
}

function mapGitStatus(rawStatus: string): WorkspaceChangedFileStatus {
  if (rawStatus.includes("?")) {
    return "untracked";
  }
  if (rawStatus.includes("R")) {
    return "renamed";
  }
  if (rawStatus.includes("C")) {
    return "copied";
  }
  if (rawStatus.includes("D")) {
    return "deleted";
  }
  if (rawStatus.includes("A")) {
    return "added";
  }
  if (rawStatus.includes("M")) {
    return "modified";
  }

  return "unknown";
}

function truncateText(
  value: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) {
    return { value, truncated: false };
  }

  let truncated = value.slice(0, maxBytes);
  while (Buffer.byteLength(truncated, "utf8") > maxBytes) {
    truncated = truncated.slice(0, -1);
  }

  return { value: truncated, truncated: true };
}

function runGit(
  cwd: string,
  gitPath: string,
  args: readonly string[],
): Promise<GitCommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(gitPath, args, {
      cwd,
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
    child.on("error", (error) => {
      resolvePromise({
        exitCode: 1,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
      });
    });
    child.on("close", (exitCode) => {
      resolvePromise({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function formatWorkspaceDirtyReminder(
  before: WorkspaceDiffResult,
): string | undefined {
  if (before.status !== "dirty" || before.changedFiles.length === 0) {
    return undefined;
  }

  const files = before.changedFiles
    .slice(0, DIRTY_REMINDER_FILE_LIMIT)
    .map(formatChangedFile);
  const remaining = before.changedFiles.length - files.length;

  return [
    "Workspace note: before this task started, the git workspace already had changes.",
    "Treat these as pre-existing user changes. Do not overwrite or take credit for them unless the task explicitly requires it.",
    "Pre-existing changed files:",
    ...files,
    remaining > 0 ? `- ...and ${remaining} more file(s).` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function formatChangedFile(file: WorkspaceChangedFile): string {
  const status = file.rawStatus.trim() || file.status;
  const path = file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path;
  return `- ${status} ${path}`;
}

function appendSystemPrompt(
  systemPrompt: string | undefined,
  reminder: string,
): string {
  return systemPrompt ? `${systemPrompt}\n\n${reminder}` : reminder;
}

interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
