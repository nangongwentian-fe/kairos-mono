import type {
  AssistantMessage,
  Message,
  Model,
  ModelResponse,
  ToolCall,
  ToolResultMessage,
  ModelRequest,
  ToolDefinition,
} from "@kairos/ai";
import type {
  AgentEventSink,
  AgentMiddleware,
  AgentMiddlewareContext,
  AgentRunResult,
  AgentStopReason,
  AgentStreamFunction,
  AnyAgentTool,
  AgentToolCallDecision,
  AgentToolConfirmation,
  AgentToolRisk,
} from "./types.js";

export interface AgentLoopOptions {
  input: string;
  model: Model;
  systemPrompt?: string;
  tools: readonly AnyAgentTool[];
  maxTurns: number;
  messages: Message[];
  stream: AgentStreamFunction;
  confirmToolCall?: AgentToolConfirmation;
  middleware: readonly AgentMiddleware[];
  emit: AgentEventSink;
}

export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentRunResult> {
  const { input, maxTurns, messages, emit } = options;

  messages.push({
    role: "user",
    content: input,
  });

  await emit({ type: "agent_start", input });

  for (let turn = 1; turn <= maxTurns; turn++) {
    await emit({
      type: "turn_start",
      turn,
      messages: [...messages],
    });

    const response = await runModelTurn(options, turn);
    messages.push(response.message);

    await emit({ type: "turn_end", turn, response });

    const toolCalls = getToolCalls(response.message);
    if (toolCalls.length === 0 || response.stopReason !== "tool_calls") {
      return await finish(options, {
        response,
        turns: turn,
        stopReason: toAgentStopReason(response.stopReason),
      });
    }

    if (turn === maxTurns) {
      return await finish(options, {
        response,
        turns: turn,
        stopReason: "max_turns",
      });
    }

    for (const toolCall of toolCalls) {
      await executeToolCall(options, turn, toolCall);
    }
  }

  throw new Error("Agent loop ended unexpectedly.");
}

async function runModelTurn(
  options: AgentLoopOptions,
  turn: number,
): Promise<ModelResponse> {
  const request = await applyBeforeModelRequest(
    options,
    turn,
    {
      systemPrompt: options.systemPrompt,
      messages: [...options.messages],
      tools: toToolDefinitions(options.tools),
    },
  );
  const modelStream = options.stream(options.model, request);

  let response: ModelResponse | undefined;
  for await (const event of modelStream) {
    await options.emit({ type: "model_event", turn, event });
    if (event.type === "response_end") {
      response = event.response;
    }
  }

  return response ?? (await modelStream.result());
}

async function applyBeforeModelRequest(
  options: AgentLoopOptions,
  turn: number,
  request: ModelRequest,
): Promise<ModelRequest> {
  let currentRequest = request;
  for (const middleware of options.middleware) {
    if (!middleware.beforeModelRequest) {
      continue;
    }
    const nextRequest = await middleware.beforeModelRequest(
      currentRequest,
      createMiddlewareContext(options, turn),
    );
    if (nextRequest) {
      currentRequest = nextRequest;
    }
  }

  return currentRequest;
}

function createMiddlewareContext(
  options: AgentLoopOptions,
  turn: number,
): AgentMiddlewareContext {
  return {
    turn,
    model: options.model,
    tools: options.tools,
    messages: [...options.messages],
  };
}

function toToolDefinitions(
  tools: readonly AnyAgentTool[],
): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

