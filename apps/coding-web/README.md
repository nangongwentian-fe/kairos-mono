# @kairos/coding-web

Local browser UI for `@kairos/coding-agent`.

It is a runnable app, not a reusable package. The browser app lives here; shared Web state and event helpers stay in `@kairos/web-ui`.

## Run

Run from the repo root:

```bash
bun run coding-web:dev
```

Open:

```text
http://127.0.0.1:4173
```

## Current Scope

- The client is a React + Vite app.
- In development, Vite serves the React client and proxies `/api/*` to the Bun server.
- In production-style runs, the Bun server serves the built client from `dist/client`.
- The Bun server keeps model keys on the server.
- Browser requests stream `@kairos/web-ui` state updates over server-sent events.
- The UI renders user messages, assistant text, tool calls, approvals, and `todo_write`.
- Sessions are listed in the sidebar. `New` starts a fresh browser session.
- Session metadata is stored in browser `localStorage`; live session state stays in server memory.
- Switching sessions loads the current server-side state for that session id.
- Write and execute tools pause for browser approval before they run.
- Approval is per tool call. The browser can allow once or deny.
- The server still applies the coding-agent tool policy before approval, so protected paths and blocked commands do not reach the browser prompt.

## Client Layout

```text
src/client
  App.tsx
    React app shell, session list, message list, prompt form

  components/ai-elements
    AI Elements components installed into this app

  components/ui
    shadcn/ui primitives used by the app

  main.tsx
    React entry

  styles.css
    Tailwind CSS and app-level response styles
```

## Server API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Health check. |
| `GET /api/session?sessionId=...` | Read the current in-memory Web UI state for a session. |
| `POST /api/run` | Start one agent turn and stream state updates over server-sent events. |
| `POST /api/approval` | Resolve one pending browser approval. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `KAIROS_CODING_WEB_MAX_TURNS` | `50` | Maximum agent turns for one browser run. |
| `KAIROS_CODING_WEB_PORT` | `4174` | Bun API server port. |
| `KAIROS_CODING_WEB_CLIENT_PORT` | `4173` | Vite client port in development. |

## Notes

- `@kairos/web-ui` owns protocol and state helpers.
- `apps/coding-web` owns React components, routing-free app layout, and browser-specific behavior.
- Server restarts clear live session state. Browser session metadata remains, so an old session may reopen as an empty state after restart.
