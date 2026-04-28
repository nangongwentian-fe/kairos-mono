import type { AgentEvent, AgentRunResult } from "@kairos/agent";
import type { ModelResponse, ToolCall, ToolResultMessage } from "@kairos/ai";

export const KAIROS_WEB_UI_EVENT_STATE_VERSION = 1;

export type WebUiRunStatus = "idle" | "running" | "completed" | "failed";

export type WebUiTranscriptItem =
  | WebUiUserTranscriptItem
  | WebUiAssistantTranscriptItem
  | WebUiToolTranscriptItem;

export interface WebUiState {
  version: typeof KAIROS_WEB_UI_EVENT_STATE_VERSION;
  status: WebUiRunStatus;
  runId: number;
  currentTurn?: number;
  input?: string;
  error?: string;
  items: readonly WebUiTranscriptItem[];
  todos?: WebUiTodoState;
  result?: WebUiRunResultSummary;
}

export interface WebUiTranscriptItemBase {
  id: string;
  runId: number;
}

export interface WebUiUserTranscriptItem extends WebUiTranscriptItemBase {
  kind: "user";
  text: string;
}

export interface WebUiAssistantTranscriptItem
  extends WebUiTranscriptItemBase {
  kind: "assistant";
  turn: number;
  text: string;
  toolItemIds: readonly string[];
  streaming: boolean;
  stopReason?: ModelResponse["stopReason"];
}

export type WebUiToolStatus =
  | "pending"
  | "running"
  | "completed"
  | "error";

export interface WebUiToolTranscriptItem extends WebUiTranscriptItemBase {
  kind: "tool";
  turn: number;
  toolCallId: string;
  toolCall: ToolCall;
  status: WebUiToolStatus;
  content?: string;
  result?: ToolResultMessage;
}

export type WebUiTodoStatus = "pending" | "in_progress" | "completed";

export interface WebUiTodoItem {
  id: string;
  content: string;
  status: WebUiTodoStatus;
}

export interface WebUiTodoState {
  toolCallId: string;
  items: readonly WebUiTodoItem[];
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
}

export interface WebUiRunResultSummary {
  stopReason: AgentRunResult["stopReason"];
  turns: number;
}

export type WebUiStateListener = (
  state: WebUiState,
  previousState: WebUiState,
  event?: AgentEvent,
) => void;

export interface WebUiEventStore {
  getState: () => WebUiState;
  dispatch: (event: AgentEvent) => WebUiState;
  fail: (error: unknown) => WebUiState;
  reset: (state?: WebUiState) => WebUiState;
  subscribe: (listener: WebUiStateListener) => () => void;
}
