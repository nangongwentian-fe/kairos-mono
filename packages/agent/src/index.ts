export const KAIROS_AGENT_PACKAGE = "@kairos/agent";

export { Agent } from "./agent.js";
export { createTraceRecorder } from "./trace.js";
export type {
  AgentEvent,
  AgentEventListener,
  AgentOptions,
  AgentRunResult,
  AgentState,
  AgentStopReason,
  AgentStreamFunction,
  AgentTool,
  AgentToolConfirmation,
  AgentToolPreview,
  AgentToolRisk,
} from "./types.js";
export type {
  AgentTrace,
  AgentTraceAssistantMessageItem,
  AgentTraceItem,
  AgentTraceRecorder,
  AgentTraceStatus,
  AgentTraceToolCallItem,
  AgentTraceToolResultItem,
  AgentTraceTurn,
} from "./trace.js";