async function executeToolCall(
  options: AgentLoopOptions,
  turn: number,
  toolCall: ToolCall,
): Promise<void> {
  await options.emit({ type: "tool_start", turn, toolCall });

  const tool = options.tools.find(
    (candidate) => candidate.name === toolCall.name,
  );
  const risk = tool ? getToolRisk(tool) : undefined;
  const decision = await applyBeforeToolCall(
    options,
    turn,
    toolCall,
    tool,
    risk,
  );
  if (decision?.block) {
    await appendToolResult(
      options,
      turn,
      toolCall,
      {
        content: decision.reason,
        isError: decision.isError ?? true,
      },
      tool,
    );
    return;
  }

  if (!tool) {
    await appendToolResult(options, turn, toolCall, {
      content: `Tool ${toolCall.name} not found.`,
      isError: true,
    });
    return;
  }

  const toolRisk = getToolRisk(tool);
  try {
    const allowed = await confirmToolCallIfNeeded(
      options,
      toolCall,
      tool,
      toolRisk,
    );
    if (!allowed) {
      await appendToolResult(
        options,
        turn,
        toolCall,
        {
          content: `Tool ${toolCall.name} requires confirmation for ${toolRisk} access.`,
          isError: true,
        },
        tool,
      );
      return;
    }

    const content = await tool.execute(toolCall.arguments as never);
    await appendToolResult(
      options,
      turn,
      toolCall,
      {
        content,
        isError: false,
      },
      tool,
    );
  } catch (error) {
    await appendToolResult(
      options,
      turn,
      toolCall,
      {
        content: error instanceof Error ? error.message : String(error),
        isError: true,
      },
      tool,
    );
  }
}

async function applyBeforeToolCall(
  options: AgentLoopOptions,
  turn: number,
  toolCall: ToolCall,
  tool: AnyAgentTool | undefined,
  risk: AgentToolRisk | undefined,
): Promise<AgentToolCallDecision | undefined> {
  for (const middleware of options.middleware) {
    if (!middleware.beforeToolCall) {
      continue;
    }
    const decision = await middleware.beforeToolCall(toolCall, {
      ...createMiddlewareContext(options, turn),
      tool,
      risk,
    });
    if (decision?.block) {
      return decision;
    }
  }

  return undefined;
}

function getToolRisk(tool: AnyAgentTool): AgentToolRisk {
  return tool.risk ?? "read";
}

async function confirmToolCallIfNeeded(
  options: AgentLoopOptions,
  toolCall: ToolCall,
  tool: AnyAgentTool,
  risk: AgentToolRisk,
): Promise<boolean> {
  if (risk === "read") {
    return true;
  }
  if (!options.confirmToolCall) {
    return false;
  }

  const preview = tool.preview
    ? await tool.preview(toolCall.arguments as never)
    : undefined;

  return Boolean(await options.confirmToolCall(toolCall, tool, preview));
}

async function appendToolResult(
  options: AgentLoopOptions,
  turn: number,
  toolCall: ToolCall,
  result: { content: string; isError: boolean },
  tool?: AnyAgentTool,
): Promise<void> {
  let message: ToolResultMessage = {
    role: "tool",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    isError: result.isError || undefined,
  };
  message = await applyAfterToolResult(options, turn, message, toolCall, tool);

  options.messages.push(message);
  await options.emit({
    type: message.isError ? "tool_error" : "tool_end",
    turn,
    toolCall,
    message,
  });
}

async function applyAfterToolResult(
  options: AgentLoopOptions,
  turn: number,
  message: ToolResultMessage,
  toolCall: ToolCall,
  tool: AnyAgentTool | undefined,
): Promise<ToolResultMessage> {
  let currentMessage = message;
  for (const middleware of options.middleware) {
    if (!middleware.afterToolResult) {
      continue;
    }
    const nextMessage = await middleware.afterToolResult(currentMessage, {
      ...createMiddlewareContext(options, turn),
      toolCall,
      tool,
    });
    if (nextMessage) {
      currentMessage = nextMessage;
    }
  }

  return currentMessage;
}

async function finish(
  options: AgentLoopOptions,
  result: Omit<AgentRunResult, "messages">,
): Promise<AgentRunResult> {
  const finalResult: AgentRunResult = {
    ...result,
    messages: [...options.messages],
  };

  await options.emit({
    type: "agent_end",
    result: finalResult,
  });

  return finalResult;
}

function getToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.flatMap((block) =>
    block.type === "tool-call" ? [block.call] : [],
  );
}

function toAgentStopReason(
  responseStopReason: ModelResponse["stopReason"],
): AgentStopReason {
  if (responseStopReason === "tool_calls") {
    return "end_turn";
  }

  return responseStopReason;
}
