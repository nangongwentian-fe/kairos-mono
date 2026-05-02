import { runCodingTask } from "@kairos/coding-agent";
import {
  createDefaultTuiIo,
  createTuiEventRenderer,
  createTuiToolConfirmation,
} from "@kairos/tui";
import type {
  RunCodingTuiTaskOptions,
  RunCodingTuiTaskResult,
} from "./types.js";
import { formatWorkspaceSummary } from "./workspace-summary.js";

export async function runCodingTuiTask(
  options: RunCodingTuiTaskOptions,
): Promise<RunCodingTuiTaskResult> {
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
