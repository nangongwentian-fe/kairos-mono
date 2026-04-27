import type {
  AgentEvent,
  AgentEventListener,
  AgentRunResult,
  AgentTool,
  AgentTrace,
  AgentToolPreview,
} from "@kairos/agent";
import type { ToolCall } from "@kairos/ai";
import type { RunCodingTaskOptions } from "@kairos/coding-agent";

export interface TuiIo {
  write: (text: string) => Promise<void> | void;
  confirm: (prompt: string) => Promise<boolean> | boolean;
}

export interface RunTuiTaskOptions
  extends Omit<RunCodingTaskOptions, "onEvent"> {
  io?: TuiIo;
  onEvent?: AgentEventListener;
}

export interface RunTuiTaskResult {
  result: AgentRunResult;
  trace: AgentTrace;
}

export interface TuiToolConfirmation {
  toolCall: ToolCall;
  tool: AgentTool<any>;
  preview?: AgentToolPreview;
}

export interface TuiEventRenderer {
  onEvent: AgentEventListener;
  closeAssistantBlock: () => Promise<void>;
}
