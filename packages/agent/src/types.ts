import type {
  JsonValue,
  Message,
  Model,
  ModelRequest,
  ModelResponse,
  ModelStream,
  ModelStreamEvent,
  ToolCall,
  ToolDefinition,
  ToolResultMessage,
} from "@kairos/ai";

export type AgentStreamFunction = (
  model: Model,
  request: ModelRequest,
) => ModelStream;

export type AgentStopReason = "end_turn" | "max_tokens" | "max_turns";

export type AgentToolRisk = "read" | "write" | "execute";

export type AgentToolPreview = string;

export interface AgentTool<TArgs extends JsonValue = JsonValue>
  extends ToolDefinition<TArgs> {
  risk?: AgentToolRisk;
  preview?: (
    args: TArgs,
  ) => Promise<AgentToolPreview | undefined> | AgentToolPreview | undefined;
  execute: (args: TArgs) => Promise<string> | string;
}

export type AgentToolConfirmation = (
  toolCall: ToolCall,
  tool: AgentTool<any>,
  preview?: AgentToolPreview,
) => Promise<boolean> | boolean;

export interface AgentOptions {
  model: Model;
  systemPrompt?: string;
  tools?: readonly AgentTool<any>[];
  maxTurns?: number;
  messages?: readonly Message[];
  stream?: AgentStreamFunction;
  confirmToolCall?: AgentToolConfirmation;
}

export interface AgentRunResult {
  messages: Message[];
  response: ModelResponse;
  turns: number;
  stopReason: AgentStopReason;
}

export interface AgentState {
  messages: readonly Message[];
  isRunning: boolean;
}

export type AgentEvent =
  | { type: "agent_start"; input: string }
  | { type: "turn_start"; turn: number; messages: readonly Message[] }
  | { type: "model_event"; turn: number; event: ModelStreamEvent }
  | { type: "tool_start"; turn: number; toolCall: ToolCall }
  | {
      type: "tool_end";
      turn: number;
      toolCall: ToolCall;
      message: ToolResultMessage;
    }
  | {
      type: "tool_error";
      turn: number;
      toolCall: ToolCall;
      message: ToolResultMessage;
    }
  | { type: "turn_end"; turn: number; response: ModelResponse }
  | { type: "agent_end"; result: AgentRunResult };

export type AgentEventListener = (event: AgentEvent) => Promise<void> | void;

export type AgentEventSink = (event: AgentEvent) => Promise<void>;
