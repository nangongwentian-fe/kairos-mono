import { createTraceRecorder } from "@kairos/agent";
import { createCodingAgent } from "./agent.js";
import type {
  RunCodingTaskOptions,
  RunCodingTaskResult,
  WorkspaceDiffOptions,
  WorkspaceGuardOptions,
} from "./types.js";
import {
  collectWorkspaceDiff,
  createWorkspaceDiffReport,
  createWorkspaceDirtyReminderMiddleware,
} from "./workspace-diff.js";

export async function runCodingTask(
  options: RunCodingTaskOptions,
): Promise<RunCodingTaskResult> {
  const {
    input,
    onEvent,
    recordWorkspaceDiff,
    workspaceGuard = true,
    ...agentOptions
  } = options;
  const workspaceDiffOptions = recordWorkspaceDiff
    ? normalizeWorkspaceDiffOptions(recordWorkspaceDiff)
    : undefined;
  const workspaceGuardOptions =
    workspaceGuard === false
      ? undefined
      : normalizeWorkspaceGuardOptions(workspaceGuard);
  const workspaceBeforeOptions =
    workspaceDiffOptions ??
    (workspaceGuardOptions
      ? { ...workspaceGuardOptions, includeDiff: false }
      : undefined);
  const workspaceBefore = workspaceBeforeOptions
    ? await collectWorkspaceDiff({
        root: options.root,
        ...workspaceBeforeOptions,
      })
    : undefined;
  const recorder = createTraceRecorder();
  const agent = createCodingAgent({
    ...agentOptions,
    middleware: workspaceGuardOptions && workspaceBefore
      ? [
          createWorkspaceDirtyReminderMiddleware(workspaceBefore),
          ...(agentOptions.middleware ?? []),
        ]
      : agentOptions.middleware,
  });

  agent.subscribe(recorder.onEvent);
  if (onEvent) {
    agent.subscribe(onEvent);
  }

  const result = await agent.run(input);
  const workspaceDiff = workspaceDiffOptions
    ? await collectWorkspaceDiff({
        root: options.root,
        ...workspaceDiffOptions,
      })
    : undefined;
  const workspaceDiffReport =
    workspaceBefore && workspaceDiff
      ? createWorkspaceDiffReport(workspaceBefore, workspaceDiff)
      : undefined;

  return {
    result,
    trace: recorder.trace,
    ...(workspaceDiff ? { workspaceDiff } : {}),
    ...(workspaceDiffReport ? { workspaceDiffReport } : {}),
  };
}

function normalizeWorkspaceDiffOptions(
  options: true | WorkspaceDiffOptions,
): WorkspaceDiffOptions {
  return options === true ? {} : options;
}

function normalizeWorkspaceGuardOptions(
  options: true | WorkspaceGuardOptions,
): WorkspaceGuardOptions {
  return options === true ? {} : options;
}
