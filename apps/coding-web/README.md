# @kairos/coding-web

Minimal browser UI for `@kairos/coding-agent`.

Run from the repo root:

```bash
bun run coding-web:dev
```

Open:

```text
http://127.0.0.1:4174
```

Current scope:

- The Bun server keeps the model key on the server.
- Browser requests stream `@kairos/web-ui` state updates over server-sent events.
- The UI renders user messages, assistant text, tool calls, and `todo_write`.
- Sessions are in memory and keyed by the browser session id.
- Write and execute tools are denied by default until browser approval is added.
