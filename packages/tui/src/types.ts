import type {
  AgentEvent,
  AgentEventListener,
  AgentToolPreview,
  AnyAgentTool,
} from "@kairos/agent";
import type { ToolCall } from "@kairos/ai";
import type {
  RunCodingTaskOptions,
  RunCodingTaskResult,
} from "@kairos/coding-agent";

export interface TuiIo {
  write: (text: string) => Promise<void> | void;
  confirm: (prompt: string) => Promise<boolean> | boolean;
}

export interface RunTuiTaskOptions
  extends Omit<RunCodingTaskOptions, "onEvent"> {
  io?: TuiIo;
  onEvent?: AgentEventListener;
}

export interface RunTuiTaskResult extends RunCodingTaskResult {}

export interface TuiToolConfirmation {
  toolCall: ToolCall;
  tool: AnyAgentTool;
  preview?: AgentToolPreview;
}

export interface TuiEventRenderer {
  onEvent: AgentEventListener;
  closeAssistantBlock: () => Promise<void>;
}
