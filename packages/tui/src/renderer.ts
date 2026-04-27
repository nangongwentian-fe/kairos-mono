import type { AgentEvent } from "@kairos/agent";
import type { TuiEventRenderer, TuiIo } from "./types.js";
import {
  formatToolCallSummary,
  formatToolResult,
} from "./format.js";

interface PendingTool {
  startedAt: number;
}

export function createTuiEventRenderer(io: TuiIo): TuiEventRenderer {
  const pendingTools = new Map<string, PendingTool>();
  let assistantBlockOpen = false;

  const closeAssistantBlock = async (): Promise<void> => {
    if (!assistantBlockOpen) {
      return;
    }

    assistantBlockOpen = false;
    await io.write("\n");
  };

  const onEvent = async (event: AgentEvent): Promise<void> => {
    switch (event.type) {
      case "agent_start": {
        await io.write(`> ${event.input}\n\n`);
        return;
      }
      case "model_event": {
        if (event.event.type !== "text_delta" || event.event.delta.length === 0) {
          return;
        }
        if (!assistantBlockOpen) {
          assistantBlockOpen = true;
          await io.write("assistant: ");
        }
        await io.write(event.event.delta);
        return;
      }
      case "turn_end": {
        await closeAssistantBlock();
        return;
      }
      case "tool_start": {
        await closeAssistantBlock();
        pendingTools.set(event.toolCall.id, {
          startedAt: Date.now(),
        });
        await io.write(`tool ${formatToolCallSummary(event.toolCall)} started\n`);
        return;
      }
      case "tool_end": {
        await closeAssistantBlock();
        const pending = pendingTools.get(event.toolCall.id);
        pendingTools.delete(event.toolCall.id);
        const elapsed = pending ? ` ${Date.now() - pending.startedAt}ms` : "";
        await io.write(`tool ${event.toolCall.name} done${elapsed}\n`);
        return;
      }
      case "tool_error": {
        await closeAssistantBlock();
        const pending = pendingTools.get(event.toolCall.id);
        pendingTools.delete(event.toolCall.id);
        const elapsed = pending ? ` ${Date.now() - pending.startedAt}ms` : "";
        const result = formatToolResult(event.message.content);
        await io.write(`tool ${event.toolCall.name} error${elapsed}\n`);
        if (result) {
          await io.write(`${result}\n`);
        }
        return;
      }
      case "agent_end": {
        await closeAssistantBlock();
        await io.write(
          `completed: ${event.result.stopReason} in ${event.result.turns} turn${event.result.turns === 1 ? "" : "s"}\n`,
        );
        return;
      }
      case "turn_start":
        return;
    }
  };

  return {
    onEvent,
    closeAssistantBlock,
  };
}
