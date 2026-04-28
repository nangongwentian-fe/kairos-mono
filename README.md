# Kairos Mono

Kairos TypeScript monorepo for AI model access, agent runtime, coding-agent products, user interfaces, and tutorial docs.

## Packages

- `@kairos/ai`
- `@kairos/agent`
- `@kairos/tui`
- `@kairos/web-ui`
- `@kairos/coding-agent`

## Apps

- `apps/docs-site`: VitePress tutorial site for the step-by-step Kairos implementation.

## Development

```bash
bun install
bun run typecheck
bun run test:agent
bun run test:coding-agent
bun run test:tui
bun run docs:dev
```
