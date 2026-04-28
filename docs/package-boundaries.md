# Package Boundaries

Kairos keeps runtime, product, and UI packages layered so each package can evolve
without pulling higher-level assumptions into lower-level code.

## Current Layers

```text
@kairos/ai
  -> @kairos/agent
    -> @kairos/coding-agent

@kairos/web-ui -> @kairos/agent, @kairos/ai
@kairos/tui    -> @kairos/agent, @kairos/ai
@kairos/coding-tui -> @kairos/coding-agent, @kairos/tui, @kairos/agent, @kairos/ai
```

## Responsibilities

- `@kairos/ai`: model contracts, provider/model registry, provider transport implementations.
- `@kairos/agent`: generic agent loop, event protocol, tools, middleware, traces.
- `@kairos/coding-agent`: coding-specific tools, prompts, task helpers, workspace guardrails.
- `@kairos/web-ui`: framework-agnostic Web UI state and future reusable Web components.
- `@kairos/tui`: generic terminal IO, event rendering, JSON event mapping, and formatting helpers.
- `@kairos/coding-tui`: terminal adapter and CLI for `@kairos/coding-agent`.

## Reference-Informed Target

`pi-mono` keeps `pi-tui` as a generic terminal UI library, while the coding-agent
product composes it. Kairos should move in the same direction as the terminal UI
grows:

```text
@kairos/ai
  -> @kairos/agent
    -> @kairos/coding-agent

@kairos/tui        // generic terminal primitives and render helpers
@kairos/web-ui     // generic Web state/components
@kairos/coding-tui // composes coding-agent + tui
```

## Guardrail

Run the boundary check with:

```bash
bun run test:deps
```

The check enforces the allowed internal dependency graph for package manifests and
source imports. If we need a new edge, update this document and
`test/package-boundaries.test.ts` together so the design decision stays explicit.
