# 包与应用边界

## 当前结论

Kairos 采用 `packages/*` 和 `apps/*` 两层目录：

- `packages/*` 放可复用库。
- `apps/*` 放可运行应用和文档站点。

| 模块 | 类型 | 职责 |
| --- | --- | --- |
| `@kairos/ai` | package | 模型协议、provider 注册、传输实现 |
| `@kairos/agent` | package | 通用运行循环、消息、工具执行、middleware、trace |
| `@kairos/coding-agent` | package | 代码任务工具、默认 prompt、工具策略、工作区保护 |
| `@kairos/tui` | package | 通用终端输入输出、事件展示、JSONL 协议 |
| `@kairos/web-ui` | package | Web UI 状态和协议层，后续承载可复用组件 |
| `@kairos/coding-tui` | app | 本地终端应用，组合 coding-agent 和 tui |
| `@kairos/coding-web` | app | 本地浏览器应用，组合 coding-agent 和 web-ui |
| `@kairos/docs-site` | app | VitePress 教程和设计文档 |

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

箭头表示“左侧可以被右侧依赖”。通用层不能反向依赖产品层。

## 为什么这样分

| 决策 | 原因 |
| --- | --- |
| provider 放 `ai` | 模型细节不能进入 Agent 层 |
| tool loop 放 `agent` | 工具执行是通用能力 |
| coding tools 放 `coding-agent` | 工作区、文件和命令是代码任务语义 |
| 通用 TUI 不依赖 coding-agent | 避免 UI 辅助层反向依赖产品层 |
| coding CLI 放 `apps/coding-tui` | 终端界面是应用，不让 `tui` 反向依赖 coding-agent |
| coding Web 放 `apps/coding-web` | Web 界面是应用，不让 `web-ui` 反向依赖 coding-agent |
| docs 放 `apps/docs-site` | 文档是应用，不是可发布库 |

## 后续可能调整

| 区域 | 后续方向 | 当前不优先做 |
| --- | --- | --- |
| `@kairos/agent` | 稳定消息、工具、middleware、trace、停止条件。 | 代码任务策略或 UI 状态。 |
| `@kairos/coding-agent` | 加强工具策略、工作区安全、运行记录。 | 记忆、subagent、远程执行、插件系统。 |
| `@kairos/tui` | 改进通用终端组件和事件展示。 | 承担 coding-agent 产品入口。 |
| `@kairos/web-ui` | 保持状态和协议层轻量，后续再加可复用组件。 | 变成真正的网页应用。 |
| `apps/coding-tui` | 作为本地终端产品继续验证 coding-agent。 | 通用终端库。 |
| `apps/coding-web` | 作为本地浏览器产品验证同一套事件协议。 | 多用户平台或浏览器侧模型密钥。 |
