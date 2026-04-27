# @kairos/coding-agent

Coding-specific tools built on top of `@kairos/agent`.

## Tools

```ts
import { requireModel } from "@kairos/ai";
import { runCodingTask } from "@kairos/coding-agent";

const model = requireModel("opencode-go", "kimi-k2.6");

const run = await runCodingTask({
  root: process.cwd(),
  model,
  input: "Read README.md and summarize it.",
  onEvent(event) {
    console.log(event.type);
  },
});

console.log(run.result.messages);
console.log(run.trace.items);
```

Current behavior:

- `runCodingTask` creates a coding agent, records an in-memory trace, runs one task, optionally emits live events through `onEvent`, and returns `{ result, trace }`.
- `list_dir` lists directory entries as JSON with `name`, `path`, and `type`.
- `grep` searches file contents with ripgrep and returns JSON matches with `file`, `line`, `text`, and `isMatch`.
- `read_file` reads UTF-8 text files.
- `edit_file` edits an existing UTF-8 text file by replacing exact text and returns a JSON summary with a diff.
- `run_command` runs a non-interactive command without a shell and returns JSON with exit code, stdout, stderr, timeout, and truncation metadata.
- Read-only built-in tools are marked as `risk: "read"` and run without confirmation.
- `edit_file` is marked as `risk: "write"` and passes a diff preview to `confirmToolCall` before writing.
- `run_command` is marked as `risk: "execute"` and passes a command preview to `confirmToolCall` before running.
- The default `edit_file` tool requires a successful `read_file` call for the same file first.
- If the file changes after `read_file`, `edit_file` rejects the write and asks the agent to read it again.
- Relative paths are resolved from the configured `root`.
- Absolute paths are allowed only when they stay inside `root`.
- Missing files, directories used as files, files used as directories, non-regular files, and path escapes are rejected.
- Symlink paths that point outside `root` are rejected.
- `grep` skips `.git`, `node_modules`, `dist`, `build`, and `coverage` by default, and caps result count and line length.
- `edit_file` rejects missing `oldText`, unchanged replacements, and multiple matches unless `replaceAll: true`.
- `run_command` requires `args` to be an array of strings, runs with `shell: false`, caps output, and has a bounded timeout.
- Custom tools passed to `createCodingAgent()` are added to the agent; a custom tool with the same name replaces the built-in one.

## Tests

```sh
bun run test:coding-agent
bun run test:coding-agent:workflow:integration
```

The workflow integration test uses `OPENCODE_API_KEY` from `.env.local` and asks OpenCode Go to read a file, edit it, and verify the change with `run_command`.

## Source Layout

```text
src
├── index.ts        # public exports
├── agent.ts        # createCodingAgent factory
├── task.ts         # runCodingTask helper
├── types.ts        # public coding-agent types
└── tools
    ├── read-file.ts
    ├── list-dir.ts
    ├── grep.ts
    ├── edit-file.ts
    ├── run-command.ts
    ├── args.ts
    ├── diff.ts
    ├── file-state.ts
    └── path.ts
```
