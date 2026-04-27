import type {
  AssistantMessage,
  ModelResponse,
  ToolCall,
  ToolResultMessage,
} from "@kairos/ai";
import type {
  AgentEvent,
  AgentEventListener,
  AgentRunResult,
} from "./types.js";

export type AgentTraceStatus = "idle" | "running" | "ended";

export interface AgentTrace {
  status: AgentTraceStatus;
  input?: string;
  startedAt?: string;
  endedAt?: string;
  turns: AgentTraceTurn[];
  items: AgentTraceItem[];
  result?: AgentRunResult;
}

export interface AgentTraceTurn {
  turn: number;
  text: string;
  toolCalls: ToolCall[];
  response?: ModelResponse;
}

export type AgentTraceItem =
  | AgentTraceAssistantMessageItem
  | AgentTraceToolCallItem
  | AgentTraceToolResultItem;

export interface AgentTraceAssistantMessageItem {
  type: "assistant_message";
  turn: number;
  message: AssistantMessage;
  text: string;
}

export interface AgentTraceToolCallItem {
  type: "tool_call";
  turn: number;
  toolCall: ToolCall;
  startedAt?: string;
}

export interface AgentTraceToolResultItem {
  type: "tool_result";
  turn: number;
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  startedAt?: string;
  endedAt: string;
  durationMs?: number;
}

export interface AgentTraceRecorder {
  trace: AgentTrace;
  onEvent: AgentEventListener;
  reset: () => void;
}

interface PendingToolCall {
  startedAt: string;
  startedAtMs: number;
}

export function createTraceRecorder(): AgentTraceRecorder {
  const pendingToolCalls = new Map<string, PendingToolCall>();
  const trace = createEmptyTrace();

  const reset = (): void => {
    pendingToolCalls.clear();
    clearTrace(trace);
  };

  const onEvent = (event: AgentEvent): void => {
    switch (event.type) {
      case "agent_start": {
        reset();
        trace.status = "running";
        trace.input = event.input;
        trace.startedAt = nowIso();
        return;
      }
      case "turn_start": {
        ensureTurn(trace, event.turn);
        return;
      }
      case "model_event": {
        recordModelEvent(trace, event);
        return;
      }
      case "tool_start": {
        const startedAt = nowIso();
        pendingToolCalls.set(event.toolCall.id, {
          startedAt,
          startedAtMs: Date.now(),
        });
        const item = findToolCallItem(trace, event.toolCall.id);
        if (item) {
          item.startedAt = startedAt;
        }
        return;
      }
      case "tool_end":
      case "tool_error": {
        recordToolResult(trace, event.turn, event.message, pendingToolCalls);
        return;
      }
      case "turn_end": {
        recordTurnEnd(trace, event.turn, event.response);
        return;
      }
      case "agent_end": {
        trace.status = "ended";
        trace.endedAt = nowIso();
        trace.result = event.result;
        return;
      }
    }
  };

  return {
    trace,
    onEvent,
    reset,
  };
}

function createEmptyTrace(): AgentTrace {
  return {
    status: "idle",
    turns: [],
    items: [],
  };
}

function clearTrace(trace: AgentTrace): void {
  trace.status = "idle";
  trace.turns = [];
  trace.items = [];
  delete trace.input;
  delete trace.startedAt;
  delete trace.endedAt;
  delete trace.result;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureTurn(trace: AgentTrace, turn: number): AgentTraceTurn {
  let existing = trace.turns.find((candidate) => candidate.turn === turn);
  if (!existing) {
    existing = {
      turn,
      text: "",
      toolCalls: [],
    };
    trace.turns.push(existing);
  }

  return existing;
}

function recordModelEvent(
  trace: AgentTrace,
  event: Extract<AgentEvent, { type: "model_event" }>,
): void {
  const turn = ensureTurn(trace, event.turn);

  if (event.event.type === "text_delta") {
    turn.text += event.event.delta;
    return;
  }

  if (event.event.type === "tool_call") {
    turn.toolCalls.push(event.event.toolCall);
    trace.items.push({
      type: "tool_call",
      turn: event.turn,
      toolCall: event.event.toolCall,
    });
  }
}

function recordTurnEnd(
  trace: AgentTrace,
  turnNumber: number,
  response: ModelResponse,
): void {
  const turn = ensureTurn(trace, turnNumber);
  turn.response = response;
  turn.text = extractText(response.message);

  trace.items.push({
    type: "assistant_message",
    turn: turnNumber,
    message: response.message,
    text: turn.text,
  });
}

function recordToolResult(
  trace: AgentTrace,
  turn: number,
  message: ToolResultMessage,
  pendingToolCalls: Map<string, PendingToolCall>,
): void {
  const endedAt = nowIso();
  const pending = pendingToolCalls.get(message.toolCallId);
  pendingToolCalls.delete(message.toolCallId);

  trace.items.push({
    type: "tool_result",
    turn,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    content: message.content,
    isError: Boolean(message.isError),
    startedAt: pending?.startedAt,
    endedAt,
    durationMs: pending ? Date.now() - pending.startedAtMs : undefined,
  });
}

function findToolCallItem(
  trace: AgentTrace,
  toolCallId: string,
): AgentTraceToolCallItem | undefined {
  return trace.items.find(
    (item): item is AgentTraceToolCallItem =>
      item.type === "tool_call" && item.toolCall.id === toolCallId,
  );
}

function extractText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
