export const KAIROS_CODING_TUI_PACKAGE = "@kairos/coding-tui";

export {
  runCodingTuiTask,
  runCodingTuiTask as runTuiTask,
} from "./task.js";
export {
  createTuiCliHelp,
  formatPrintOutput,
  parseTuiCliArgs,
  resolveTuiCliInput,
  runTuiCli,
  type ParseTuiCliArgsOptions,
  type TuiCliArgs,
  type TuiCliOutputMode,
} from "./cli.js";
export {
  createInteractiveHelp,
  createInteractiveWelcome,
  parseCodingTuiInteractiveInput,
  runCodingTuiInteractive,
} from "./interactive.js";
export { formatWorkspaceSummary } from "./workspace-summary.js";
export type {
  CodingTuiInteractiveCommand,
  CodingTuiInteractiveInput,
  CodingTuiLineReader,
  RunCodingTuiInteractiveOptions,
  RunCodingTuiTaskOptions,
  RunCodingTuiTaskResult,
  RunTuiTaskOptions,
  RunTuiTaskResult,
} from "./types.js";
