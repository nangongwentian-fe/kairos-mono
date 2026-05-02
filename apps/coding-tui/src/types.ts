import type { AgentEventListener } from "@kairos/agent";
import type {
  CodingSession,
  CodingSessionOptions,
  CodingSessionRecord,
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

export interface CodingTuiLineReader {
  question: (prompt: string) => Promise<string | undefined>;
  close?: () => Promise<void> | void;
}

export type CodingTuiInteractiveInput =
  | { type: "empty" }
  | { type: "input"; input: string }
  | { type: "help" }
  | { type: "new" }
  | { type: "exit" }
  | { type: "sessions" }
  | { type: "resume"; id: string }
  | { type: "unknown_command"; command: string };

export type CodingTuiInteractiveCommand =
  Exclude<CodingTuiInteractiveInput["type"], "input" | "empty">;

export interface RunCodingTuiInteractiveOptions
  extends CodingSessionOptions {
  initialInput?: string;
  io?: TuiIo;
  lineReader?: CodingTuiLineReader;
  onEvent?: AgentEventListener;
  prompt?: string;
  session?: CodingSession;
  sessionRecord?: CodingSessionRecord;
  sessionStoreDir?: string;
}
