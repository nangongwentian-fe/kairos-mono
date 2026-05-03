# Kairos Mono

Kairos 是一个 TypeScript monorepo，用来按分层方式实现可运行、可学习的 Coding Agent。

项目现在分成两类：

- `packages/*`：可复用库。只放模型、运行时、代码工具和通用 UI 辅助能力。
- `apps/*`：可运行应用。负责把库组合成终端、浏览器界面或文档站点。

## 项目架构

```text
packages/ai
  模型协议、provider 注册、OpenAI 兼容传输

packages/agent
  通用 Agent 运行循环、消息状态、工具调用、middleware、trace

packages/coding-agent
  面向代码任务的工具、默认 prompt、任务 helper、工作区保护

packages/tui
  通用终端输入输出、事件展示、JSONL 事件映射

packages/web-ui
  通用 Web UI 状态层，后续承载可复用 Web 组件

apps/coding-tui
  组合 coding-agent 和 tui，提供本地终端 Coding Agent

apps/coding-web
  组合 coding-agent 和 web-ui，提供 React/Vite 本地浏览器 Coding Agent

apps/docs-site
  VitePress 教程和设计文档
```

依赖方向保持从底层到产品层。箭头表示“左侧可以被右侧依赖”：

```text
ai -> agent -> coding-agent -> apps/coding-tui
                              -> apps/coding-web

agent -> tui
agent -> web-ui
```

`@kairos/tui` 和 `@kairos/web-ui` 不直接依赖 `@kairos/coding-agent`。真正的代码任务产品放在 `apps/coding-tui` 和 `apps/coding-web`。

## 包

- `@kairos/ai`: 模型协议、provider 注册、传输实现。
- `@kairos/agent`: 通用运行循环、事件协议、工具、middleware、trace。
- `@kairos/coding-agent`: 代码任务工具、默认 prompt、任务 helper、工作区保护。
- `@kairos/tui`: 通用终端输入输出、事件展示、JSONL 事件映射、格式化辅助能力。
- `@kairos/web-ui`: 不绑定框架的 Web UI 状态层，后续承载可复用 Web 组件。

更多边界、依赖方向和后续构建重点见 [包与应用边界](docs/package-boundaries.md)。

## 应用

- `apps/docs-site`: VitePress 教程站点，记录 Kairos 的实现过程和设计判断。
- `apps/coding-tui`: 本地终端界面，运行 `@kairos/coding-agent`。
- `apps/coding-web`: React/Vite 本地浏览器界面，运行 `@kairos/coding-agent`。

## 构建方向

| 区域 | 下一步方向 | 当前不优先做 |
| --- | --- | --- |
| `@kairos/ai` | 稳定模型协议，按真实运行需要增加 provider。 | provider 市场。 |
| `@kairos/agent` | 保持通用运行循环小而稳定：消息、工具、middleware、trace、停止条件。 | 代码任务策略或 UI 逻辑。 |
| `@kairos/coding-agent` | 强化代码工具、工作区安全、工具策略、运行记录。 | 记忆、subagent、远程执行、插件系统。 |
| `@kairos/tui` | 改进通用终端渲染和事件映射。 | 承担 coding-agent 产品行为。 |
| `@kairos/web-ui` | 保持不绑定框架的状态和协议层，后续再加可复用组件。 | 成为真正的 coding web app。 |
| `apps/coding-tui` | 作为本地终端产品运行 coding-agent。 | 通用终端 UI primitive。 |
| `apps/coding-web` | 作为本地浏览器产品运行 coding-agent。 | 浏览器侧模型密钥或后端平台能力。 |

## 开发

```bash
bun install
bun run typecheck
bun run test:agent
bun run test:coding-agent
bun run test:coding-tui
bun run test:coding-web
bun run test:tui
bun run test:web-ui
bun run test:deps
bun run docs:dev
```

运行本地终端 Coding Agent：

```bash
bun run kairos
bun run kairos --resume latest
```

运行本地浏览器 Coding Agent：

```bash
bun run coding-web:dev
```
