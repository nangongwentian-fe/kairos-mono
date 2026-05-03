# 实现时间线

## 从 0 到现在

1. 确认早期实现重心：先学习 Agent 设计，用小切片逐步推进完整产品框架。
2. 决定第一个 package 先做 `@kairos/ai`，因为模型协议是后续 Agent 的基础。
3. 原计划先做 `FakeModel`，后来改成真实接入 OpenCode Go。
4. 在 `@kairos/ai` 保留统一协议：`Message`、`ToolDefinition`、`ModelRequest`、`ModelResponse`、`ModelStreamEvent`。
5. 增加最小 `Model` 定义，包含 `id`、`name`、`provider`、`api`、`baseUrl`、`apiKeyEnv`、`supportsTools`。
6. 内置 `opencode-go` provider 和静态模型清单。
7. 新增 `getProviders()`、`getModels(provider)`、`getModel(provider, modelId)`。
8. 新增 `createOpenAICompatibleModel(config)`。
9. 实现 OpenAI Chat Completions 流式传输。
10. 把 `delta.content` 映射成 `text_delta`。
11. 把 `delta.tool_calls` 组装成 `tool_call`。
12. 汇总最终响应并产出 `response_end`。
13. 给 provider 查询、流式文本、工具调用、错误场景补测试。
14. 给真实 OpenCode Go 集成测试加环境变量开关。
15. 讨论 API key 安全：密钥只放 `.env.local`，不写进代码和文档。
16. 创建 `.env.example`，说明需要 `OPENCODE_API_KEY`。
17. 实现 `@kairos/agent` 最小运行时。
18. 支持用户消息、system prompt、模型调用和最终文本结果。
19. 支持工具定义注册。
20. 支持模型发起工具调用。
21. 支持工具结果回填到消息。
22. 加入最大轮数，避免工具循环失控。
23. 为 Agent Runtime 补单元测试和真实模型烟测。
24. 开始实现 `@kairos/coding-agent`。
25. 决定 `createCodingAgent()` 保持薄工厂，只组合 Runtime、默认 prompt 和工具。
26. 先加 `read_file`，并限制工作区。
27. 再加 `list_dir`，让 Agent 能查看目录。
28. 参考顶尖 Agent 项目后，决定搜索工具命名为 `grep`，不叫 `search_text`。
29. 实现 `grep`，支持文本或正则搜索。
30. 加入已读文件状态。
31. 实现 `edit_file`，要求编辑前必须读过目标文件。
32. 实现 `run_command`，支持运行测试和项目命令。
33. 增加输出截断、超时和错误返回。
34. 把工具文件从单一 `index.ts` 拆分到 `tools/`。
35. 实现最小命令行界面。
36. TUI 支持接收任务并展示流式文本。
37. TUI 支持展示工具调用和工具结果。
38. 用真实 OpenCode Go 模型跑 TUI 验证。
39. 处理 429 限流问题，改用更小任务做真实烟测。
40. 加入 run record，记录一次运行里的文本、工具和错误。
41. 实现 coding task 封装，让调用方更容易执行代码任务。
42. 实现 `todo_write` 工具。
43. 讨论 reference 项目里的 Todo 提醒机制。
44. 为 Todo 增加多轮未更新提醒。
45. 在 `@kairos/agent` 加 middleware 机制。
46. 用 middleware 支持工具执行前后扩展。
47. 参考 pi-mono 分层，把 coding CLI 从 `@kairos/tui` 拆到 `@kairos/coding-tui`。
47. 移除 `AgentTool<any>` 的粗糙类型，改成更明确的泛型。
48. 加入工具策略设计。
49. 把具体策略放在 `@kairos/coding-agent`。
50. 为 read、grep、edit、run command 等工具补策略测试。
51. 加入 workspace diff 能力。
52. 用 diff 帮助 Agent 和用户查看当前改动。
53. 梳理 `ai -> agent -> coding-agent -> tui` 的分层方向。
54. 记录 reference 项目应该作为每次设计前的输入。
55. 决定用 VitePress 写教程站点。
56. 决定文档应用放在 `apps/docs-site`。
57. 新增本教程站点，开始记录从 0 到现在的实现过程。
58. 新增 `apps/coding-web`，把 `@kairos/web-ui` 状态层接到真实 coding-agent 事件流。
59. 为 `apps/coding-web` 增加浏览器工具确认，让写文件和运行命令能在用户允许后继续执行。
