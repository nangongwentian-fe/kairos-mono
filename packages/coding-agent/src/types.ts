import type {
  AgentEventListener,
  AgentMiddleware,
  AgentRunResult,
  AgentStreamFunction,
  AgentTrace,
  AgentToolConfirmation,
  AnyAgentTool,
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

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem extends Record<string, JsonValue> {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface TodoWriteToolArgs extends Record<string, JsonValue> {
  todos: TodoItem[];
}

export interface TodoWriteResult {
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  metadata: {
    todos: TodoItem[];
  };
}

export interface TodoReminderOptions {
  turnsSinceTodoWrite?: number;
  turnsBetweenReminders?: number;
}

export interface CodingToolPolicyOptions {
  protectedPaths?: readonly string[];
  additionalProtectedPaths?: readonly string[];
  additionalBlockedCommandPatterns?: readonly RegExp[];
}

export interface CodingPermissionMiddlewareOptions
  extends CodingToolPolicyOptions {
  root: string;
}

export type WorkspaceChangedFileStatus =
  | "added"
  | "copied"
  | "deleted"
  | "modified"
  | "renamed"
  | "unknown"
  | "untracked";

export interface WorkspaceChangedFile {
  path: string;
  oldPath?: string;
  status: WorkspaceChangedFileStatus;
  rawStatus: string;
}

export type WorkspaceDiffStatus =
  | "clean"
  | "dirty"
  | "error"
  | "not_git_repository";

export interface WorkspaceDiffOptions {
  gitPath?: string;
  includeDiff?: boolean;
  maxDiffBytes?: number;
}

export interface WorkspaceGuardOptions {
  gitPath?: string;
}

export interface CollectWorkspaceDiffOptions extends WorkspaceDiffOptions {
  root: string;
}

export interface WorkspaceDiffResult {
  root: string;
  gitRoot?: string;
  status: WorkspaceDiffStatus;
  isGitRepository: boolean;
  changedFiles: WorkspaceChangedFile[];
  diff: string;
  diffTruncated: boolean;
  error?: string;
}

export interface WorkspaceDiffReport {
  before: WorkspaceDiffResult;
  after: WorkspaceDiffResult;
  hadPreExistingChanges: boolean;
  preExistingChangedFiles: WorkspaceChangedFile[];
}

export interface CodingAgentOptions {
  root: string;
  model: Model;
  systemPrompt?: string;
  tools?: readonly AnyAgentTool[];
  maxTurns?: number;
  messages?: readonly Message[];
  stream?: AgentStreamFunction;
  confirmToolCall?: AgentToolConfirmation;
  middleware?: readonly AgentMiddleware[];
  todoReminder?: false | TodoReminderOptions;
  toolPolicy?: false | CodingToolPolicyOptions;
}

export interface RunCodingTaskOptions extends CodingAgentOptions {
  input: string;
  onEvent?: AgentEventListener;
  recordWorkspaceDiff?: boolean | WorkspaceDiffOptions;
  workspaceGuard?: boolean | WorkspaceGuardOptions;
}

export interface RunCodingTaskResult {
  result: AgentRunResult;
  trace: AgentTrace;
  workspaceDiff?: WorkspaceDiffResult;
  workspaceDiffReport?: WorkspaceDiffReport;
}
