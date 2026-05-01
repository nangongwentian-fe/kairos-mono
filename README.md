# Kairos Mono

Kairos TypeScript monorepo for AI model access, agent runtime, coding-agent products, user interfaces, and tutorial docs.

## Packages

- `@kairos/ai`: model contracts, provider registry, and transport implementations.
- `@kairos/agent`: generic agent loop, event protocol, tools, middleware, and traces.
- `@kairos/coding-agent`: coding-specific tools, prompts, task helpers, and workspace guardrails.
- `@kairos/tui`: generic terminal IO, event rendering, JSON event mapping, and formatting helpers.
- `@kairos/coding-tui`: terminal adapter and CLI for `@kairos/coding-agent`.
- `@kairos/web-ui`: framework-agnostic Web UI state and future reusable Web components.

See [Package Boundaries](docs/package-boundaries.md) for the intended dependency
direction and the current `@kairos/tui` transition plan.

## Apps

- `apps/docs-site`: VitePress tutorial site for the step-by-step Kairos implementation.

## Development

```bash
bun install
bun run typecheck
bun run test:agent
bun run test:coding-agent
bun run test:coding-tui
bun run test:tui
bun run test:web-ui
bun run test:deps
bun run docs:dev
```

Run the interactive coding CLI:

```bash
bun run kairos
```
