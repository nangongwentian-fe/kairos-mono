# @kairos/coding-tui

Terminal adapter and CLI for `@kairos/coding-agent`.

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

Equivalent direct command:

```bash
bun --env-file=.env.local packages/coding-tui/src/cli.ts "Read README.md and summarize it."
```

Use another model or workspace root:

```bash
bun run kairos --model glm-5.1 --root packages/ai "List the public exports."
```

The CLI uses `OPENCODE_API_KEY` from `.env.local` and defaults to `opencode-go/kimi-k2.6`.

```ts
import { requireModel } from "@kairos/ai";
import { runCodingTuiTask } from "@kairos/coding-tui";

const model = requireModel("opencode-go", "kimi-k2.6");

const run = await runCodingTuiTask({
  root: process.cwd(),
  model,
  input: "Read README.md and summarize it.",
});

console.log(run.result.stopReason);
```

Current scope:

- `packages/coding-tui/src/cli.ts` provides a minimal Bun CLI entry.
- The CLI supports normal TUI output, `--print` final-text output, `--json` event output, `--record` explicit run records with workspace diff, and `-` for standard input.
- `--json` emits stable versioned JSONL events through `@kairos/tui`.
- `runCodingTuiTask()` calls `runCodingTask()` and renders live events as plain terminal text.
- Normal TUI output includes a workspace change summary after the run. It records file status only, without full diff text.
- `--record` still writes the full workspace diff to the JSON run record.
- Write and execute tools use `io.confirm()` by default.
- Tool confirmations print tool arguments and preview text, including edit diffs.
