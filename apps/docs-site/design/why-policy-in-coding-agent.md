# 为什么策略放在 Coding Agent

## 结论

工具策略放在 `@kairos/coding-agent`，不是 `@kairos/agent`。

## 原因

| 层 | 是否适合放策略 | 原因 |
| --- | --- | --- |
| `@kairos/ai` | 不适合 | 只负责模型协议 |
| `@kairos/agent` | 不适合放具体规则 | 它不知道代码任务里的危险操作 |
| `@kairos/coding-agent` | 适合 | 它知道工作区、文件、命令和读写约束 |

## Runtime 和策略的关系

| 部分 | 负责什么 |
| --- | --- |
| `@kairos/agent` | 提供 middleware、执行工具、回填结果 |
| `@kairos/coding-agent` | 定义哪些工具能用、怎么检查、怎么拒绝 |

## 学到什么

通用层提供机制，业务层提供规则。这样以后做非 coding agent 时，不会被代码任务的策略污染。
