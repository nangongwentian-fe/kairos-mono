# 01. 总体架构

## 本步目标

先定清楚 package 和 app 的边界，避免后面把模型、运行时、代码工具和界面混在一起。

## 当前分层

```text
packages/ai
  模型定义、provider 查询、流式协议、OpenAI 兼容传输

packages/agent
  Agent Runtime、消息状态、工具调用、middleware

packages/coding-agent
  面向代码任务的默认 prompt、工具集合、工具策略、任务封装

packages/tui
  通用终端输入输出、Agent 事件展示、JSONL 事件协议

packages/web-ui
  Web UI 状态层和后续可复用组件

apps/coding-tui
  组合 coding-agent 和 tui，提供本地终端 Coding Agent

apps/coding-web
  组合 coding-agent 和 web-ui，提供本地浏览器 Coding Agent

apps/docs-site
  教程和设计文档
```

## 关系图

```text
@kairos/ai
  -> @kairos/agent
    -> @kairos/coding-agent
      -> @kairos/coding-tui
      -> @kairos/coding-web

@kairos/agent
  -> @kairos/tui
  -> @kairos/web-ui

@kairos/tui
  -> @kairos/coding-tui

@kairos/web-ui
  -> @kairos/coding-web
```

箭头表示“左侧可以被右侧依赖”。例如 `@kairos/coding-web` 可以依赖 `@kairos/web-ui`，但 `@kairos/web-ui` 不应该反向依赖 `@kairos/coding-web`。

## 依赖方向

| 模块 | 类型 | 可以依赖 | 不应该依赖 |
| --- | --- | --- | --- |
| `@kairos/ai` | package | 外部模型 SDK | `agent`、`coding-agent`、UI |
| `@kairos/agent` | package | `@kairos/ai` | `coding-agent`、UI |
| `@kairos/coding-agent` | package | `@kairos/agent`、`@kairos/ai` | `tui`、`web-ui`、apps |
| `@kairos/tui` | package | `@kairos/agent`、`@kairos/ai` | `coding-agent`、apps |
| `@kairos/web-ui` | package | `@kairos/agent`、`@kairos/ai` | `coding-agent`、apps |
| `@kairos/coding-tui` | app | `@kairos/coding-agent`、`@kairos/tui` | 文档站点 |
| `@kairos/coding-web` | app | `@kairos/coding-agent`、`@kairos/web-ui` | 浏览器侧模型密钥 |
| `@kairos/docs-site` | app | VitePress、文档内容 | 运行时代码 |

## 关键判断

`@kairos/ai` 只关心模型协议，不知道“写代码”这件事。`@kairos/agent` 只负责运行工具和维护消息。`@kairos/coding-agent` 才知道工作区、读文件、编辑文件、运行命令这些代码任务概念。

`@kairos/tui` 和 `@kairos/web-ui` 是通用 UI 辅助层，不是产品本身。真正可运行的产品在 `apps/coding-tui` 和 `apps/coding-web`。

## 后续方向

| 区域 | 下一步 |
| --- | --- |
| Agent 核心 | 继续稳定消息、工具、middleware、trace、停止条件。 |
| Coding Agent | 加强工具策略、工作区安全、运行记录。 |
| TUI / Web UI | 保持通用，只处理输入输出、状态和事件展示。 |
| 应用 | 继续作为真实运行入口，验证同一套 Agent 事件能被终端和浏览器消费。 |

## 学到什么

Agent 项目很容易变成一个大文件。先把依赖方向定下来，后面新增工具、界面和策略时就不容易放错位置。
