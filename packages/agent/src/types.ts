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

export interface AgentTool<TArgs extends JsonValue = JsonValue>
  extends ToolDefinition<TArgs> {
  execute: (args: TArgs) => Promise<string> | string;
}

export interface AgentOptions {
  model: Model;
  systemPrompt?: string;
  tools?: readonly AgentTool<any>[];
  maxTurns?: number;
  messages?: readonly Message[];
  stream?: AgentStreamFunction;
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

