export const KAIROS_AI_PACKAGE = "@kairos/ai";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: JsonPrimitive[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export interface ToolDefinition<TArgs extends JsonValue = JsonValue> {
  name: string;
  description: string;
  parameters?: JsonSchema;
  execute?: (args: TArgs) => Promise<string> | string;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolCall<TArgs extends JsonValue = JsonValue> {
  id: string;
  name: string;
  arguments: TArgs;
}

export interface ToolCallBlock<TArgs extends JsonValue = JsonValue> {
  type: "tool-call";
  call: ToolCall<TArgs>;
}

export type AssistantContentBlock = TextBlock | ToolCallBlock;

export interface UserMessage {
  role: "user";
  content: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContentBlock[];
}

export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  toolName: string;
  content: string;
  isError?: boolean;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface ModelRequest {
  systemPrompt?: string;
  messages: Message[];
  tools?: readonly ToolDefinition[];
}

export type ModelStopReason = "end_turn" | "tool_calls" | "max_tokens";

export interface ModelResponse {
  message: AssistantMessage;
  stopReason: ModelStopReason;
}

export type ModelStreamEvent =
  | {
      type: "response_start";
      message: AssistantMessage;
    }
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "tool_call";
      toolCall: ToolCall;
    }
  | {
      type: "response_end";
      response: ModelResponse;
    };

export interface ModelStream extends AsyncIterable<ModelStreamEvent> {
  result(): Promise<ModelResponse>;
}

export type ModelApi = "openai-completions";

export interface BaseModel<TApi extends ModelApi = ModelApi> {
  id: string;
  name: string;
  provider: string;
  api: TApi;
  baseUrl: string;
  apiKeyEnv: string;
  supportsTools: boolean;
}

export interface OpenAICompatibleModel
  extends BaseModel<"openai-completions"> {}

export type Model = OpenAICompatibleModel;

export interface OpenAICompatibleModelConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKeyEnv: string;
  supportsTools?: boolean;
}
