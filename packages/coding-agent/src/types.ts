import type {
  AgentEventListener,
  AgentRunResult,
  AgentStreamFunction,
  AgentTrace,
  AgentTool,
  AgentToolConfirmation,
} from "@kairos/agent";
import type { JsonValue, Message, Model } from "@kairos/ai";

export interface CodingAgentFileSnapshot {
  path: string;
  mtimeMs: number;
  size: number;
}

export interface CodingAgentFileState {
  readFiles: Map<string, CodingAgentFileSnapshot>;
}

export interface ReadFileToolOptions {
  root: string;
  fileState?: CodingAgentFileState;
}

export interface ReadFileToolArgs extends Record<string, JsonValue> {
  path: string;
}

export interface EditFileToolOptions {
  root: string;
  fileState?: CodingAgentFileState;
}

export interface EditFileToolArgs extends Record<string, JsonValue> {
  path: string;
  oldText: string;
  newText: string;
}

export interface EditFileResult {
  path: string;
  replacements: number;
  diff: string;
}

export interface ListDirToolOptions {
  root: string;
}

export interface ListDirToolArgs extends Record<string, JsonValue> {
  path: string;
}

export type ListDirEntryType = "file" | "directory" | "symlink" | "other";

export interface ListDirEntry {
  name: string;
  path: string;
  type: ListDirEntryType;
}

export interface ListDirResult {
  path: string;
  entries: ListDirEntry[];
}

export interface GrepToolOptions {
  root: string;
  rgPath?: string;
}

export interface GrepToolArgs extends Record<string, JsonValue> {
  pattern: string;
}

export interface GrepMatch {
  file: string;
  line: number;
  text: string;
  isMatch: boolean;
}

export interface GrepResult {
  pattern: string;
  path: string;
  matches: GrepMatch[];
  truncated: boolean;
}

export interface RunCommandToolOptions {
  root: string;
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
}

export interface RunCommandToolArgs extends Record<string, JsonValue> {
  command: string;
}

export interface RunCommandResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface CodingAgentOptions {
  root: string;
  model: Model;
  systemPrompt?: string;
  tools?: readonly AgentTool<any>[];
  maxTurns?: number;
  messages?: readonly Message[];
  stream?: AgentStreamFunction;
  confirmToolCall?: AgentToolConfirmation;
}

export interface RunCodingTaskOptions extends CodingAgentOptions {
  input: string;
  onEvent?: AgentEventListener;
}

export interface RunCodingTaskResult {
  result: AgentRunResult;
  trace: AgentTrace;
}
