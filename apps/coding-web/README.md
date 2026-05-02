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
- Write and execute tools pause for browser approval before they run.
- Approval is per tool call. The browser can allow once or deny.
- The server still applies the coding-agent tool policy before approval, so protected paths and blocked commands do not reach the browser prompt.
