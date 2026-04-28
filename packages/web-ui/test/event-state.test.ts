import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@kairos/agent";
import type { ModelResponse, ToolCall } from "@kairos/ai";
import {
  createInitialWebUiState,
  createWebUiEventStore,
  failWebUiRun,
  parseWebUiTodoUpdate,
  reduceWebUiEvent,
  type WebUiAssistantTranscriptItem,
  type WebUiToolTranscriptItem,
} from "../src/index";

describe("@kairos/web-ui event state", () => {
  test("reduces streaming assistant text into a stable transcript", () => {
    const response = createTextResponse("Hello world");
    const state = reduceEvents([
      { type: "agent_start", input: "Say hello" },
      { type: "turn_start", turn: 1, messages: [] },
      {
        type: "model_event",
        turn: 1,
        event: { type: "response_start", message: { role: "assistant", content: [] } },
      },
      {
        type: "model_event",
        turn: 1,
        event: { type: "text_delta", delta: "Hello" },
      },
      {
        type: "model_event",
        turn: 1,
        event: { type: "text_delta", delta: " world" },
      },
      {
        type: "model_event",
        turn: 1,
        event: { type: "response_end", response },
      },
      { type: "turn_end", turn: 1, response },
      { type: "agent_end", result: createRunResult(response, 1) },
    ]);

    expect(state.status).toBe("completed");
    expect(state.result).toEqual({ stopReason: "end_turn", turns: 1 });
    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toEqual({
      id: "run:1:user",
      kind: "user",
      runId: 1,
      text: "Say hello",
    });

    const assistant = state.items[1] as WebUiAssistantTranscriptItem;
    expect(assistant).toMatchObject({
      id: "run:1:assistant:1",
      kind: "assistant",
      runId: 1,
      turn: 1,
      text: "Hello world",
      streaming: false,
      stopReason: "end_turn",
      toolItemIds: [],
    });
  });

  test("tracks tool calls through pending, running, and completed states", () => {
    const toolCall: ToolCall = {
      id: "call_read",
      name: "read_file",
      arguments: { path: "README.md" },
    };
    const response: ModelResponse = {
      message: {
        role: "assistant",
        content: [{ type: "tool-call", call: toolCall }],
      },
      stopReason: "tool_calls",
    };

    const state = reduceEvents([
      { type: "agent_start", input: "Read README" },
      { type: "turn_start", turn: 1, messages: [] },
      {
        type: "model_event",
        turn: 1,
        event: { type: "tool_call", toolCall },
      },
      { type: "turn_end", turn: 1, response },
      { type: "tool_start", turn: 1, toolCall },
      {
        type: "tool_end",
        turn: 1,
        toolCall,
        message: {
          role: "tool",
          toolCallId: "call_read",
          toolName: "read_file",
          content: "README content",
        },
      },
    ]);

    const assistant = state.items.find(
      (item): item is WebUiAssistantTranscriptItem =>
        item.kind === "assistant",
    );
    const tool = state.items.find(
      (item): item is WebUiToolTranscriptItem => item.kind === "tool",
    );

    expect(assistant?.toolItemIds).toEqual(["run:1:tool:call_read"]);
    expect(tool).toMatchObject({
      id: "run:1:tool:call_read",
      kind: "tool",
      runId: 1,
      turn: 1,
      toolCallId: "call_read",
      toolCall,
      status: "completed",
      content: "README content",
    });
  });

  test("extracts todo_write results for a future todo panel", () => {
    const todos = [
      { id: "inspect", content: "Inspect code", status: "completed" },
      { id: "implement", content: "Implement state", status: "in_progress" },
      { id: "verify", content: "Run tests", status: "pending" },
    ] as const;
    const content = JSON.stringify({
      oldTodos: [],
      newTodos: todos,
      pendingCount: 1,
      inProgressCount: 1,
      completedCount: 1,
      metadata: { todos },
    });
    const toolCall: ToolCall = {
      id: "call_todo",
      name: "todo_write",
      arguments: { todos: [...todos] },
    };

    const state = reduceEvents([
      { type: "agent_start", input: "Plan work" },
      {
        type: "tool_end",
        turn: 1,
        toolCall,
        message: {
          role: "tool",
          toolCallId: "call_todo",
          toolName: "todo_write",
          content,
        },
      },
    ]);

    expect(parseWebUiTodoUpdate("call_todo", content)).toEqual({
      toolCallId: "call_todo",
      items: todos,
      pendingCount: 1,
      inProgressCount: 1,
      completedCount: 1,
    });
    expect(state.todos).toEqual({
      toolCallId: "call_todo",
      items: todos,
      pendingCount: 1,
      inProgressCount: 1,
      completedCount: 1,
    });
  });

  test("notifies subscribers and supports reset", () => {
    const store = createWebUiEventStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribe((state, _previousState, event) => {
      seen.push(`${event?.type ?? "reset"}:${state.status}`);
    });

    store.dispatch({ type: "agent_start", input: "Hello" });
    store.reset();
    unsubscribe();
    store.dispatch({ type: "agent_start", input: "Ignored" });

    expect(seen).toEqual(["agent_start:running", "reset:idle"]);
    expect(store.getState().status).toBe("running");
  });

  test("marks a run as failed when the caller catches an agent error", () => {
    let state = reduceEvents([
      { type: "agent_start", input: "Use model" },
      {
        type: "model_event",
        turn: 1,
        event: { type: "response_start", message: { role: "assistant", content: [] } },
      },
    ]);

    state = failWebUiRun(state, new Error("401 Unauthorized"));

    expect(state.status).toBe("failed");
    expect(state.error).toBe("401 Unauthorized");
    expect(
      state.items.find((item) => item.kind === "assistant"),
    ).toMatchObject({ streaming: false });

    const store = createWebUiEventStore(state);
    store.fail("network down");
    expect(store.getState()).toMatchObject({
      status: "failed",
      error: "network down",
    });
  });
});

function reduceEvents(events: AgentEvent[]) {
  return events.reduce(reduceWebUiEvent, createInitialWebUiState());
}

function createTextResponse(text: string): ModelResponse {
  return {
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
    stopReason: "end_turn",
  };
}

function createRunResult(response: ModelResponse, turns: number) {
  return {
    messages: [],
    response,
    turns,
    stopReason: "end_turn" as const,
  };
}
