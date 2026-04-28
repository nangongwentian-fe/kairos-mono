# @kairos/tui

Generic terminal UI helpers for Kairos.

This package is intentionally not coding-agent specific. It owns small terminal
building blocks that other product packages can compose:

- `createTuiEventRenderer()` for rendering generic `@kairos/agent` events.
- Stable JSONL event mapping via `toTuiJsonEvents()`.
- Terminal IO and confirmation helpers.
- Formatting helpers for tool calls, tool arguments, tool results, and todos.

The coding-agent CLI now lives in `@kairos/coding-tui`.

```ts
import {
  createDefaultTuiIo,
  createTuiEventRenderer,
} from "@kairos/tui";

const io = createDefaultTuiIo();
const renderer = createTuiEventRenderer(io);

agent.subscribe((event) => renderer.onEvent(event));
```

`--json` output from `@kairos/coding-tui` uses this package's public event
protocol:

```json
{"version":1,"type":"run_start","input":"Read README.md and summarize it.","root":"/repo","model":"opencode-go/kimi-k2.6"}
{"version":1,"type":"assistant_delta","text":"README.md says..."}
{"version":1,"type":"todo_update","id":"call_todo","todos":[{"id":"inspect","content":"Inspect README.md","status":"completed"}],"pendingCount":0,"inProgressCount":0,"completedCount":1}
{"version":1,"type":"run_end","stopReason":"end_turn","turns":1}
```
