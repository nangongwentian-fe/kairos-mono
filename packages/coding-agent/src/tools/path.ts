import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export async function resolveExistingPathInsideRoot(
  rootPath: string,
  requestedPath: string,
  notFoundMessage: string,
): Promise<{ root: string; target: string }> {
  const root = await realpath(rootPath);
  const candidate = resolveCandidatePath(root, requestedPath);
  assertInsideRoot(root, candidate);

  const target = await realpath(candidate).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(notFoundMessage);
    }
    throw error;
  });
  assertInsideRoot(root, target);

  return { root, target };
}

export function assertInsideRoot(root: string, target: string): void {
  const relativePath = relative(root, target);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes workspace root: ${target}`);
  }
}

export function toToolPath(relativePath: string): string {
  if (relativePath === "") {
    return ".";
  }

  return relativePath.split(sep).join("/");
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
