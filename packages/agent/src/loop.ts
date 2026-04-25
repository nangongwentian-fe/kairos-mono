import type {
  AssistantMessage,
  Message,
  Model,
  ModelResponse,
  ToolCall,
  ToolResultMessage,
} from "@kairos/ai";
import type {
  AgentEventSink,
  AgentRunResult,
  AgentStopReason,
  AgentStreamFunction,
  AgentTool,
} from "./types.js";

export interface AgentLoopOptions {
  input: string;
  model: Model;
  systemPrompt?: string;
  tools: readonly AgentTool<any>[];
  maxTurns: number;
  messages: Message[];
  stream: AgentStreamFunction;
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
  const modelStream = options.stream(options.model, {
    systemPrompt: options.systemPrompt,
    messages: [...options.messages],
    tools: options.tools,
  });

  let response: ModelResponse | undefined;
  for await (const event of modelStream) {
    await options.emit({ type: "model_event", turn, event });
    if (event.type === "response_end") {
      response = event.response;
    }
  }

  return response ?? (await modelStream.result());
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
  if (!tool) {
    await appendToolResult(options, turn, toolCall, {
      content: `Tool ${toolCall.name} not found.`,
      isError: true,
    });
    return;
  }

  try {
    const content = await tool.execute(toolCall.arguments);
    await appendToolResult(options, turn, toolCall, {
      content,
      isError: false,
    });
  } catch (error) {
    await appendToolResult(options, turn, toolCall, {
      content: error instanceof Error ? error.message : String(error),
      isError: true,
    });
  }
}

async function appendToolResult(
  options: AgentLoopOptions,
  turn: number,
  toolCall: ToolCall,
  result: { content: string; isError: boolean },
): Promise<void> {
  const message: ToolResultMessage = {
    role: "tool",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    isError: result.isError || undefined,
  };

  options.messages.push(message);
  await options.emit({
    type: result.isError ? "tool_error" : "tool_end",
    turn,
    toolCall,
    message,
  });
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

