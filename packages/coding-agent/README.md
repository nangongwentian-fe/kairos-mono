# @kairos/coding-agent

Coding-specific tools built on top of `@kairos/agent`.

## Tools

```ts
import { requireModel } from "@kairos/ai";
import { createCodingAgent } from "@kairos/coding-agent";

const model = requireModel("opencode-go", "kimi-k2.6");

const agent = createCodingAgent({
  root: process.cwd(),
  model,
});

const result = await agent.run("Read README.md and summarize it.");
console.log(result.messages);
```

Current behavior:

- `list_dir` lists directory entries as JSON with `name`, `path`, and `type`.
- `grep` searches file contents with ripgrep and returns JSON matches with `file`, `line`, `text`, and `isMatch`.
- `read_file` reads UTF-8 text files.
- Relative paths are resolved from the configured `root`.
- Absolute paths are allowed only when they stay inside `root`.
- Missing files, directories used as files, files used as directories, non-regular files, and path escapes are rejected.
- Symlink paths that point outside `root` are rejected.
- `grep` skips `.git`, `node_modules`, `dist`, `build`, and `coverage` by default, and caps result count and line length.
- Custom tools passed to `createCodingAgent()` are added to the agent; a custom tool with the same name replaces the built-in one.
