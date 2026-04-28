# 10. Middleware

## 本步目标

给 `@kairos/agent` 加入 middleware，让工具调用前后可以插入通用逻辑。

## Middleware 能做什么

| 阶段 | 用途 |
| --- | --- |
| tool call 前 | 权限检查、参数记录、工作区检查 |
| tool call 后 | 记录结果、统计耗时、转换错误 |
| run 前后 | 记录任务、接入外部 UI |

## 为什么放在 agent 层

Middleware 是运行时机制，不是代码任务专用能力。它不应该知道 `read_file` 或 `edit_file` 的业务含义。

## 当前原则

| 原则 | 说明 |
| --- | --- |
| Runtime 提供机制 | `@kairos/agent` 管工具执行过程 |
| 具体策略外置 | coding-agent 决定哪些工具要限制 |
| 测试能替换 | 自定义工具和 middleware 都能在测试里打桩 |

## 学到什么

Middleware 是扩展点，不是业务规则本身。这样后续加日志、审批、审计时不用改 Runtime 主逻辑。
