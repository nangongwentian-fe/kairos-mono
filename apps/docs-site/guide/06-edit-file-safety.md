# 06. 安全编辑文件

## 本步目标

加入 `edit_file`，但不允许模型随意改没读过的文件。

## 设计约束

| 约束 | 原因 |
| --- | --- |
| 只能改工作区内文件 | 防止越界写入 |
| 编辑前必须读过文件 | 防止模型在不了解上下文时覆盖内容 |
| 使用精确替换 | 降低误改范围 |
| 返回编辑结果 | 让模型知道改动是否成功 |

## 已读文件状态

`read_file` 成功后会记录文件路径。`edit_file` 执行前检查这个状态。

```text
read_file("src/a.ts")
  -> markRead("src/a.ts")

edit_file("src/a.ts")
  -> allowed

edit_file("src/b.ts")
  -> rejected
```

## 学到什么

真实 coding agent 的工具不能只追求“能改”。越早加入行为约束，越容易解释和测试。
