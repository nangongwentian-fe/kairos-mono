# Reference 项目怎么用

## 原则

参考项目用于理解成熟 Agent 的做法，不用于照搬实现。每次新增关键能力前，先看对应项目的入口、状态结构、工具执行、错误处理、测试和文档。

## 当前参考重点

| Kairos 层 | 优先参考 | 主要学习点 |
| --- | --- | --- |
| `@kairos/ai` | `pi-mono`、`ai`、`typescript-sdk`、`openai-agents-js` | provider 抽象、流式协议、工具调用事件 |
| `@kairos/agent` | `pi-mono`、`openai-agents-js`、`langgraphjs`、`deepagentsjs`、`opencode` | 运行循环、工具结果、停止条件 |
| `@kairos/coding-agent` | `pi-mono`、`opencode`、`deepagentsjs`、`voltagent`、`mastra` | 文件工具、工作区边界、默认 prompt、任务状态 |
| `@kairos/tui` | `claude-code`、`codex`、`opencode` | 流式展示、工具事件、错误呈现 |

## 取舍方式

| 做法 | Kairos 处理 |
| --- | --- |
| 成熟项目有完整插件系统 | 当前不做，只保留工具数组和 middleware |
| 成熟项目有复杂权限模型 | 当前先做 coding-agent 内的最小策略 |
| 成熟项目有任务状态提醒 | 当前纳入 Todo 提醒机制 |
| 成熟项目有 Web UI | 当前先用 TUI 验证 Runtime |

## 学到什么

看 reference 不能只看公开接口。真正有价值的部分通常藏在运行循环、状态更新和错误处理里。
