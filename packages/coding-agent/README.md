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

Use a reusable session for interactive callers:

```ts
import { requireModel } from "@kairos/ai";
import {
  createCodingSession,
  createCodingSessionRecord,
  writeCodingSessionRecord,
} from "@kairos/coding-agent";

const model = requireModel("opencode-go", "kimi-k2.6");
const session = createCodingSession({
  root: process.cwd(),
  model,
});

await session.run("Read README.md.");
await session.run("Now summarize what you learned.");

const record = createCodingSessionRecord({
  root: process.cwd(),
  model,
  messages: session.state.messages,
});
await writeCodingSessionRecord(record);
```

Write an explicit run record:

```ts
import { requireModel } from "@kairos/ai";
import {
  createCodingRunRecord,
  runCodingTask,
  writeCodingRunRecord,
} from "@kairos/coding-agent";

const model = requireModel("opencode-go", "kimi-k2.6");
const input = "Read README.md and summarize it.";

const run = await runCodingTask({
  root: process.cwd(),
  model,
  input,
  recordWorkspaceDiff: true,
});

await writeCodingRunRecord(
  createCodingRunRecord({
    root: process.cwd(),
    model,
    input,
    trace: run.trace,
    workspaceDiff: run.workspaceDiff,
    workspaceDiffReport: run.workspaceDiffReport,
    result: run.result,
  }),
  ".kairos/runs/last.json",
);
```

Run records may include file contents, command output, and tool arguments. Use
explicit paths and avoid committing generated records.

Current behavior:

- `createCodingSession` creates one reusable coding agent for multi-turn callers such as interactive CLIs.
- `runCodingTask` is the one-shot helper built on top of `createCodingSession`.
- Each `CodingSession.run()` records an in-memory trace, optionally emits live events through `onEvent`, and returns `{ result, trace }`.
- `createCodingSessionRecord` and `writeCodingSessionRecord` persist local interactive session state when the caller asks for it.
- `runCodingTask` enables `workspaceGuard` by default. It checks for pre-existing git changes before the first model request and reminds the model not to overwrite or take credit for them. Disable it with `workspaceGuard: false`.
- `runCodingTask({ recordWorkspaceDiff: true })` also returns a git-backed workspace diff report with `before` and `after` snapshots. `workspaceDiff` is kept as a backward-compatible alias for the `after` snapshot. Non-git directories are reported as `status: "not_git_repository"` instead of throwing.
- `createCodingRunRecord` and `writeCodingRunRecord` persist one explicit JSON run record when the caller asks for it.
- `createCodingRunRecord` can include `workspaceDiff` and `workspaceDiffReport` so generated records show changed files, diff text, and whether the workspace already had changes before the task.
- `list_dir` lists directory entries as JSON with `name`, `path`, and `type`.
- `grep` searches file contents with ripgrep and returns JSON matches with `file`, `line`, `text`, and `isMatch`.
- `read_file` reads UTF-8 text files.
- `todo_write` stores the current run's structured task list in memory and returns old/new todos plus status counts.
- `createCodingAgent()` adds an internal middleware reminder to the next model turn when `todo_write` has not been used recently. The default threshold is 5 assistant turns and can be disabled with `todoReminder: false`.
- `createCodingAgent()` also adds a tool policy middleware by default. It blocks high-risk `run_command` inputs such as `rm -rf`, `sudo`, `chmod 777`, and `chown`, and blocks `edit_file` for protected paths such as `.env*`, `.git/**`, and `node_modules/**`.
- `edit_file` edits an existing UTF-8 text file by replacing exact text and returns a JSON summary with a diff.
- `run_command` runs a non-interactive command without a shell and returns JSON with exit code, stdout, stderr, timeout, and truncation metadata.
- Read-only built-in tools are marked as `risk: "read"` and run without confirmation.
- `todo_write` is run-local planning state, not long-term task persistence.
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
- Workspace diffs include staged, unstaged, and untracked files. They are review data only; Kairos does not automatically undo, commit, or reset files.
- The tool policy is a guardrail, not a sandbox. Disable it with `toolPolicy: false`, or pass `toolPolicy.protectedPaths` / `toolPolicy.additionalProtectedPaths` / `toolPolicy.additionalBlockedCommandPatterns` to tune the defaults.
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
├── run-record.ts   # explicit JSON run records
├── session.ts      # reusable multi-turn coding session
├── session-store.ts # local JSON session records
├── task.ts         # runCodingTask helper
├── tool-policy.ts  # edit_file and run_command guardrails
├── todo-reminder.ts # todo_write stale reminder policy
├── types.ts        # public coding-agent types
├── workspace-diff.ts # optional git workspace diff collection
└── tools
    ├── read-file.ts
    ├── list-dir.ts
    ├── grep.ts
    ├── todo-write.ts
    ├── edit-file.ts
    ├── run-command.ts
    ├── args.ts
    ├── diff.ts
    ├── file-state.ts
    └── path.ts
```
