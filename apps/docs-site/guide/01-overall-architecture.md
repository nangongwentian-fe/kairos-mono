# 01. 总体架构

## 本步目标

先定清楚 package 边界，避免后面把 provider、Agent Runtime、代码工具和界面混在一起。

## 当前分层

```text
apps/docs-site
  教程文档

packages/ai
  模型定义、provider 查询、流式协议、OpenAI 兼容传输

packages/agent
  Agent Runtime、消息状态、工具调用、middleware

packages/coding-agent
  面向代码任务的默认 prompt、工具集合、工具策略、任务封装

packages/tui
  通用终端 IO、Agent 事件展示、JSONL 事件协议

packages/coding-tui
  组合 coding-agent 和 tui，提供 Kairos coding CLI

packages/web-ui
  Web UI 状态层和后续可复用组件
```

## 依赖方向

| Package | 可以依赖 | 不应该依赖 |
| --- | --- | --- |
| `@kairos/ai` | 外部模型 SDK | `agent`、`coding-agent`、`tui` |
| `@kairos/agent` | `@kairos/ai` | `coding-agent`、`tui` |
| `@kairos/coding-agent` | `@kairos/agent` | `tui` |
| `@kairos/tui` | `@kairos/agent`、`@kairos/ai` | `coding-agent` |
| `@kairos/coding-tui` | `@kairos/coding-agent`、`@kairos/tui` | 文档站点 |
| `@kairos/web-ui` | `@kairos/agent`、`@kairos/ai` | `coding-agent` |
| `@kairos/docs-site` | VitePress | 运行时代码 |

## 关键判断

`@kairos/ai` 只关心模型协议，不知道“写代码”这件事。`@kairos/agent` 只负责运行工具和维护消息。`@kairos/coding-agent` 才知道工作区、读文件、编辑文件、命令执行这些代码任务概念。

## 学到什么

Agent 项目很容易变成一个大文件。先把依赖方向定下来，后面新增工具、界面和策略时就不容易放错位置。
