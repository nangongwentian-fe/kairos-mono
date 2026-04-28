import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AgentToolConfirmation } from "@kairos/agent";
import { runCodingTask } from "@kairos/coding-agent";
import { formatToolArguments } from "./format.js";
import { createTuiEventRenderer } from "./renderer.js";
import type {
  RunTuiTaskOptions,
  RunTuiTaskResult,
  TuiIo,
  TuiToolConfirmation,
} from "./types.js";
import { formatWorkspaceSummary } from "./workspace-summary.js";

export async function runTuiTask(
  options: RunTuiTaskOptions,
): Promise<RunTuiTaskResult> {
  const { io = createDefaultTuiIo(), onEvent, confirmToolCall, ...taskOptions } = options;
  const renderer = createTuiEventRenderer(io);
  const tuiConfirmToolCall =
    confirmToolCall ?? createTuiToolConfirmation(io, renderer.closeAssistantBlock);

  const run = await runCodingTask({
    ...taskOptions,
    recordWorkspaceDiff: taskOptions.recordWorkspaceDiff ?? {
      includeDiff: false,
    },
    confirmToolCall: tuiConfirmToolCall,
    onEvent: async (event) => {
      await renderer.onEvent(event);
      await onEvent?.(event);
    },
  });
  const workspaceSummary = formatWorkspaceSummary(run.workspaceDiffReport);
  if (workspaceSummary) {
    await io.write(workspaceSummary);
  }

  return run;
}

export function createDefaultTuiIo(): TuiIo {
  return {
    write: (text) => {
      output.write(text);
    },
    confirm: async (prompt) => {
      const readline = createInterface({ input, output });
      try {
        const answer = await readline.question(prompt);
        return ["y", "yes"].includes(answer.trim().toLowerCase());
      } finally {
        readline.close();
      }
    },
  };
}

export function createTuiToolConfirmation(
  io: TuiIo,
  beforePrompt?: () => Promise<void> | void,
): AgentToolConfirmation {
  return async (toolCall, tool, preview) => {
    await beforePrompt?.();
    await renderToolConfirmation(io, {
      toolCall,
      tool,
      preview,
    });

    return await io.confirm("allow? [y/N] ");
  };
}

async function renderToolConfirmation(
  io: TuiIo,
  confirmation: TuiToolConfirmation,
): Promise<void> {
  await io.write(`permission required: ${confirmation.tool.name}\n`);
  await io.write(`arguments:\n${formatToolArguments(confirmation.toolCall.arguments)}\n`);

  if (confirmation.preview) {
    await io.write(`preview:\n${confirmation.preview}\n`);
  }
}
