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
| 写文件和执行命令 | 默认拒绝，等后续浏览器审批 |

## 为什么先做本地 Web

`@kairos/coding-tui` 已经能跑交互式会话。下一步更有价值的是验证同一套 Agent 事件能不能被 Web 消费。

本阶段不做登录、部署、附件、模型选择和长期持久化。先把最小使用面跑通。

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
