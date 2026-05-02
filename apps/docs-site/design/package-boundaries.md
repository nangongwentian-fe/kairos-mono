# Package 边界

## 当前结论

Kairos 采用核心运行时、产品适配层和 UI helper 分层，加一个教程站点。

| 层 | 职责 | 例子 |
| --- | --- | --- |
| `@kairos/ai` | 模型协议和 provider 接入 | OpenCode Go、流式事件 |
| `@kairos/agent` | 通用 Agent Runtime | 消息、工具执行、middleware |
| `@kairos/coding-agent` | 代码任务能力 | 读文件、编辑文件、运行命令、Todo |
| `@kairos/tui` | 通用终端 UI helper | IO、事件展示、JSONL 协议 |
| `@kairos/web-ui` | Web UI 状态和组件 | 事件状态层、后续页面组件 |
| `@kairos/docs-site` | 教程文档 | VitePress 站点 |
| `@kairos/coding-tui` | 本地终端应用 | 组合 coding-agent 和 tui |
| `@kairos/coding-web` | 本地 Web 应用 | 组合 coding-agent 和 web-ui |

## 为什么这样分

| 决策 | 原因 |
| --- | --- |
| provider 放 `ai` | 模型细节不能进入 Agent 层 |
| tool loop 放 `agent` | 工具执行是通用能力 |
| coding tools 放 `coding-agent` | 工作区、文件和命令是代码任务语义 |
| 通用 TUI 不依赖 coding-agent | 避免 UI helper 反向依赖产品层 |
| coding CLI 放 `apps/coding-tui` | 终端界面是应用，不让 `tui` 反向依赖 coding-agent |
| coding Web 放 `apps/coding-web` | Web 界面是应用，不让 `web-ui` 反向依赖 coding-agent |
| docs 放 `apps/docs-site` | 文档是应用，不是可发布库 |

## 后续可能调整

当 TUI 组件变多时，继续把通用终端组件留在 `@kairos/tui`，把代码任务特有入口留在 `apps/coding-tui`。
