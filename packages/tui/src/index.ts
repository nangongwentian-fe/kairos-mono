export const KAIROS_TUI_PACKAGE = "@kairos/tui";

export {
  createDefaultTuiIo,
  createTuiToolConfirmation,
  runTuiTask,
} from "./task.js";
export { createTuiEventRenderer } from "./renderer.js";
export {
  TUI_JSON_EVENT_VERSION,
  createTuiJsonEventContext,
  formatTuiJsonEvent,
  toTuiJsonEvents,
} from "./json-events.js";
export {
  formatInlineArguments,
  formatToolArguments,
  formatToolCallSummary,
  formatToolResult,
  truncate,
} from "./format.js";
export type {
  RunTuiTaskOptions,
  RunTuiTaskResult,
  TuiEventRenderer,
  TuiIo,
  TuiToolConfirmation,
} from "./types.js";
export type {
  TuiJsonAssistantDeltaEvent,
  TuiJsonEvent,
  TuiJsonEventContext,
  TuiJsonRunEndEvent,
  TuiJsonRunStartEvent,
  TuiJsonToolEndEvent,
  TuiJsonToolErrorEvent,
  TuiJsonToolStartEvent,
  TuiJsonTodoUpdateEvent,
} from "./json-events.js";
export type {
  TuiTodoItem,
  TuiTodoStatus,
  TuiTodoUpdate,
} from "./todo.js";
