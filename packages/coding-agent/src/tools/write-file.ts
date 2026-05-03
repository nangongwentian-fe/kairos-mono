import type { Stats } from "node:fs";
import {
  lstat,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { AgentTool } from "@kairos/agent";
import type {
  WriteFileResult,
  WriteFileToolArgs,
  WriteFileToolOptions,
} from "../types.js";
import {
  getOptionalBoolean,
  getRequiredString,
  getString,
} from "./args.js";
import { createUnifiedDiff } from "./diff.js";
import { assertFileCanBeEdited, recordReadFile } from "./file-state.js";
import { assertInsideRoot, toToolPath } from "./path.js";

export function createWriteFileTool(
  options: WriteFileToolOptions,
): AgentTool<WriteFileToolArgs> {
  return {
    name: "write_file",
    risk: "write",
    description:
      "Create a new UTF-8 text file inside the configured workspace root, or overwrite an existing file when overwrite=true. Prefer edit_file for targeted changes to existing files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "File path to write. Relative paths are resolved from the workspace root.",
        },
        content: {
          type: "string",
          description: "Full UTF-8 file content to write.",
        },
        overwrite: {
          type: "boolean",
          description:
            "Overwrite an existing file. Defaults to false. Existing files must be read with read_file first.",
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    preview: async (args) => {
      const plan = await createWriteFilePlan(options, args);
      return plan.diff;
    },
    execute: async (args) => {
      const plan = await createWriteFilePlan(options, args);
      await writeFile(plan.target, plan.content, "utf8");

      recordReadFile(
        options.fileState,
        plan.root,
        plan.target,
        await stat(plan.target),
      );

      const result: WriteFileResult = {
        path: plan.path,
        operation: plan.operation,
        bytes: new TextEncoder().encode(plan.content).byteLength,
        diff: plan.diff,
      };

      return JSON.stringify(result, null, 2);
    },
  };
}

interface WriteFilePlan {
  root: string;
  target: string;
  path: string;
  content: string;
  operation: WriteFileResult["operation"];
  diff: string;
}

async function createWriteFilePlan(
  options: WriteFileToolOptions,
  args: WriteFileToolArgs,
): Promise<WriteFilePlan> {
  const filePath = getRequiredString(args, "path");
  const content = getString(args, "content");
  const overwrite = getOptionalBoolean(args, "overwrite");
  const root = await realpath(options.root);
  const candidate = resolveCandidatePath(root, filePath);
  assertInsideRoot(root, candidate);

  const targetInfo = await resolveWriteTarget(root, candidate, filePath);
  let before = "";
  let operation: WriteFileResult["operation"] = "create";
  let target = candidate;

  if (targetInfo.exists) {
    target = targetInfo.target;
    assertWritableFile(targetInfo.stat, filePath);
    if (!overwrite) {
      throw new Error(
        `File already exists: ${filePath}. Set overwrite=true to replace it.`,
      );
    }

    assertFileCanBeEdited(
      options.fileState,
      target,
      targetInfo.stat,
      filePath,
      "write_file",
    );
    before = await readFile(target, "utf8");
    if (before === content) {
      throw new Error(`File content is unchanged: ${filePath}`);
    }
    operation = "update";
  } else {
    await assertParentDirectoryInsideRoot(root, candidate, filePath);
  }

  const relativePath = toToolPath(relative(root, target));
  return {
    root,
    target,
    path: relativePath,
    content,
    operation,
    diff: createUnifiedDiff(relativePath, before, content),
  };
}

interface WriteTargetInfo {
  exists: true;
  target: string;
  stat: Stats;
}

async function resolveWriteTarget(
  root: string,
  target: string,
  requestedPath: string,
): Promise<WriteTargetInfo | { exists: false; target: string }> {
  const targetLinkStat = await lstat(target).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!targetLinkStat) {
    return { exists: false, target };
  }

  if (targetLinkStat.isSymbolicLink()) {
    const realTarget = await realpath(target).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error(`Path is a broken symlink: ${requestedPath}`);
      }
      throw error;
    });
    assertInsideRoot(root, realTarget);
    return {
      exists: true,
      target: realTarget,
      stat: await stat(realTarget),
    };
  }

  return {
    exists: true,
    target,
    stat: await stat(target),
  };
}

function assertWritableFile(targetStat: Stats, requestedPath: string): void {
  if (targetStat.isDirectory()) {
    throw new Error(`Path is a directory: ${requestedPath}`);
  }
  if (!targetStat.isFile()) {
    throw new Error(`Path is not a regular file: ${requestedPath}`);
  }
}

async function assertParentDirectoryInsideRoot(
  root: string,
  target: string,
  requestedPath: string,
): Promise<void> {
  const parent = dirname(target);
  const resolvedParent = await realpath(parent).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Parent directory not found: ${requestedPath}`);
    }
    throw error;
  });
  assertInsideRoot(root, resolvedParent);

  const parentStat = await stat(resolvedParent);
  if (!parentStat.isDirectory()) {
    throw new Error(`Parent path is not a directory: ${requestedPath}`);
  }
}

function resolveCandidatePath(root: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    return resolve(filePath);
  }

  return resolve(root, filePath);
}

interface NodeError extends Error {
  code?: string;
}

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error && "code" in error;
}
