import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { requireModel } from "@kairos/ai";
import {
  createCodingAgent,
  createGrepTool,
  createListDirTool,
  createReadFileTool,
} from "../src/index";

const hasOpenCodeApiKey = Boolean(process.env.OPENCODE_API_KEY);
const maybeTest = hasOpenCodeApiKey ? test : test.skip;

describe("@kairos/coding-agent tools integration", () => {
  maybeTest("lets opencode-go list, grep, and read real workspace files", async () => {
    const root = await mkdtemp(join(tmpdir(), "kairos-read-file-integration-"));
    try {
      await writeFile(
        join(root, "README.md"),
        "Kairos coding smoke file contains: TOOL_READ_SUCCESS.\nSearch marker: SEARCH_TARGET.\n",
        "utf8",
      );

      const model = requireModel("opencode-go", "kimi-k2.6");

      let listDirExecuted = false;
      let grepExecuted = false;
      let readFileExecuted = false;
      const listDirTool = createListDirTool({ root });
      const grepTool = createGrepTool({ root });
      const readFileTool = createReadFileTool({ root });
      const agent = createCodingAgent({
        root,
        model,
        maxTurns: 5,
        systemPrompt:
          "You are testing a coding agent. You must call list_dir with path \".\" first, then call grep with pattern \"SEARCH_TARGET\" and path \".\", then call read_file with path \"README.md\". After all three tool results, reply with one short English sentence that includes TOOL_READ_SUCCESS.",
        tools: [
          {
            ...listDirTool,
            execute: async (args) => {
              listDirExecuted = true;
              return await listDirTool.execute(args);
            },
          },
          {
            ...grepTool,
            execute: async (args) => {
              grepExecuted = true;
              return await grepTool.execute(args);
            },
          },
          {
            ...readFileTool,
            execute: async (args) => {
              readFileExecuted = true;
              return await readFileTool.execute(args);
            },
          },
        ],
      });

      const result = await agent.run(
        "Inspect the workspace with list_dir, locate SEARCH_TARGET with grep, then read README.md and include the success token in your final answer.",
      );
      const finalText = result.response.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      expect(listDirExecuted).toBe(true);
      expect(grepExecuted).toBe(true);
      expect(readFileExecuted).toBe(true);
      expect(result.stopReason).toBe("end_turn");
      expect(result.turns).toBeGreaterThanOrEqual(2);
      expect(finalText).toContain("TOOL_READ_SUCCESS");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 45_000);
});
