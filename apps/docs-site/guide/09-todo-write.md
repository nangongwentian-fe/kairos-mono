# 09. Todo 工具

## 本步目标

加入 `todo_write`，让 Agent 在较复杂任务里显式维护待办状态。

## 为什么需要 Todo

| 场景 | 没有 Todo 的问题 |
| --- | --- |
| 多文件修改 | 容易忘记下一步 |
| 先读后改 | 不清楚当前做到哪一步 |
| 测试失败 | 缺少可见的修复计划 |
| 用户教学 | 用户看不到 Agent 的工作安排 |

## Todo 状态

每个待办项有三种状态：

| 状态 | 含义 |
| --- | --- |
| `pending` | 尚未开始 |
| `in_progress` | 正在处理 |
| `completed` | 已完成 |

## 提醒机制

如果 Agent 多轮没有更新 Todo，coding-agent 会提醒模型更新状态。这个设计来自对 reference 项目细节的补充观察：不少成熟 Agent 都会用系统提醒维持任务状态。

## 展示方式

TUI 会把 `todo_write` 的结果显示成任务列表：

```text
todos: 1/3 completed
  [x] Inspect README.md
  [~] Edit README.md
  [ ] Run tests
```

`--json` 会额外输出 `todo_update` 事件，方便后续 web-ui 或其他客户端复用。

## 学到什么

Todo 不只是展示用。它也能约束模型在长任务里持续说明当前步骤，减少遗忘。
