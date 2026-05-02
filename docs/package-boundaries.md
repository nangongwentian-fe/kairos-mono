# 包与应用边界

Kairos 的边界按两类目录划分：

- `packages/*`：可复用库。它们提供模型协议、Agent 运行时、代码任务能力和通用 UI 辅助能力。
- `apps/*`：可运行应用。它们把多个 package 组合成终端产品、浏览器产品或文档站点。

## 当前分层

```text
packages/ai
  模型协议、provider 注册、传输实现

packages/agent
  通用 Agent 运行循环、消息、工具、middleware、trace

packages/coding-agent
  代码任务工具、默认 prompt、任务 helper、工作区保护

packages/tui
  通用终端输入输出、事件展示、JSONL 事件映射

packages/web-ui
  不绑定框架的 Web UI 状态层，后续承载可复用 Web 组件

apps/coding-tui
  组合 coding-agent 和 tui，提供本地终端 Coding Agent

apps/coding-web
  组合 coding-agent 和 web-ui，提供本地浏览器 Coding Agent

apps/docs-site
  教程和设计文档站点
```

## 依赖关系

箭头表示“左侧可以被右侧依赖”：

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

也就是说，具体模块可以依赖更通用的模块，反过来不行。`@kairos/tui` 和 `@kairos/web-ui` 可以理解 Agent 事件，但不能理解 coding-agent 的产品语义。

## 职责表

| 模块 | 类型 | 职责 | 不负责 |
| --- | --- | --- | --- |
| `@kairos/ai` | package | 模型协议、provider 注册、OpenAI 兼容传输。 | Agent loop、工具执行、UI。 |
| `@kairos/agent` | package | 通用运行循环、消息状态、工具调用、middleware、trace、停止条件。 | 文件系统语义、命令策略、界面展示。 |
| `@kairos/coding-agent` | package | 代码任务工具、默认 prompt、任务 helper、工作区保护、工具策略。 | 终端界面、浏览器界面、文档站点。 |
| `@kairos/tui` | package | 通用终端输入输出、Agent 事件展示、JSONL 事件映射。 | coding-agent 产品入口。 |
| `@kairos/web-ui` | package | Web UI 状态和协议层，后续承载可复用 Web 组件。 | 真实网页应用、模型密钥、coding-agent 业务入口。 |
| `@kairos/coding-tui` | app | 本地终端 Coding Agent，组合 `coding-agent` 和 `tui`。 | 通用终端库。 |
| `@kairos/coding-web` | app | 本地浏览器 Coding Agent，组合 `coding-agent` 和 `web-ui`。 | 通用 Web 状态库、浏览器侧模型调用。 |
| `@kairos/docs-site` | app | 教程、设计记录、命令和时间线。 | 运行时代码。 |

## 设计判断

| 判断 | 原因 |
| --- | --- |
| `@kairos/ai` 不依赖 `@kairos/agent` | 模型传输应该能被其他运行时复用。 |
| `@kairos/agent` 不依赖 `@kairos/coding-agent` | 通用 Agent loop 不应该知道“写代码”这类产品语义。 |
| `@kairos/coding-agent` 不依赖 UI 包 | 代码任务能力应该能被终端、Web 或其他入口复用。 |
| `@kairos/tui` 不依赖 `@kairos/coding-agent` | 终端辅助层只处理输入输出和事件展示。 |
| `@kairos/web-ui` 不依赖 `@kairos/coding-agent` | Web UI 包只做状态和协议层，真正的网页产品放在 app。 |
| `apps/coding-tui` 和 `apps/coding-web` 放在 `apps` | 它们是可运行产品，不是底层库。 |

## 后续构建方向

| 区域 | 下一步方向 | 当前不优先做 |
| --- | --- | --- |
| `@kairos/ai` | 继续稳定 provider 协议，按真实运行需要增加 provider。 | provider 市场、模型管理后台。 |
| `@kairos/agent` | 保持运行循环小而稳定，补强 trace、middleware、错误处理和停止条件。 | 代码任务策略、UI 状态、持久化平台。 |
| `@kairos/coding-agent` | 加强工具策略、工作区安全、运行记录和可测试的代码任务能力。 | 记忆、subagent、远程沙箱、插件系统。 |
| `@kairos/tui` | 改进通用终端渲染、输入体验和事件映射。 | 直接承接 coding-agent 产品逻辑。 |
| `@kairos/web-ui` | 保持状态和协议层轻量，后续再增加可复用组件。 | 变成 `apps/coding-web` 的替代品。 |
| `apps/coding-tui` | 作为本地终端入口继续验证 coding-agent 能力。 | 通用终端组件库。 |
| `apps/coding-web` | 作为本地浏览器入口验证同一套 Agent 事件能被 Web 消费。 | 多用户平台、浏览器侧模型密钥。 |
| `apps/docs-site` | 保持教程、设计判断和命令同步。 | API 手册生成系统。 |

## 边界检查

运行：

```bash
bun run test:deps
```

这个检查会验证 package manifest 和源码 import 的内部依赖关系。如果需要新增依赖边，必须同时更新本文档和 `test/package-boundaries.test.ts`。
