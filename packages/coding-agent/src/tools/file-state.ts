import type { Stats } from "node:fs";
import { relative } from "node:path";
import type { CodingAgentFileState } from "../types.js";
import { toToolPath } from "./path.js";

export function createCodingAgentFileState(): CodingAgentFileState {
  return {
    readFiles: new Map(),
  };
}

export function recordReadFile(
  fileState: CodingAgentFileState | undefined,
  root: string,
  target: string,
  targetStat: Stats,
): void {
  if (!fileState) {
    return;
  }

  fileState.readFiles.set(target, {
    path: toToolPath(relative(root, target)),
    mtimeMs: targetStat.mtimeMs,
    size: targetStat.size,
  });
}

export function assertFileCanBeEdited(
  fileState: CodingAgentFileState | undefined,
  target: string,
  targetStat: Stats,
  requestedPath: string,
): void {
  if (!fileState) {
    return;
  }

  const snapshot = fileState.readFiles.get(target);
  if (!snapshot) {
    throw new Error(
      `File must be read with read_file before edit_file: ${requestedPath}`,
    );
  }

  if (snapshot.mtimeMs !== targetStat.mtimeMs || snapshot.size !== targetStat.size) {
    throw new Error(
      `File changed since it was read. Read it again before edit_file: ${snapshot.path}`,
    );
  }
}
