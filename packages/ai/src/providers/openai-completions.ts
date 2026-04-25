import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions.js";

import type {
  AssistantContentBlock,
  AssistantMessage,
  JsonValue,
  ModelRequest,
  ModelResponse,
  ModelStopReason,
  ModelStream,
  ModelStreamEvent,
  OpenAICompatibleModel,
  TextBlock,
  ToolCall,
  ToolDefinition,
} from "../contracts.js";

interface PendingToolCall {
  id?: string;
  name?: string;
  argumentsText: string;
}

export function streamOpenAICompletions(
  model: OpenAICompatibleModel,
  request: ModelRequest,
): ModelStream {
  return createModelStream(async (push) => {
    if (request.tools?.length && !model.supportsTools) {
      throw new Error(`Model ${model.id} does not support tools.`);
    }

    const client = new OpenAI({
      apiKey: getRequiredApiKey(model.apiKeyEnv),
      baseURL: model.baseUrl,
    });

    const { data: completionStream, response } = await client.chat.completions
      .create(buildStreamParams(model, request))
      .withResponse();

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/event-stream")) {
      throw new Error(
        `Expected text/event-stream response, got ${contentType || "unknown"}.`,
      );
    }

    const output: ModelResponse = {
      message: {
        role: "assistant",
        content: [],
      },
      stopReason: "end_turn",
    };

    push({
      type: "response_start",
      message: {
        role: "assistant",
        content: [],
      },
    });

    const pendingToolCalls = new Map<number, PendingToolCall>();
    let currentTextBlock: TextBlock | undefined;

    for await (const chunk of completionStream) {
      const choice = chunk.choices[0];
      if (!choice) {
        continue;
      }

      const delta = choice.delta;
      if (delta.content) {
        currentTextBlock = appendText(output.message.content, currentTextBlock, delta.content);
        push({
          type: "text_delta",
          delta: delta.content,
        });
      }

      if (delta.tool_calls?.length) {
        currentTextBlock = undefined;
        accumulateToolCalls(pendingToolCalls, delta.tool_calls);
      }

      if (choice.finish_reason) {
        output.stopReason = mapStopReason(choice.finish_reason);
      }
    }

    finalizeToolCalls(output.message.content, pendingToolCalls, push);
    if (pendingToolCalls.size > 0) {
      output.stopReason = "tool_calls";
    }

    return output;
  });
}

function getRequiredApiKey(envName: string): string {
  const apiKey = (
    globalThis as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.[envName];
  if (!apiKey) {
    throw new Error(`Missing API key. Set ${envName}.`);
  }

  return apiKey;
}

function buildStreamParams(
  model: OpenAICompatibleModel,
  request: ModelRequest,
): ChatCompletionCreateParamsStreaming {
  const params: ChatCompletionCreateParamsStreaming = {
    model: model.id,
    messages: convertMessages(request),
    stream: true,
  };

  if (request.tools?.length) {
    params.tools = request.tools.map(convertToolDefinition);
  }

  if (model.provider === "opencode-go") {
    // OpenCode Go routes reasoning models through OpenRouter. Until Kairos
    // models thinking blocks explicitly, disable reasoning so tool follow-up
    // messages do not need provider-specific reasoning_content fields.
    (
      params as ChatCompletionCreateParamsStreaming & {
        reasoning?: { effort: "none" };
      }
    ).reasoning = { effort: "none" };
  }

  return params;
}

function convertMessages(request: ModelRequest): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  if (request.systemPrompt) {
    messages.push({
      role: "system",
      content: request.systemPrompt,
    });
  }

  for (const message of request.messages) {
    if (message.role === "user") {
      messages.push({
        role: "user",
        content: message.content,
      });
      continue;
    }

    if (message.role === "tool") {
      const toolMessage: ChatCompletionToolMessageParam = {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      };

      messages.push(toolMessage);
      continue;
    }

    messages.push(convertAssistantMessage(message));
  }

  return messages;
}

