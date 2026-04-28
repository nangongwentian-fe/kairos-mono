import type { AgentEvent } from "@kairos/agent";
import type {
  AssistantMessage,
  ModelResponse,
  ModelStreamEvent,
  ToolCall,
  ToolResultMessage,
} from "@kairos/ai";
import {
  KAIROS_WEB_UI_EVENT_STATE_VERSION,
  type WebUiAssistantTranscriptItem,
  type WebUiEventStore,
  type WebUiState,
  type WebUiStateListener,
  type WebUiTodoItem,
  type WebUiTodoState,
  type WebUiToolStatus,
  type WebUiToolTranscriptItem,
  type WebUiTranscriptItem,
} from "./types.js";

export function createInitialWebUiState(): WebUiState {
  return {
    version: KAIROS_WEB_UI_EVENT_STATE_VERSION,
    status: "idle",
    runId: 0,
    items: [],
  };
}

export function reduceWebUiEvent(
  state: WebUiState,
  event: AgentEvent,
): WebUiState {
  switch (event.type) {
    case "agent_start":
      return startRun(state, event.input);
    case "turn_start":
      return {
        ...state,
        status: "running",
        currentTurn: event.turn,
      };
    case "model_event":
      return reduceModelEvent(state, event.turn, event.event);
    case "tool_start":
      return upsertTool(state, event.turn, event.toolCall, "running");
    case "tool_end":
      return completeTool(state, event.turn, event.toolCall, event.message);
    case "tool_error":
      return completeTool(state, event.turn, event.toolCall, event.message);
    case "turn_end":
      return applyAssistantResponse(state, event.turn, event.response);
    case "agent_end":
      return {
        ...state,
        status: "completed",
        currentTurn: undefined,
        result: {
          stopReason: event.result.stopReason,
          turns: event.result.turns,
        },
        items: state.items.map((item) =>
          item.kind === "assistant" ? { ...item, streaming: false } : item,
        ),
      };
  }
}

