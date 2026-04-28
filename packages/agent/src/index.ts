export const KAIROS_AGENT_PACKAGE = "@kairos/agent";

export { Agent } from "./agent.js";
export { createTraceRecorder } from "./trace.js";
export type {
  AgentEvent,
  AgentEventListener,
  AgentMiddleware,
  AgentMiddlewareContext,
  AgentOptions,
  AgentRunResult,
  AgentState,
  AgentStopReason,
  AgentStreamFunction,
  AgentToolCallContext,
  AgentToolCallDecision,
  AgentTool,
  AgentToolConfirmation,
  AgentToolPreview,
  AgentToolResultContext,
  AgentToolRisk,
  AnyAgentTool,
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
