export * from "./contracts.js";
export * from "./models.js";

import type { Model, ModelRequest, ModelStream } from "./contracts.js";
import { streamOpenAICompletions } from "./providers/openai-completions.js";

export function stream(model: Model, request: ModelRequest): ModelStream {
  switch (model.api) {
    case "openai-completions":
      return streamOpenAICompletions(model, request);
    default: {
      const unknownApi: never = model.api;
      throw new Error(`Unsupported model API: ${unknownApi}`);
    }
  }
}
