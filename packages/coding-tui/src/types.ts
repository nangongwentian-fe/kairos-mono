import type { AgentEventListener } from "@kairos/agent";
import type {
  RunCodingTaskOptions,
  RunCodingTaskResult,
} from "@kairos/coding-agent";
import type { TuiIo } from "@kairos/tui";

export interface RunCodingTuiTaskOptions
  extends Omit<RunCodingTaskOptions, "onEvent"> {
  io?: TuiIo;
  onEvent?: AgentEventListener;
}

export interface RunCodingTuiTaskResult extends RunCodingTaskResult {}

export type RunTuiTaskOptions = RunCodingTuiTaskOptions;
export type RunTuiTaskResult = RunCodingTuiTaskResult;