function convertAssistantMessage(
  message: AssistantMessage,
): ChatCompletionAssistantMessageParam {
  const textContent = message.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const toolCalls = message.content
    .filter(
      (block): block is Extract<AssistantContentBlock, { type: "tool-call" }> =>
        block.type === "tool-call",
    )
    .map((block) => ({
      id: block.call.id,
      type: "function" as const,
      function: {
        name: block.call.name,
        arguments: JSON.stringify(block.call.arguments),
      },
    }));

  return {
    role: "assistant",
    content: textContent.length > 0 ? textContent : toolCalls.length > 0 ? null : "",
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

function convertToolDefinition(tool: ToolDefinition): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? {
        type: "object",
        properties: {},
        additionalProperties: true,
      },
    },
  };
}

function appendText(
  content: AssistantContentBlock[],
  currentBlock: TextBlock | undefined,
  delta: string,
): TextBlock {
  if (currentBlock) {
    currentBlock.text += delta;
    return currentBlock;
  }

  const nextBlock: TextBlock = {
    type: "text",
    text: delta,
  };
  content.push(nextBlock);
  return nextBlock;
}

function accumulateToolCalls(
  pendingToolCalls: Map<number, PendingToolCall>,
  toolCalls: ChatCompletionChunk.Choice.Delta.ToolCall[],
): void {
  for (const toolCall of toolCalls) {
    const current = pendingToolCalls.get(toolCall.index) ?? {
      argumentsText: "",
    };

    current.id = toolCall.id ?? current.id;
    current.name = toolCall.function?.name ?? current.name;
    current.argumentsText += toolCall.function?.arguments ?? "";

    pendingToolCalls.set(toolCall.index, current);
  }
}

function finalizeToolCalls(
  content: AssistantContentBlock[],
  pendingToolCalls: Map<number, PendingToolCall>,
  push: (event: ModelStreamEvent) => void,
): void {
  const orderedToolCalls = Array.from(pendingToolCalls.entries()).sort(
    ([leftIndex], [rightIndex]) => leftIndex - rightIndex,
  );

  for (const [index, pendingToolCall] of orderedToolCalls) {
    if (!pendingToolCall.name) {
      throw new Error(`Incomplete tool call at index ${index}.`);
    }

    const finalizedToolCall: ToolCall = {
      id: pendingToolCall.id ?? `tool-call-${index + 1}`,
      name: pendingToolCall.name,
      arguments: parseToolArguments(pendingToolCall.argumentsText),
    };

    content.push({
      type: "tool-call",
      call: finalizedToolCall,
    });

    push({
      type: "tool_call",
      toolCall: finalizedToolCall,
    });
  }
}

function parseToolArguments(argumentsText: string): JsonValue {
  if (!argumentsText.trim()) {
    return {};
  }

  try {
    return JSON.parse(argumentsText) as JsonValue;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new Error(`Invalid tool call arguments: ${message}`);
  }
}

function mapStopReason(
  finishReason: ChatCompletionChunk.Choice["finish_reason"],
): ModelStopReason {
  switch (finishReason) {
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "max_tokens";
    case "stop":
    case "content_filter":
    default:
      return "end_turn";
  }
}

function createModelStream(
  run: (push: (event: ModelStreamEvent) => void) => Promise<ModelResponse>,
): ModelStream {
  const queue: ModelStreamEvent[] = [];
  const waiters: Array<() => void> = [];
  let settled = false;
  let streamError: unknown;

  const notify = () => {
    const pendingWaiters = waiters.splice(0, waiters.length);
    for (const waiter of pendingWaiters) {
      waiter();
    }
  };

  const resultPromise = run((event) => {
    queue.push(event);
    notify();
  })
    .then((response) => {
      queue.push({
        type: "response_end",
        response,
      });
      settled = true;
      notify();
      return response;
    })
    .catch((error) => {
      streamError = error;
      settled = true;
      notify();
      throw error;
    });

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (queue.length > 0) {
          const event = queue.shift();
          if (event) {
            yield event;
            continue;
          }
        }

        if (streamError) {
          throw streamError;
        }

        if (settled) {
          return;
        }

        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
    },
    result() {
      return resultPromise;
    },
  };
}
