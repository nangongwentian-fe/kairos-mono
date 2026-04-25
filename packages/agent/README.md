# @kairos/agent

Minimal agent runtime for Kairos.

```ts
import { Agent } from "@kairos/agent";
import { requireModel } from "@kairos/ai";

const model = requireModel("opencode-go", "kimi-k2.6");

const agent = new Agent({
  model,
  systemPrompt: "You are a helpful coding agent.",
  tools: [
    {
      name: "read_file",
      description: "Read a file by path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
      execute: async (args) => {
        return `read ${JSON.stringify(args)}`;
      },
    },
  ],
});

const result = await agent.run("Read README.md and summarize it.");
console.log(result.stopReason, result.messages);
```

## Current scope

- Adds user messages to the transcript.
- Streams one model response per turn through `@kairos/ai`.
- Executes tool calls returned by the model.
- Appends tool results back into the transcript.
- Continues until the model stops asking for tools.
- Stops at `maxTurns` to avoid endless loops.

Not included yet: permissions, persistence, context compaction, parallel tools,
abort signals, and multi-agent orchestration.
