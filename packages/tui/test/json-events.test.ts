import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@kairos/agent";
import type { Model } from "@kairos/ai";
import {
  createTuiJsonEventContext,
  formatTuiJsonEvent,
  toTuiJsonEvents,
} from "../src/json-events";

const TEST_MODEL: Model = {
  id: "kimi-k2.6",
  name: "Kimi K2.6",
  provider: "opencode-go",
  api: "openai-completions",
  baseUrl: "https://opencode.ai/zen/go/v1",
  apiKeyEnv: "OPENCODE_API_KEY",
  supportsTools: true,
};

describe("@kairos/tui JSON events", () => {
  const context = createTuiJsonEventContext({
    input: "Inspect README.md",
    root: "/repo",
    model: TEST_MODEL,
  });

  test("maps run start into a stable public event", () => {
    expect(
      toTuiJsonEvents({ type: "agent_start", input: "Inspect README.md" }, context),
    ).toEqual([
      {
        version: 1,
        type: "run_start",
        input: "Inspect README.md",
        root: "/repo",
        model: "opencode-go/kimi-k2.6",
      },
    ]);
  });

  test("maps assistant text deltas and hides raw model protocol events", () => {
    expect(
      toTuiJsonEvents(
        {
          type: "model_event",
          turn: 1,
          event: { type: "text_delta", delta: "hello" },
        },
        context,
      ),
    ).toEqual([{ version: 1, type: "assistant_delta", text: "hello" }]);

    expect(
      toTuiJsonEvents(
        {
          type: "model_event",
          turn: 1,
          event: {
            type: "response_start",
            message: { role: "assistant", content: [] },
          },
        },
        context,
      ),
    ).toEqual([]);
  });

  test("maps tool lifecycle events without leaking internal turn state", () => {
    const toolCall = {
      id: "call_1",
      name: "read_file",
      arguments: { path: "README.md" },
    };

    expect(
      toTuiJsonEvents({ type: "tool_start", turn: 1, toolCall }, context),
    ).toEqual([
      {
        version: 1,
        type: "tool_start",
        id: "call_1",
        name: "read_file",
        arguments: { path: "README.md" },
      },
    ]);

    expect(
      toTuiJsonEvents(
        {
          type: "tool_end",
          turn: 1,
          toolCall,
          message: {
            role: "tool",
            toolCallId: "call_1",
            toolName: "read_file",
            content: "README content",
          },
        },
        context,
      ),
    ).toEqual([
      {
        version: 1,
        type: "tool_end",
        id: "call_1",
        name: "read_file",
        content: "README content",
      },
    ]);

    expect(
      toTuiJsonEvents(
        {
          type: "tool_error",
          turn: 1,
          toolCall,
          message: {
            role: "tool",
            toolCallId: "call_1",
            toolName: "read_file",
            content: "not found",
            isError: true,
          },
        },
        context,
      ),
    ).toEqual([
      {
        version: 1,
        type: "tool_error",
        id: "call_1",
        name: "read_file",
        content: "not found",
      },
    ]);
  });

  test("maps run end and formats JSON lines", () => {
    const [event] = toTuiJsonEvents(
      {
        type: "agent_end",
        result: {
          messages: [],
          response: {
            message: {
              role: "assistant",
              content: [{ type: "text", text: "done" }],
            },
            stopReason: "end_turn",
          },
          turns: 2,
          stopReason: "end_turn",
        },
      },
      context,
    );

    expect(event).toEqual({
      version: 1,
      type: "run_end",
      stopReason: "end_turn",
      turns: 2,
    });
    expect(formatTuiJsonEvent(event)).toBe(
      '{"version":1,"type":"run_end","stopReason":"end_turn","turns":2}\n',
    );
  });

  test("ignores internal turn events", () => {
    const events: AgentEvent[] = [
      { type: "turn_start", turn: 1, messages: [] },
      {
        type: "turn_end",
        turn: 1,
        response: {
          message: { role: "assistant", content: [] },
          stopReason: "end_turn",
        },
      },
    ];

    expect(events.flatMap((event) => toTuiJsonEvents(event, context))).toEqual([]);
  });
});
