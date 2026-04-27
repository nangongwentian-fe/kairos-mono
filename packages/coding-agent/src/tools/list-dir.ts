import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { AgentTool } from "@kairos/agent";
import type {
  ListDirEntry,
  ListDirEntryType,
  ListDirResult,
  ListDirToolArgs,
  ListDirToolOptions,
} from "../types.js";
import { resolveExistingPathInsideRoot, toToolPath } from "./path.js";

export function createListDirTool(
  options: ListDirToolOptions,
): AgentTool<ListDirToolArgs> {
  return {
    name: "list_dir",
    risk: "read",
    description:
      "List entries in a directory inside the configured workspace root. Input must be an object with a path string, for example {\"path\":\".\"}.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path to list. Relative paths are resolved from the workspace root. Use \".\" for the workspace root.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const { root, target } = await resolveExistingPathInsideRoot(
        options.root,
        args.path,
        `Directory not found: ${args.path}`,
      );

      const targetStat = await stat(target);
      if (!targetStat.isDirectory()) {
        throw new Error(`Path is not a directory: ${args.path}`);
      }

      const entries = (await readdir(target, { withFileTypes: true }))
        .map((entry) => toListDirEntry(root, target, entry))
        .sort((a, b) => a.name.localeCompare(b.name));
      const result: ListDirResult = {
        path: toToolPath(relative(root, target)),
        entries,
      };

      return JSON.stringify(result, null, 2);
    },
  };
}

function toListDirEntry(
  root: string,
  directory: string,
  entry: Dirent,
): ListDirEntry {
  const absolutePath = resolve(directory, entry.name);
  return {
    name: entry.name,
    path: toToolPath(relative(root, absolutePath)),
    type: getDirEntryType(entry),
  };
}

function getDirEntryType(entry: Dirent): ListDirEntryType {
  if (entry.isFile()) {
    return "file";
  }
  if (entry.isDirectory()) {
    return "directory";
  }
  if (entry.isSymbolicLink()) {
    return "symlink";
  }

  return "other";
}
