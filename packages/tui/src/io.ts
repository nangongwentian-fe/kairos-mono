import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { AgentToolConfirmation } from "@kairos/agent";
import { formatToolArguments } from "./format.js";
import type { TuiIo, TuiToolConfirmation } from "./types.js";

export function createDefaultTuiIo(): TuiIo {
  return {
    write: (text) => {
      output.write(text);
    },
    confirm: async (prompt) => {
      const readline = createInterface({ input, output });
      try {
        const answer = await readline.question(prompt);
        return ["y", "yes"].includes(answer.trim().toLowerCase());
      } finally {
        readline.close();
      }
    },
  };
}

export function createTuiToolConfirmation(
  io: TuiIo,
  beforePrompt?: () => Promise<void> | void,
): AgentToolConfirmation {
  return async (toolCall, tool, preview) => {
    await beforePrompt?.();
    await renderToolConfirmation(io, {
      toolCall,
      tool,
      preview,
    });

    return await io.confirm("allow? [y/N] ");
  };
}

async function renderToolConfirmation(
  io: TuiIo,
  confirmation: TuiToolConfirmation,
): Promise<void> {
  await io.write(`permission required: ${confirmation.tool.name}\n`);
  await io.write(`arguments:\n${formatToolArguments(confirmation.toolCall.arguments)}\n`);

  if (confirmation.preview) {
    await io.write(`preview:\n${confirmation.preview}\n`);
  }
}
