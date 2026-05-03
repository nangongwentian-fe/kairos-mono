import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4174;
export const DEFAULT_PROVIDER = "opencode-go";
export const DEFAULT_MODEL_ID = "kimi-k2.6";
export const MAX_INPUT_LENGTH = 12000;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
export const APPROVAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
export const RESOLVED_APPROVAL_CACHE_MS = 60 * 1000;

export const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
export const CLIENT_DIST_DIR = join(APP_DIR, "dist/client");
export const DEFAULT_ROOT = resolve(APP_DIR, "../..");
