# 03. Agent Runtime

## 本步目标

在 `@kairos/agent` 里实现最小运行时：把用户消息发给模型，接收流式事件，必要时执行工具，再把工具结果放回消息列表。

## Runtime 要解决的问题

| 问题 | 设计 |
| --- | --- |
| 多轮消息怎么保存 | 使用 `messages` 状态 |
| 模型什么时候停止 | 看到最终文本且没有工具调用时停止 |
| 工具调用怎么执行 | 根据 tool name 找到本地工具 |
| 工具结果怎么返回模型 | 追加 tool result 消息 |
| 怎么防止无限循环 | 设置最大轮数 |

## 核心结构

```ts
type Agent = {
  run(input: string): Promise<AgentRunResult>;
  stream(input: string): AgentRun;
};
```

运行时不关心工具是不是读文件、写文件或跑命令。它只关心工具的名称、参数和结果。

## 学到什么

`@kairos/agent` 是通用层。只要工具协议稳定，它既可以驱动 coding agent，也可以驱动其他类型的 agent。
