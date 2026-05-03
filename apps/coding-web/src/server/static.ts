import { extname, isAbsolute, relative, resolve } from "node:path";
import { CLIENT_DIST_DIR } from "./config.js";

export async function serveClientFile(
  pathname: string,
): Promise<Response | undefined> {
  let relativePath: string;
  try {
    relativePath =
      pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
    return undefined;
  }

  if (!relativePath || relativePath.includes("\0")) {
    return undefined;
  }

  const filename = resolve(CLIENT_DIST_DIR, relativePath);
  const safeRelative = relative(CLIENT_DIST_DIR, filename);
  if (safeRelative.startsWith("..") || isAbsolute(safeRelative)) {
    return undefined;
  }

  const file = Bun.file(filename);
  if (!(await file.exists())) {
    return undefined;
  }

  return new Response(file, {
    headers: {
      "Content-Type": getContentType(filename),
    },
  });
}

function getContentType(filename: string): string {
  switch (extname(filename)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
