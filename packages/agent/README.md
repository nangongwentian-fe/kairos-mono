# @kairos/agent

Minimal agent runtime for Kairos.

```ts
import { Agent, createTraceRecorder } from "@kairos/agent";
import { requireModel } from "@kairos/ai";

const model = requireModel("opencode-go", "kimi-k2.6");
const recorder = createTraceRecorder();

const agent = new Agent({
  model,
  systemPrompt: "You are a helpful coding agent.",
  tools: [
    {
      name: "read_file",
      description: "Read a file by path",
      risk: "read",
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
  middleware: [
    {
      name: "add_context",
      beforeModelRequest(request) {
        return {
          ...request,
          systemPrompt: `${request.systemPrompt}\nPrefer concise answers.`,
        };
      },
    },
  ],
});
agent.subscribe(recorder.onEvent);

const result = await agent.run("Read README.md and summarize it.");
console.log(result.stopReason, result.messages);
console.log(recorder.trace.items);
```

## Current scope

- Adds user messages to the transcript.
- Streams one model response per turn through `@kairos/ai`.
- Executes tool calls returned by the model.
- Runs `read` tools automatically.
- Requires `confirmToolCall` for `write` and `execute` tools.
- Supports optional tool previews before confirmation.
- Supports lightweight middleware for updating model requests, blocking tool calls,
  and updating tool results.
- Provides an in-memory trace recorder through `createTraceRecorder()`.
- Appends tool results back into the transcript.
- Continues until the model stops asking for tools.
- Stops at `maxTurns` to avoid endless loops.

Not included yet: persistence, context compaction, parallel tools,
abort signals, and multi-agent orchestration.
