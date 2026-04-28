import type { AgentEvent } from "@kairos/agent";
import type { JsonValue, Model } from "@kairos/ai";
import { parseTodoWriteResult } from "./todo.js";
import type { TuiTodoItem } from "./todo.js";

export const TUI_JSON_EVENT_VERSION = 1;

export interface TuiJsonEventContext {
  input: string;
  root: string;
  model: string;
}

export type TuiJsonEvent =
  | TuiJsonRunStartEvent
  | TuiJsonAssistantDeltaEvent
  | TuiJsonToolStartEvent
  | TuiJsonToolEndEvent
  | TuiJsonToolErrorEvent
  | TuiJsonTodoUpdateEvent
  | TuiJsonRunEndEvent;

export interface TuiJsonRunStartEvent extends TuiJsonEventBase {
  type: "run_start";
  input: string;
  root: string;
  model: string;
}

export interface TuiJsonAssistantDeltaEvent extends TuiJsonEventBase {
  type: "assistant_delta";
  text: string;
}

export interface TuiJsonToolStartEvent extends TuiJsonEventBase {
  type: "tool_start";
  id: string;
  name: string;
  arguments: JsonValue;
}

export interface TuiJsonToolEndEvent extends TuiJsonEventBase {
  type: "tool_end";
  id: string;
  name: string;
  content: string;
}

export interface TuiJsonToolErrorEvent extends TuiJsonEventBase {
  type: "tool_error";
  id: string;
  name: string;
  content: string;
}

export interface TuiJsonTodoUpdateEvent extends TuiJsonEventBase {
  type: "todo_update";
  id: string;
  todos: TuiTodoItem[];
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
}

export interface TuiJsonRunEndEvent extends TuiJsonEventBase {
  type: "run_end";
  stopReason: string;
  turns: number;
}

interface TuiJsonEventBase {
  version: typeof TUI_JSON_EVENT_VERSION;
}

export function createTuiJsonEventContext(options: {
  input: string;
  root: string;
  model: Model;
}): TuiJsonEventContext {
  return {
    input: options.input,
    root: options.root,
    model: `${options.model.provider}/${options.model.id}`,
  };
}

export function toTuiJsonEvents(
  event: AgentEvent,
  context: TuiJsonEventContext,
): TuiJsonEvent[] {
  switch (event.type) {
    case "agent_start":
      return [
        {
          version: TUI_JSON_EVENT_VERSION,
          type: "run_start",
          input: context.input,
          root: context.root,
          model: context.model,
        },
      ];
    case "model_event":
      if (event.event.type !== "text_delta" || event.event.delta.length === 0) {
        return [];
      }

      return [
        {
          version: TUI_JSON_EVENT_VERSION,
          type: "assistant_delta",
          text: event.event.delta,
        },
      ];
    case "tool_start":
      return [
        {
          version: TUI_JSON_EVENT_VERSION,
          type: "tool_start",
          id: event.toolCall.id,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
        },
      ];
    case "tool_end":
      return toToolEndJsonEvents(event);
    case "tool_error":
      return [
        {
          version: TUI_JSON_EVENT_VERSION,
          type: "tool_error",
          id: event.toolCall.id,
          name: event.toolCall.name,
          content: event.message.content,
        },
      ];
    case "agent_end":
      return [
        {
          version: TUI_JSON_EVENT_VERSION,
          type: "run_end",
          stopReason: event.result.stopReason,
          turns: event.result.turns,
        },
      ];
    case "turn_start":
    case "turn_end":
      return [];
  }
}

export function formatTuiJsonEvent(event: TuiJsonEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function toToolEndJsonEvents(
  event: Extract<AgentEvent, { type: "tool_end" }>,
): TuiJsonEvent[] {
  const toolEndEvent: TuiJsonToolEndEvent = {
    version: TUI_JSON_EVENT_VERSION,
    type: "tool_end",
    id: event.toolCall.id,
    name: event.toolCall.name,
    content: event.message.content,
  };

  if (event.toolCall.name !== "todo_write") {
    return [toolEndEvent];
  }

  const todoUpdate = parseTodoWriteResult(event.message.content);
  if (!todoUpdate) {
    return [toolEndEvent];
  }

  return [
    toolEndEvent,
    {
      version: TUI_JSON_EVENT_VERSION,
      type: "todo_update",
      id: event.toolCall.id,
      todos: todoUpdate.todos,
      pendingCount: todoUpdate.pendingCount,
      inProgressCount: todoUpdate.inProgressCount,
      completedCount: todoUpdate.completedCount,
    },
  ];
}
