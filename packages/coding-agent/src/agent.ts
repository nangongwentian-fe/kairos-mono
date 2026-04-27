import {
  Agent,
  type AgentOptions,
  type AgentTool,
} from "@kairos/agent";
import type { CodingAgentOptions } from "./types.js";
import {
  createCodingAgentFileState,
  createEditFileTool,
  createGrepTool,
  createListDirTool,
  createReadFileTool,
  createRunCommandTool,
} from "./tools/index.js";

export const DEFAULT_CODING_AGENT_SYSTEM_PROMPT =
  "You are a coding agent. Use list_dir to inspect directories, grep to search file contents, and read_file to inspect files before answering. Use edit_file for precise text replacements only after reading the target file. Use run_command to verify changes with tests or type checks when needed. Do not claim to have inspected, edited, or verified a path unless you used a tool.";

export function createCodingAgent(options: CodingAgentOptions): Agent {
  const fileState = createCodingAgentFileState();
  const agentOptions: AgentOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt ?? DEFAULT_CODING_AGENT_SYSTEM_PROMPT,
    tools: mergeTools(
      [
        createListDirTool({ root: options.root }),
        createGrepTool({ root: options.root }),
        createReadFileTool({ root: options.root, fileState }),
        createEditFileTool({ root: options.root, fileState }),
        createRunCommandTool({ root: options.root }),
      ],
      options.tools ?? [],
    ),
    maxTurns: options.maxTurns,
    messages: options.messages,
    stream: options.stream,
    confirmToolCall: options.confirmToolCall,
  };

  return new Agent(agentOptions);
}

function mergeTools(
  builtInTools: readonly AgentTool<any>[],
  customTools: readonly AgentTool<any>[],
): AgentTool<any>[] {
  const tools = new Map<string, AgentTool<any>>();
  for (const tool of builtInTools) {
    tools.set(tool.name, tool);
  }
  for (const tool of customTools) {
    tools.set(tool.name, tool);
  }

  return Array.from(tools.values());
}
