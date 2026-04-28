# Package 边界

## 当前结论

Kairos 采用四层运行时代码，加一个教程站点。

| 层 | 职责 | 例子 |
| --- | --- | --- |
| `@kairos/ai` | 模型协议和 provider 接入 | OpenCode Go、流式事件 |
| `@kairos/agent` | 通用 Agent Runtime | 消息、工具执行、middleware |
| `@kairos/coding-agent` | 代码任务能力 | 读文件、编辑文件、运行命令、Todo |
| `@kairos/tui` | 命令行界面 | 展示文本、工具事件、错误 |
| `@kairos/docs-site` | 教程文档 | VitePress 站点 |

## 为什么这样分

| 决策 | 原因 |
| --- | --- |
| provider 放 `ai` | 模型细节不能进入 Agent 层 |
| tool loop 放 `agent` | 工具执行是通用能力 |
| coding tools 放 `coding-agent` | 工作区、文件和命令是代码任务语义 |
| TUI 依赖 coding-agent | 当前先做可运行演示 |
| docs 放 `apps/docs-site` | 文档是应用，不是可发布库 |

## 后续可能调整

当 TUI 组件变多，或者 Web UI 想复用展示逻辑时，可以拆出更通用的 TUI 组件包。当前阶段不提前拆。
