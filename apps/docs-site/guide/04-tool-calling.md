# 04. Tool Calling

## 本步目标

支持模型发起工具调用，并把工具结果返回模型。

## 工具由三部分组成

| 部分 | 作用 |
| --- | --- |
| `name` | 模型调用工具时使用的名称 |
| `description` | 告诉模型什么时候用这个工具 |
| `parameters` | JSON Schema，约束入参形状 |
| `execute` | 本地函数，真正执行工具 |

## 事件顺序

```text
response_start
text_delta?
tool_call?
response_end
tool_result
response_start
text_delta
response_end
```

模型可以先输出文本，也可以直接调用工具。Runtime 要能处理两种情况。

## 学到什么

工具调用不是“函数直接被模型执行”。模型只提出调用请求，真正执行的是本地 Runtime。这也是后面做权限、工作区边界和审计记录的基础。