export function createWebUiEventStore(
  initialState: WebUiState = createInitialWebUiState(),
): WebUiEventStore {
  let state = initialState;
  const listeners = new Set<WebUiStateListener>();

  const setState = (
    nextState: WebUiState,
    event?: AgentEvent,
  ): WebUiState => {
    const previousState = state;
    if (Object.is(nextState, previousState)) {
      return state;
    }

    state = nextState;
    for (const listener of listeners) {
      listener(state, previousState, event);
    }

    return state;
  };

  return {
    getState: () => state,
    dispatch: (event) => setState(reduceWebUiEvent(state, event), event),
    fail: (error) => setState(failWebUiRun(state, error)),
    reset: (nextState = createInitialWebUiState()) => setState(nextState),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function failWebUiRun(
  state: WebUiState,
  error: unknown,
): WebUiState {
  return {
    ...state,
    status: "failed",
    currentTurn: undefined,
    error: formatError(error),
    items: state.items.map((item) =>
      item.kind === "assistant" ? { ...item, streaming: false } : item,
    ),
  };
}

export function parseWebUiTodoUpdate(
  toolCallId: string,
  content: string,
): WebUiTodoState | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const rawTodos = getTodoArray(value);
  if (!rawTodos) {
    return undefined;
  }

  const items = parseTodoItems(rawTodos);
  if (!items) {
    return undefined;
  }

  return {
    toolCallId,
    items,
    pendingCount: getNumber(value.pendingCount) ?? countTodos(items, "pending"),
    inProgressCount:
      getNumber(value.inProgressCount) ?? countTodos(items, "in_progress"),
    completedCount:
      getNumber(value.completedCount) ?? countTodos(items, "completed"),
  };
}

function startRun(state: WebUiState, input: string): WebUiState {
  const runId = state.runId + 1;
  return {
    ...state,
    status: "running",
    runId,
    currentTurn: undefined,
    input,
    error: undefined,
    result: undefined,
    items: [
      ...state.items,
      {
        id: createUserItemId(runId),
        kind: "user",
        runId,
        text: input,
      },
    ],
  };
}

function reduceModelEvent(
  state: WebUiState,
  turn: number,
  event: ModelStreamEvent,
): WebUiState {
  switch (event.type) {
    case "response_start":
      return updateAssistant(state, turn, (item) => ({
        ...item,
        streaming: true,
        text: item.text || getAssistantText(event.message),
      }));
    case "text_delta":
      if (event.delta.length === 0) {
        return state;
      }

      return updateAssistant(state, turn, (item) => ({
        ...item,
        streaming: true,
        text: item.text + event.delta,
      }));
    case "tool_call":
      return upsertTool(state, turn, event.toolCall, "pending");
    case "response_end":
      return applyAssistantResponse(state, turn, event.response);
  }
}

function applyAssistantResponse(
  state: WebUiState,
  turn: number,
  response: ModelResponse,
): WebUiState {
  let nextState = updateAssistant(state, turn, (item) => ({
    ...item,
    text: getAssistantText(response.message),
    streaming: false,
    stopReason: response.stopReason,
  }));

  for (const toolCall of getToolCalls(response.message)) {
    nextState = upsertTool(nextState, turn, toolCall, "pending");
  }

  return nextState;
}

function completeTool(
  state: WebUiState,
  turn: number,
  toolCall: ToolCall,
  message: ToolResultMessage,
): WebUiState {
  const status: WebUiToolStatus = message.isError ? "error" : "completed";
  const nextState = upsertTool(state, turn, toolCall, status, {
    content: message.content,
    result: message,
  });

  if (toolCall.name !== "todo_write" || message.isError) {
    return nextState;
  }

  const todos = parseWebUiTodoUpdate(toolCall.id, message.content);
  if (!todos) {
    return nextState;
  }

  return {
    ...nextState,
    todos,
  };
}

function updateAssistant(
  state: WebUiState,
  turn: number,
  update: (
    item: WebUiAssistantTranscriptItem,
  ) => WebUiAssistantTranscriptItem,
): WebUiState {
  const runId = getActiveRunId(state);
  const id = createAssistantItemId(runId, turn);
  const item = findAssistantItem(state.items, id) ?? {
    id,
    kind: "assistant",
    runId,
    turn,
    text: "",
    toolItemIds: [],
    streaming: false,
  };
  const nextItem = update(item);

  return {
    ...state,
    currentTurn: turn,
    items: replaceOrAppendItem(state.items, id, nextItem),
  };
}

function upsertTool(
  state: WebUiState,
  turn: number,
  toolCall: ToolCall,
  status: WebUiToolStatus,
  patch: Partial<WebUiToolTranscriptItem> = {},
): WebUiState {
  const runId = getActiveRunId(state);
  const id = createToolItemId(runId, toolCall.id);
  const existing: WebUiToolTranscriptItem | undefined = findToolItem(
    state.items,
    id,
  );
  const item: WebUiToolTranscriptItem = {
    ...existing,
    id,
    kind: "tool",
    runId,
    turn,
    toolCallId: toolCall.id,
    toolCall,
    status,
    ...patch,
  };
  const withAssistant = updateAssistant(state, turn, (assistant) => ({
    ...assistant,
    toolItemIds: assistant.toolItemIds.includes(id)
      ? assistant.toolItemIds
      : [...assistant.toolItemIds, id],
  }));

  return {
    ...withAssistant,
    currentTurn: turn,
    items: replaceOrAppendItem(withAssistant.items, id, item),
  };
}

function replaceOrAppendItem(
  items: readonly WebUiTranscriptItem[],
  id: string,
  item: WebUiTranscriptItem,
): WebUiTranscriptItem[] {
  const index = items.findIndex((candidate) => candidate.id === id);
  if (index === -1) {
    return [...items, item];
  }

  return items.map((candidate, candidateIndex) =>
    candidateIndex === index ? item : candidate,
  );
}

function findAssistantItem(
  items: readonly WebUiTranscriptItem[],
  id: string,
): WebUiAssistantTranscriptItem | undefined {
  const item = items.find((candidate) => candidate.id === id);
  return item?.kind === "assistant" ? item : undefined;
}

function findToolItem(
  items: readonly WebUiTranscriptItem[],
  id: string,
): WebUiToolTranscriptItem | undefined {
  const item = items.find((candidate) => candidate.id === id);
  return item?.kind === "tool" ? item : undefined;
}

function getActiveRunId(state: WebUiState): number {
  return state.runId === 0 ? 1 : state.runId;
}

function createUserItemId(runId: number): string {
  return `run:${runId}:user`;
}

function createAssistantItemId(runId: number, turn: number): string {
  return `run:${runId}:assistant:${turn}`;
}

function createToolItemId(runId: number, toolCallId: string): string {
  return `run:${runId}:tool:${toolCallId}`;
}

function getAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function getToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.flatMap((block) =>
    block.type === "tool-call" ? [block.call] : [],
  );
}

function getTodoArray(value: Record<string, unknown>): unknown[] | undefined {
  const metadata = value.metadata;
  if (isRecord(metadata) && Array.isArray(metadata.todos)) {
    return metadata.todos;
  }

  return Array.isArray(value.newTodos) ? value.newTodos : undefined;
}

function parseTodoItems(value: unknown[]): WebUiTodoItem[] | undefined {
  const items: WebUiTodoItem[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }
    if (
      typeof item.id !== "string" ||
      typeof item.content !== "string" ||
      !isTodoStatus(item.status)
    ) {
      return undefined;
    }

    items.push({
      id: item.id,
      content: item.content,
      status: item.status,
    });
  }

  return items;
}

function isTodoStatus(value: unknown): value is WebUiTodoItem["status"] {
  return value === "pending" || value === "in_progress" || value === "completed";
}

function countTodos(
  items: readonly WebUiTodoItem[],
  status: WebUiTodoItem["status"],
): number {
  return items.filter((item) => item.status === status).length;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
