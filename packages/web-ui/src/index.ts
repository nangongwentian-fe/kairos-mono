export const KAIROS_WEB_UI_PACKAGE = "@kairos/web-ui";

export {
  createInitialWebUiState,
  createWebUiEventStore,
  failWebUiRun,
  parseWebUiTodoUpdate,
  reduceWebUiEvent,
} from "./state.js";
export type {
  WebUiAssistantTranscriptItem,
  WebUiEventStore,
  WebUiRunResultSummary,
  WebUiRunStatus,
  WebUiState,
  WebUiStateListener,
  WebUiTodoItem,
  WebUiTodoState,
  WebUiTodoStatus,
  WebUiToolStatus,
  WebUiToolTranscriptItem,
  WebUiTranscriptItem,
  WebUiTranscriptItemBase,
  WebUiUserTranscriptItem,
} from "./types.js";
