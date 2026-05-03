export const KAIROS_CODING_AGENT_PACKAGE = "@kairos/coding-agent";

export {
  DEFAULT_CODING_AGENT_MAX_TURNS,
  DEFAULT_CODING_AGENT_SYSTEM_PROMPT,
  createCodingAgent,
} from "./agent.js";
export { createCodingSession } from "./session.js";
export {
  CODING_RUN_RECORD_VERSION,
  createCodingRunRecord,
  formatCodingRunRecordModel,
  writeCodingRunRecord,
} from "./run-record.js";
export {
  CODING_SESSION_RECORD_VERSION,
  assertSafeCodingSessionId,
  createCodingSessionRecord,
  getCodingSessionRecordPath,
  getDefaultCodingSessionStoreDir,
  listCodingSessionRecords,
  readCodingSessionRecord,
  resolveCodingSessionRecord,
  updateCodingSessionRecord,
  writeCodingSessionRecord,
} from "./session-store.js";
export { runCodingTask } from "./task.js";
export { createCodingPermissionMiddleware } from "./tool-policy.js";
export { collectWorkspaceDiff } from "./workspace-diff.js";
export {
  createCodingAgentFileState,
  createEditFileTool,
  createGrepTool,
  createListDirTool,
  createReadFileTool,
  createRunCommandTool,
  createTodoWriteTool,
  createWriteFileTool,
} from "./tools/index.js";
export type {
  CodingAgentFileSnapshot,
  CodingAgentFileState,
  CodingAgentOptions,
  CodingPermissionMiddlewareOptions,
  CodingSessionRecord,
  CodingSessionRecordModel,
  CodingSessionSummary,
  CodingSession,
  CodingSessionOptions,
  CodingSessionRunOptions,
  CodingToolPolicyOptions,
  CollectWorkspaceDiffOptions,
  EditFileResult,
  EditFileToolArgs,
  EditFileToolOptions,
  GrepMatch,
  GrepResult,
  GrepToolArgs,
  GrepToolOptions,
  ListDirEntry,
  ListDirEntryType,
  ListDirResult,
  ListDirToolArgs,
  ListDirToolOptions,
  RunCommandResult,
  RunCommandToolArgs,
  RunCommandToolOptions,
  RunCodingTaskOptions,
  RunCodingTaskResult,
  ReadFileToolArgs,
  ReadFileToolOptions,
  TodoItem,
  TodoReminderOptions,
  TodoStatus,
  TodoWriteResult,
  TodoWriteToolArgs,
  WriteFileResult,
  WriteFileToolArgs,
  WriteFileToolOptions,
  WorkspaceChangedFile,
  WorkspaceChangedFileStatus,
  WorkspaceDiffOptions,
  WorkspaceDiffReport,
  WorkspaceDiffResult,
  WorkspaceDiffStatus,
  WorkspaceGuardOptions,
} from "./types.js";
export type {
  CodingRunRecord,
  CreateCodingRunRecordOptions,
} from "./run-record.js";
