# @kairos/tui

Minimal terminal UI helpers for Kairos.

Run a real OpenCode Go coding task from the repo root:

```bash
bun run kairos "Read README.md and summarize it."
```

Read the task from standard input:

```bash
echo "Read README.md and summarize it." | bun run kairos -
```

Print only the final assistant text:

```bash
bun run kairos --print "Read README.md and summarize it."
```

Print agent events as JSON lines:

```bash
bun run kairos --json "Read README.md and summarize it."
```

Write one explicit run record:

```bash
bun run kairos --record .kairos/runs/last.json "Read README.md and summarize it."
```

Run records may include file contents, command output, and tool arguments. The
repo ignores `.kairos/` by default so local records are not committed by
accident.

`--json` output is a public CLI protocol. It does not expose raw `AgentEvent`
objects from `@kairos/agent`.

```json
{"version":1,"type":"run_start","input":"Read README.md and summarize it.","root":"/repo","model":"opencode-go/kimi-k2.6"}
{"version":1,"type":"assistant_delta","text":"README.md says..."}
{"version":1,"type":"run_end","stopReason":"end_turn","turns":1}
```

Equivalent direct command:

```bash
bun --env-file=.env.local packages/tui/src/cli.ts "Read README.md and summarize it."
```

Use another model or workspace root:

```bash
bun run kairos --model glm-5.1 --root packages/ai "List the public exports."
```

The CLI uses `OPENCODE_API_KEY` from `.env.local` and defaults to `opencode-go/kimi-k2.6`.

```ts
import { requireModel } from "@kairos/ai";
import { runTuiTask } from "@kairos/tui";

const model = requireModel("opencode-go", "kimi-k2.6");

const run = await runTuiTask({
  root: process.cwd(),
  model,
  input: "Read README.md and summarize it.",
});

console.log(run.result.stopReason);
```

Current scope:

- `packages/tui/src/cli.ts` provides a minimal Bun CLI entry.
- The CLI supports normal TUI output, `--print` final-text output, `--json` event output, `--record` explicit run records with workspace diff, and `-` for standard input.
- `--json` emits stable versioned JSONL events through `packages/tui/src/json-events.ts`.
- `runTuiTask()` calls `runCodingTask()` and renders live events as plain terminal text.
- Assistant text is streamed inline.
- Tool start, tool success, tool error, and task completion are printed as separate lines.
- Normal TUI output includes a workspace change summary after the run. It records file status only, without full diff text.
- `--record` still writes the full workspace diff to the JSON run record.
- Write and execute tools use `io.confirm()` by default.
- Tool confirmations print tool arguments and preview text, including edit diffs.

Not included yet: package binary build, full-screen layout, scrollback, markdown rendering, keyboard shortcuts, interactive diff expansion, multi-session state, persistence, and theming.
