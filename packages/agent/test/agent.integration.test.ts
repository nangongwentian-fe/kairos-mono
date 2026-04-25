import { describe, expect, test } from "bun:test";

import { requireModel } from "@kairos/ai";
import { Agent } from "../src/index";
import type { ToolResultMessage } from "@kairos/ai";

const hasOpenCodeApiKey = Boolean(process.env.OPENCODE_API_KEY);
const maybeTest = hasOpenCodeApiKey ? test : test.skip;

describe("@kairos/agent opencode-go integration", () => {
  maybeTest("runs a real opencode-go model request", async () => {
    const model = requireModel("opencode-go", "kimi-k2.6");

    const agent = new Agent({
      model,
      maxTurns: 1,
      systemPrompt:
        "Reply with exactly one short English sentence. Do not call tools.",
    });

    const result = await agent.run("Say: Kairos agent smoke test passed.");
    const assistantMessage = result.response.message;
    const text = assistantMessage.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    expect(result.stopReason).toBe("end_turn");
    expect(result.turns).toBe(1);
    expect(text.length).toBeGreaterThan(0);
  }, 30_000);

  maybeTest("executes a real model-requested tool call", async () => {
    const model = requireModel("opencode-go", "kimi-k2.6");

    let toolExecuted = false;
    const smokeToken = "KAIROS_TOOL_SMOKE_TOKEN";
    const agent = new Agent({
      model,
      maxTurns: 3,
      systemPrompt:
        "You are testing an agent loop. You must call the get_smoke_token tool before answering. After the tool returns, reply with one short English sentence that includes the returned token.",
      tools: [
        {
          name: "get_smoke_token",
          description:
            "Required smoke-test tool. Returns the exact token that must appear in the final answer.",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          execute: () => {
            toolExecuted = true;
            return smokeToken;
          },
        },
      ],
    });

    const result = await agent.run(
      "Call get_smoke_token now, then include its returned token in your final answer.",
    );
    const toolMessage = result.messages.find(
      (message): message is ToolResultMessage =>
        message.role === "tool" && message.toolName === "get_smoke_token",
    );
    const finalText = result.response.message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    expect(toolExecuted).toBe(true);
    expect(toolMessage?.content).toBe(smokeToken);
    expect(result.stopReason).toBe("end_turn");
    expect(result.turns).toBeGreaterThanOrEqual(2);
    expect(finalText).toContain(smokeToken);
  }, 45_000);
});
