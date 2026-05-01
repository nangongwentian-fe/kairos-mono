# 项目记忆

## References 设计参考

- 以后设计或实现 `packages/*` 下任何 package 时，先参考 `/Users/zhengwenjie/Documents/People/references`。
- 以后提出 `packages/*` 的下一步建议前，也要先做小范围 reference scan，再给建议和最小设计边界。
- 以后借鉴 references 时不能只看同名工具、公开接口和 prompt，要沿着完整实现路径查：入口、状态结构、运行循环、工具执行、提醒/约束、错误处理、测试和文档；给设计建议前要区分“已确认借鉴”“未找到对应机制”“暂不纳入当前阶段”。
- references 里如果存在多种实现方案，不要默认照搬其中一个；要比较它们的取舍，吸收各自优点，结合 Kairos 当前分层和阶段边界设计更合适的方案。
- 默认原则是借鉴设计经验，不照搬复杂实现。
- 当前重点参考项目：`pi-mono`、`opencode`、`claude-code`、`codex`、`hermes-agent`、`deerflow-harness`、`openai-agents-js`、`langgraphjs`、`deepagentsjs`、`mastra`、`voltagent`、`ai`、`typescript-sdk`。

## 分层参考重点

- `packages/ai` 优先参考 `pi-mono`、`ai`、`typescript-sdk`、`openai-agents-js` 的模型抽象、provider 接入、流式协议、工具调用事件映射。
- `packages/agent` 优先参考 `pi-mono`、`openai-agents-js`、`langgraphjs`、`deepagentsjs`、`opencode` 的 agent loop、消息状态、工具执行、工具结果回填、循环停止条件、循环保护。
- `packages/coding-agent` 优先参考 `pi-mono`、`opencode`、`hermes-agent`、`deepagentsjs`、`voltagent`、`mastra` 的 coding 工具、工具组合、工作区边界、默认 prompt、agent 工厂设计。
- `packages/tui`、`packages/coding-tui` 和 `packages/web-ui` 优先参考 `claude-code`、`codex`、`opencode`、`hermes-agent`、`openai-agents-js`、`langgraphjs` 的消息呈现、流式更新、工具调用可视化、运行状态和错误呈现。
- 如果后续设计技能、记忆、定时任务、跨平台消息入口、MCP 客户端/服务端或远程运行环境，优先参考 `hermes-agent` 的完整实现路径；当前阶段只借鉴边界和交互，不默认纳入重能力。

## 当前设计判断

- `createCodingAgent()` 保持为薄工厂：组合 `@kairos/agent`、默认 coding system prompt、内置工具和用户传入工具。
- 自定义工具同名时覆盖内置工具，方便测试打桩，也方便后续替换内置实现。
- `@kairos/tui` 是通用终端 UI/event helper；`@kairos/coding-tui` 组合 `@kairos/coding-agent` 和 `@kairos/tui` 提供 coding CLI，不要让 `@kairos/tui` 反向依赖 `@kairos/coding-agent`。
- 暂时不要把 memory、workflow、subagent、checkpoint、human interrupt、sandbox 全部放进 `createCodingAgent()`；这些等场景明确后单独加。
- 不要提前引入完整权限系统、持久化、上下文压缩、多 agent 编排、插件系统等重能力，除非当前任务明确需要。
- 新增或调整 `@kairos/*` package 依赖时，必须同步检查 `docs/package-boundaries.md` 和 `test/package-boundaries.test.ts`；依赖方向默认保持 `ai -> agent -> coding-agent`，通用 UI 层不要反向依赖产品层。
