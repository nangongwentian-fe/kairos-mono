# @kairos/web-ui

Framework-agnostic Web UI state helpers for Kairos.

This package does not render a page yet. Its first responsibility is to reduce
`@kairos/agent` runtime events into a stable transcript state that a future
React, Lit, or Solid UI can render.

## Event State

```ts
import { Agent } from "@kairos/agent";
import {
  createWebUiEventStore,
  type WebUiState,
} from "@kairos/web-ui";

const store = createWebUiEventStore();

store.subscribe((state: WebUiState) => {
  console.log(state.status, state.items);
});

const agent = new Agent({ model, tools });
agent.subscribe((event) => {
  store.dispatch(event);
});

await agent.run("Inspect README.md");
```

If the agent call rejects, mark the UI state explicitly:

```ts
try {
  await agent.run("Inspect README.md");
} catch (error) {
  store.fail(error);
}
```

The state tracks:

- User transcript items from `agent_start`.
- Streaming assistant text from model deltas.
- Tool calls as `pending`, `running`, `completed`, or `error`.
- `todo_write` results as a small `todos` view model for a future todo panel.
- Final run summary from `agent_end`.
- Failed run state via `store.fail(error)` when the caller catches an error.

The package intentionally avoids DOM and framework dependencies at this layer.
