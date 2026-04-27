import { readFile, stat, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import type { AgentTool } from "@kairos/agent";
import type {
  EditFileResult,
  EditFileToolArgs,
  EditFileToolOptions,
} from "../types.js";
import {
  getOptionalBoolean,
  getRequiredString,
  getString,
} from "./args.js";
import { createUnifiedDiff } from "./diff.js";
import { assertFileCanBeEdited, recordReadFile } from "./file-state.js";
import { resolveExistingPathInsideRoot, toToolPath } from "./path.js";

export function createEditFileTool(
  options: EditFileToolOptions,
): AgentTool<EditFileToolArgs> {
  return {
    name: "edit_file",
    risk: "write",
    description:
      "Edit an existing UTF-8 text file inside the configured workspace root by replacing exact text. Input must include path, oldText, newText, and optional replaceAll.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "File path to edit. Relative paths are resolved from the workspace root.",
        },
        oldText: {
          type: "string",
          description:
            "Exact text to replace. It must exist in the file. Multiple matches require replaceAll=true.",
        },
        newText: {
          type: "string",
          description:
            "Replacement text. Use an empty string to delete oldText.",
        },
        replaceAll: {
          type: "boolean",
          description:
            "Replace every occurrence of oldText. Defaults to false.",
        },
      },
      required: ["path", "oldText", "newText"],
      additionalProperties: false,
    },
    preview: async (args) => {
      const plan = await createEditFilePlan(options, args);
      return plan.diff;
    },
    execute: async (args) => {
      const plan = await createEditFilePlan(options, args);
      await writeFile(plan.target, plan.after, "utf8");

      recordReadFile(
        options.fileState,
        plan.root,
        plan.target,
        await stat(plan.target),
      );
      const result: EditFileResult = {
        path: plan.path,
        replacements: plan.replacements,
        diff: plan.diff,
      };

      return JSON.stringify(result, null, 2);
    },
  };
}

interface EditFilePlan {
  root: string;
  target: string;
  path: string;
  after: string;
  replacements: number;
  diff: string;
}

async function createEditFilePlan(
  options: EditFileToolOptions,
  args: EditFileToolArgs,
): Promise<EditFilePlan> {
  const filePath = getRequiredString(args, "path");
  const oldText = getRequiredString(args, "oldText");
  const newText = getString(args, "newText");
  const replaceAll = getOptionalBoolean(args, "replaceAll");
  if (oldText === newText) {
    throw new Error("oldText and newText must be different.");
  }

  const { root, target } = await resolveExistingPathInsideRoot(
    options.root,
    filePath,
    `File not found: ${filePath}`,
  );
  const targetStat = await stat(target);
  if (targetStat.isDirectory()) {
    throw new Error(`Path is a directory: ${filePath}`);
  }
  if (!targetStat.isFile()) {
    throw new Error(`Path is not a regular file: ${filePath}`);
  }

  assertFileCanBeEdited(options.fileState, target, targetStat, filePath);

  const before = await readFile(target, "utf8");
  const normalizedOldText = normalizeEditTextLineEndings(oldText, before);
  const normalizedNewText = normalizeEditTextLineEndings(newText, before);
  const occurrences = countOccurrences(before, normalizedOldText);
  if (occurrences === 0) {
    throw new Error(`oldText was not found in ${filePath}.`);
  }
  if (occurrences > 1 && !replaceAll) {
    throw new Error(
      `oldText matched ${occurrences} times in ${filePath}. Set replaceAll=true to replace every match.`,
    );
  }

  const after = replaceAll
    ? before.split(normalizedOldText).join(normalizedNewText)
    : before.replace(normalizedOldText, normalizedNewText);
  const relativePath = toToolPath(relative(root, target));

  return {
    root,
    target,
    path: relativePath,
    after,
    replacements: replaceAll ? occurrences : 1,
    diff: createUnifiedDiff(relativePath, before, after),
  };
}

function normalizeEditTextLineEndings(value: string, fileContent: string): string {
  if (!fileContent.includes("\r\n")) {
    return value;
  }

  return value.replace(/\r?\n/g, "\r\n");
}

function countOccurrences(value: string, search: string): number {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    const matchIndex = value.indexOf(search, index);
    if (matchIndex === -1) {
      break;
    }

    count += 1;
    index = matchIndex + search.length;
  }

  return count;
}
