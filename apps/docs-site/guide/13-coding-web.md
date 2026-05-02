# 13. Coding Web

## 本步目标

做一个本地浏览器界面，让 `@kairos/web-ui` 不再只停留在状态测试里，而是接入真实 `@kairos/coding-agent` 运行。

## 当前边界

| 能力 | 状态 |
| --- | --- |
| 浏览器输入任务 | 支持 |
| 真实模型调用 | 通过 Bun 服务端调用 |
| 事件流 | 用 Server-Sent Events 输出状态 |
| 消息展示 | 支持用户、助手、工具调用 |
| Todo 展示 | 支持 `todo_write` |
| 会话 | 内存单会话，按浏览器 session id 区分 |
| 写文件和执行命令 | 浏览器确认后执行 |
| 工具策略 | 保护路径和危险命令仍由服务端先拦截 |

## 为什么先做本地 Web

`@kairos/coding-tui` 已经能跑交互式会话。下一步更有价值的是验证同一套 Agent 事件能不能被 Web 消费。

本阶段不做登录、部署、附件、模型选择和长期持久化。先把最小使用面跑通。

## 工具确认

`edit_file` 和 `run_command` 这类工具会先暂停运行。服务端通过 Server-Sent Events 发出 `approval` 事件，浏览器展示工具名、参数、风险类型和 preview。用户选择允许一次或拒绝后，服务端继续当前 Agent 运行。

这个确认流程不是沙箱。它只让用户知道 Agent 准备做什么，并给用户一次明确的拦截机会。真正的保护仍然来自 coding-agent 的路径检查、命令限制和工具策略。

## 运行方式

```bash
bun run coding-web:dev
```

默认地址：

```text
http://127.0.0.1:4174
```

## 学到什么

`@kairos/web-ui` 应该保持通用状态层，不直接依赖 `@kairos/coding-agent`。真正组合两者的是 `apps/coding-web` 这种应用层。
