# 项目记忆

## References 设计参考

- 以后设计或实现 `packages/*` 下任何 package 时，先参考 `/Users/zhengwenjie/Documents/People/references`。
- 默认原则是借鉴设计经验，不照搬复杂实现。
- 当前重点参考项目：`pi-mono`、`opencode`、`claude-code`、`codex`、`deerflow-harness`、`openai-agents-js`、`langgraphjs`、`deepagentsjs`、`mastra`、`voltagent`、`ai`、`typescript-sdk`。

## 分层参考重点

- `packages/ai` 优先参考 `pi-mono`、`ai`、`typescript-sdk`、`openai-agents-js` 的模型抽象、provider 接入、流式协议、工具调用事件映射。
- `packages/agent` 优先参考 `pi-mono`、`openai-agents-js`、`langgraphjs`、`deepagentsjs`、`opencode` 的 agent loop、消息状态、工具执行、工具结果回填、循环停止条件、循环保护。
- `packages/coding-agent` 优先参考 `pi-mono`、`opencode`、`deepagentsjs`、`voltagent`、`mastra` 的 coding 工具、工具组合、工作区边界、默认 prompt、agent 工厂设计。
- `packages/tui` 和 `packages/web-ui` 优先参考 `claude-code`、`codex`、`opencode`、`openai-agents-js`、`langgraphjs` 的消息呈现、流式更新、工具调用可视化、运行状态和错误呈现。

## 当前设计判断

- `createCodingAgent()` 保持为薄工厂：组合 `@kairos/agent`、默认 coding system prompt、内置工具和用户传入工具。
- 自定义工具同名时覆盖内置工具，方便测试打桩，也方便后续替换内置实现。
- 暂时不要把 memory、workflow、subagent、checkpoint、human interrupt、sandbox 全部放进 `createCodingAgent()`；这些等场景明确后单独加。
- 不要提前引入完整权限系统、持久化、上下文压缩、多 agent 编排、插件系统等重能力，除非当前任务明确需要。
