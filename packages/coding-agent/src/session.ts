import {
  createTraceRecorder,
  type AgentEventListener,
  type AgentState,
} from "@kairos/agent";
import type { Message } from "@kairos/ai";
import { createCodingAgent } from "./agent.js";
import type {
  CodingSession,
  CodingSessionOptions,
  CodingSessionRunOptions,
  RunCodingTaskResult,
  WorkspaceDiffOptions,
  WorkspaceGuardOptions,
  WorkspaceDiffResult,
} from "./types.js";
import {
  collectWorkspaceDiff,
  createWorkspaceDiffReport,
  createWorkspaceDirtyReminderMiddleware,
} from "./workspace-diff.js";

export function createCodingSession(
  options: CodingSessionOptions,
): CodingSession {
  let currentWorkspaceBefore: WorkspaceDiffResult | undefined;
  const agent = createCodingAgent({
    ...options,
    middleware: [
      createWorkspaceDirtyReminderMiddleware(() => currentWorkspaceBefore),
      ...(options.middleware ?? []),
    ],
  });

  return {
    get state(): AgentState {
      return agent.state;
    },
    subscribe(listener: AgentEventListener): () => void {
      return agent.subscribe(listener);
    },
    reset(messages: readonly Message[] = []): void {
      agent.reset(messages);
    },
    async run(
      input: string,
      runOptions: CodingSessionRunOptions = {},
    ): Promise<RunCodingTaskResult> {
      if (agent.state.isRunning) {
        throw new Error("Coding session is already running.");
      }

      const workspaceDiffOptions = resolveWorkspaceDiffOptions(
        runOptions.recordWorkspaceDiff,
        options.recordWorkspaceDiff,
      );
      const workspaceGuardOptions = resolveWorkspaceGuardOptions(
        runOptions.workspaceGuard,
        options.workspaceGuard,
      );
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

      currentWorkspaceBefore =
        workspaceGuardOptions && workspaceBefore ? workspaceBefore : undefined;

      const recorder = createTraceRecorder();
      const unsubscribeRecorder = agent.subscribe(recorder.onEvent);
      const unsubscribeRunListener = runOptions.onEvent
        ? agent.subscribe(runOptions.onEvent)
        : undefined;

      try {
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
      } finally {
        currentWorkspaceBefore = undefined;
        unsubscribeRunListener?.();
        unsubscribeRecorder();
      }
    },
  };
}

function resolveWorkspaceDiffOptions(
  runValue: boolean | WorkspaceDiffOptions | undefined,
  sessionValue: boolean | WorkspaceDiffOptions | undefined,
): WorkspaceDiffOptions | undefined {
  const value = runValue ?? sessionValue;
  if (!value) {
    return undefined;
  }

  return value === true ? {} : value;
}

function resolveWorkspaceGuardOptions(
  runValue: boolean | WorkspaceGuardOptions | undefined,
  sessionValue: boolean | WorkspaceGuardOptions | undefined,
): WorkspaceGuardOptions | undefined {
  const value = runValue ?? sessionValue ?? true;
  if (value === false) {
    return undefined;
  }

  return value === true ? {} : value;
}
