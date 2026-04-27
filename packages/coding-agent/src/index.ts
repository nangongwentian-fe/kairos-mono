export const KAIROS_CODING_AGENT_PACKAGE = "@kairos/coding-agent";

export {
  DEFAULT_CODING_AGENT_SYSTEM_PROMPT,
  createCodingAgent,
} from "./agent.js";
export {
  CODING_RUN_RECORD_VERSION,
  createCodingRunRecord,
  formatCodingRunRecordModel,
  writeCodingRunRecord,
} from "./run-record.js";
export { runCodingTask } from "./task.js";
export {
  createCodingAgentFileState,
  createEditFileTool,
  createGrepTool,
  createListDirTool,
  createReadFileTool,
  createRunCommandTool,
} from "./tools/index.js";
export type {
  CodingAgentFileSnapshot,
  CodingAgentFileState,
  CodingAgentOptions,
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
} from "./types.js";
export type {
  CodingRunRecord,
  CreateCodingRunRecordOptions,
} from "./run-record.js";
