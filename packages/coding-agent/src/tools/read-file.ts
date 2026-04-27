import { readFile, stat } from "node:fs/promises";
import type { AgentTool } from "@kairos/agent";
import type { ReadFileToolArgs, ReadFileToolOptions } from "../types.js";
import { recordReadFile } from "./file-state.js";
import { resolveExistingPathInsideRoot } from "./path.js";

export function createReadFileTool(
  options: ReadFileToolOptions,
): AgentTool<ReadFileToolArgs> {
  return {
    name: "read_file",
    risk: "read",
    description:
      "Read a UTF-8 text file inside the configured workspace root. Input must be an object with a path string.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "File path to read. Relative paths are resolved from the workspace root.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const { root, target } = await resolveExistingPathInsideRoot(
        options.root,
        args.path,
        `File not found: ${args.path}`,
      );

      const targetStat = await stat(target);
      if (targetStat.isDirectory()) {
        throw new Error(`Path is a directory: ${args.path}`);
      }
      if (!targetStat.isFile()) {
        throw new Error(`Path is not a regular file: ${args.path}`);
      }

      const content = await readFile(target, "utf8");
      recordReadFile(options.fileState, root, target, targetStat);
      return content;
    },
  };
}
