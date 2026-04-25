import type {
  Model,
  OpenAICompatibleModel,
  OpenAICompatibleModelConfig,
} from "./contracts.js";

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_API_KEY_ENV = "OPENCODE_API_KEY";

export function createOpenAICompatibleModel(
  config: OpenAICompatibleModelConfig,
): OpenAICompatibleModel {
  return Object.freeze({
    id: config.id,
    name: config.name,
    provider: config.provider,
    api: "openai-completions",
    baseUrl: config.baseUrl,
    apiKeyEnv: config.apiKeyEnv,
    supportsTools: config.supportsTools ?? true,
  });
}

export const OPENCODE_GO_MODELS = [
  createOpenAICompatibleModel({
    id: "glm-5.1",
    name: "GLM-5.1",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "glm-5",
    name: "GLM-5",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "mimo-v2-pro",
    name: "MiMo-V2-Pro",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "mimo-v2-omni",
    name: "MiMo-V2-Omni",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "mimo-v2.5-pro",
    name: "MiMo-V2.5-Pro",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "mimo-v2.5",
    name: "MiMo-V2.5",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
  createOpenAICompatibleModel({
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    provider: "opencode-go",
    baseUrl: OPENCODE_GO_BASE_URL,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
  }),
] as const satisfies readonly Model[];

const MODEL_REGISTRY = new Map<string, Map<string, Model>>();

registerModels(OPENCODE_GO_MODELS);

function registerModels(models: readonly Model[]): void {
  for (const model of models) {
    let providerModels = MODEL_REGISTRY.get(model.provider);
    if (!providerModels) {
      providerModels = new Map();
      MODEL_REGISTRY.set(model.provider, providerModels);
    }

    providerModels.set(model.id, model);
  }
}

export function getProviders(): string[] {
  return Array.from(MODEL_REGISTRY.keys());
}

export function getModels(provider: string): Model[] {
  return Array.from(MODEL_REGISTRY.get(provider)?.values() ?? []);
}

export function getModel(provider: string, modelId: string): Model | undefined {
  return MODEL_REGISTRY.get(provider)?.get(modelId);
}

export function requireModel(provider: string, modelId: string): Model {
  const model = getModel(provider, modelId);
  if (!model) {
    throw new Error(`Unknown model: ${provider}/${modelId}`);
  }

  return model;
}
