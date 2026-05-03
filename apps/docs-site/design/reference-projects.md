# Reference 项目怎么用

## 原则

参考项目用于理解成熟 Agent 的做法，不用于照搬实现。每次新增关键能力前，先看对应项目的入口、状态结构、工具执行、错误处理、测试和文档。

## 当前参考重点

| Kairos 层 | 优先参考 | 主要学习点 |
| --- | --- | --- |
| `@kairos/ai` | `pi-mono`、`ai`、`typescript-sdk`、`openai-agents-js` | provider 抽象、流式协议、工具调用事件 |
| `@kairos/agent` | `pi-mono`、`openai-agents-js`、`langgraphjs`、`deepagentsjs`、`opencode` | 运行循环、工具结果、停止条件 |
| `@kairos/coding-agent` | `pi-mono`、`opencode`、`hermes-agent`、`deepagentsjs`、`voltagent`、`mastra` | 文件工具、工作区边界、默认提示词、任务状态、技能和记忆边界 |
| `@kairos/tui`、`@kairos/coding-tui` | `claude-code`、`codex`、`opencode`、`hermes-agent`、`pi-mono` | 流式展示、工具事件、错误呈现、UI/产品分层、网关式 TUI |
| 后续扩展能力 | `hermes-agent`、`mastra`、`voltagent`、`langgraphjs` | 技能、记忆、定时任务、跨平台消息入口、MCP、远程运行环境 |

## 取舍方式

| 做法 | Kairos 处理 |
| --- | --- |
| 成熟项目有完整插件系统 | 作为长期产品边界参考；当前先保留工具数组和 middleware 这类轻量扩展点 |
| 成熟项目有复杂权限模型 | 作为长期能力参考；当前先做 coding-agent 内的可测试策略 |
| 成熟项目有任务状态提醒 | 当前纳入 Todo 提醒机制 |
| 成熟项目有 Web UI | 当前已有 coding-web，用同一套 Agent 事件验证浏览器入口 |
| Hermes 有技能、记忆、定时任务和跨平台消息入口 | 作为长期产品边界参考；按独立切片逐步加入 |

## 学到什么

看 reference 不能只看公开接口。真正有价值的部分通常藏在运行循环、状态更新和错误处理里。
