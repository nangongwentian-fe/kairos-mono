import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { requireModel } from "@kairos/ai";
import {
  createCodingAgent,
  type RunCommandResult,
} from "../src/index";

const hasOpenCodeApiKey = Boolean(process.env.OPENCODE_API_KEY);
const maybeTest = hasOpenCodeApiKey ? test : test.skip;

describe("@kairos/coding-agent workflow integration", () => {
  maybeTest(
    "lets opencode-go read, edit, and verify a real workspace change",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "kairos-workflow-integration-"));
      try {
        await mkdir(join(root, "src"));
        await writeFile(
          join(root, "src/math.ts"),
          [
            "export function add(a: number, b: number): number {",
            "  return a - b;",
            "}",
            "",
          ].join("\n"),
          "utf8",
        );
        await writeFile(
          join(root, "math.test.ts"),
          [
            'import { expect, test } from "bun:test";',
            'import { add } from "./src/math";',
            "",
            'test("adds numbers", () => {',
            "  expect(add(2, 3)).toBe(5);",
            "});",
            "",
          ].join("\n"),
          "utf8",
        );

        const model = requireModel("opencode-go", "kimi-k2.6");
        const executedTools: string[] = [];
        const confirmedTools: string[] = [];
        const agent = createCodingAgent({
          root,
          model,
          maxTurns: 8,
          systemPrompt: [
            "You are testing a coding agent workflow.",
            "You must use read_file with path \"src/math.ts\" before editing.",
            "Then use edit_file to replace exactly \"return a - b;\" with \"return a + b;\".",
            `Then use run_command with command "${process.execPath}" and args ["test", "math.test.ts"].`,
            "After the command succeeds, reply with exactly WORKFLOW_SUCCESS.",
          ].join(" "),
          confirmToolCall: (_toolCall, tool) => {
            confirmedTools.push(tool.name);
            return true;
          },
        });
        agent.subscribe((event) => {
          if (event.type === "tool_end") {
            executedTools.push(event.toolCall.name);
          }
        });

        const result = await agent.run(
          "Fix src/math.ts, run the test, and return WORKFLOW_SUCCESS.",
        );
        const finalText = result.response.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        const commandMessages = result.messages.filter(
          (message) =>
            message.role === "tool" && message.toolName === "run_command",
        );
        const lastCommandMessage = commandMessages.at(-1);

        expect(executedTools).toContain("read_file");
        expect(executedTools).toContain("edit_file");
        expect(executedTools).toContain("run_command");
        expect(confirmedTools).toContain("edit_file");
        expect(confirmedTools).toContain("run_command");
        expect(result.stopReason).toBe("end_turn");
        expect(finalText).toContain("WORKFLOW_SUCCESS");
        expect(lastCommandMessage).toBeDefined();
        if (!lastCommandMessage) {
          throw new Error("Expected run_command result.");
        }
        if (typeof lastCommandMessage.content !== "string") {
          throw new Error("Expected run_command result content to be a string.");
        }
        expect(JSON.parse(lastCommandMessage.content) as RunCommandResult)
          .toMatchObject({
            command: process.execPath,
            args: ["test", "math.test.ts"],
            exitCode: 0,
            timedOut: false,
          });
        await expect(readFile(join(root, "src/math.ts"), "utf8")).resolves.toContain(
          "return a + b;",
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    90_000,
  );
});
