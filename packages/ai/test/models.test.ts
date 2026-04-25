import { describe, expect, test } from "bun:test";

import { getModel, getModels, getProviders, requireModel } from "../src/index";

describe("@kairos/ai model registry", () => {
  test("returns the built-in opencode-go provider", () => {
    expect(getProviders()).toEqual(["opencode-go"]);
  });

  test("returns the static opencode-go chat/completions model list", () => {
    const models = getModels("opencode-go");
    const modelIds = models.map((model) => model.id);

    expect(modelIds).toEqual([
      "glm-5.1",
      "glm-5",
      "kimi-k2.5",
      "kimi-k2.6",
      "mimo-v2-pro",
      "mimo-v2-omni",
      "mimo-v2.5-pro",
      "mimo-v2.5",
      "qwen3.6-plus",
      "qwen3.5-plus",
    ]);
  });

  test("can resolve a single opencode-go model", () => {
    const model = getModel("opencode-go", "kimi-k2.6");

    expect(model).toBeDefined();
    expect(model?.api).toBe("openai-completions");
    expect(model?.provider).toBe("opencode-go");
    expect(model?.baseUrl).toBe("https://opencode.ai/zen/go/v1");
    expect(model?.apiKeyEnv).toBe("OPENCODE_API_KEY");
    expect(model?.supportsTools).toBe(true);
  });

  test("can require a single opencode-go model", () => {
    const model = requireModel("opencode-go", "kimi-k2.6");

    expect(model.id).toBe("kimi-k2.6");
    expect(model.provider).toBe("opencode-go");
  });

  test("does not expose the Go models that use /messages", () => {
    expect(getModel("opencode-go", "minimax-m2.5")).toBeUndefined();
    expect(getModel("opencode-go", "minimax-m2.7")).toBeUndefined();
  });

  test("throws a clear error when requiring an unknown model", () => {
    expect(() => requireModel("opencode-go", "missing-model")).toThrow(
      "Unknown model: opencode-go/missing-model",
    );
  });
});
