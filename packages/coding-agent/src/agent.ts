import {
  Agent,
  type AgentOptions,
  type AgentMiddleware,
  type AnyAgentTool,
} from "@kairos/agent";
import type { CodingAgentOptions } from "./types.js";
import { createCodingPermissionMiddleware } from "./tool-policy.js";
import { createTodoReminderMiddleware } from "./todo-reminder.js";
import {
  createCodingAgentFileState,
  createEditFileTool,
  createGrepTool,
  createListDirTool,
  createReadFileTool,
  createRunCommandTool,
  createTodoWriteTool,
} from "./tools/index.js";

export const DEFAULT_CODING_AGENT_SYSTEM_PROMPT =
  "You are a coding agent. Use todo_write to track non-trivial multi-step work. Use list_dir to inspect directories, grep to search file contents, and read_file to inspect files before answering. Use edit_file for precise text replacements only after reading the target file. Use run_command to verify changes with tests or type checks when needed. Do not claim to have inspected, edited, or verified a path unless you used a tool.";

export function createCodingAgent(options: CodingAgentOptions): Agent {
  const fileState = createCodingAgentFileState();
  const tools = mergeTools(
    [
      createListDirTool({ root: options.root }),
      createGrepTool({ root: options.root }),
      createReadFileTool({ root: options.root, fileState }),
      createTodoWriteTool(),
      createEditFileTool({ root: options.root, fileState }),
      createRunCommandTool({ root: options.root }),
    ],
    options.tools ?? [],
  );
  const agentOptions: AgentOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt ?? DEFAULT_CODING_AGENT_SYSTEM_PROMPT,
    tools,
    maxTurns: options.maxTurns,
    messages: options.messages,
    stream: options.stream,
    confirmToolCall: options.confirmToolCall,
    middleware: createCodingAgentMiddleware(options, tools),
  };

  return new Agent(agentOptions);
}

function createCodingAgentMiddleware(
  options: CodingAgentOptions,
  tools: readonly AnyAgentTool[],
): AgentMiddleware[] {
  const middleware: AgentMiddleware[] = [];
  if (
    options.toolPolicy !== false &&
    tools.some(
      (tool) => tool.name === "edit_file" || tool.name === "run_command",
    )
  ) {
    middleware.push(
      createCodingPermissionMiddleware({
        root: options.root,
        ...(options.toolPolicy ?? {}),
      }),
    );
  }

  if (
    options.todoReminder !== false &&
    tools.some((tool) => tool.name === "todo_write")
  ) {
    middleware.push(createTodoReminderMiddleware(options.todoReminder));
  }

  middleware.push(...(options.middleware ?? []));
  return middleware;
}

function mergeTools(
  builtInTools: readonly AnyAgentTool[],
  customTools: readonly AnyAgentTool[],
): AnyAgentTool[] {
  const tools = new Map<string, AnyAgentTool>();
  for (const tool of builtInTools) {
    tools.set(tool.name, tool);
  }
  for (const tool of customTools) {
    tools.set(tool.name, tool);
  }

  return Array.from(tools.values());
}
