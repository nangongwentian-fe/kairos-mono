# 02. 接入 OpenCode Go

## 本步目标

第一步先接真实 provider：OpenCode Go 的 OpenAI Chat Completions 接口。

## 为什么不先做 FakeModel

FakeModel 适合写稳定测试，但不适合当学习主线。真实模型会立刻暴露这些问题：

| 真实问题 | 对设计的影响 |
| --- | --- |
| 流式文本分片 | 需要 `text_delta` 事件 |
| 工具调用分片 | 需要组装 `tool_call` |
| 鉴权失败 | 异步迭代和 `result()` 要能抛错 |
| provider 模型差异 | 模型定义不能泄漏到 Agent 层 |

## 最小模型定义

`@kairos/ai` 的模型描述只保留必要字段：

```ts
type Model = {
  id: string;
  name: string;
  provider: string;
  api: "openai-completions";
  baseUrl: string;
  apiKeyEnv: string;
  supportsTools: boolean;
};
```

## 默认 OpenCode Go 配置

| 字段 | 值 |
| --- | --- |
| provider | `opencode-go` |
| api | `openai-completions` |
| baseUrl | `https://opencode.ai/zen/go/v1` |
| apiKeyEnv | `OPENCODE_API_KEY` |

## 静态模型清单

当前只收官方走 `chat/completions` 的模型：

| 模型 |
| --- |
| `glm-5.1` |
| `glm-5` |
| `kimi-k2.5` |
| `kimi-k2.6` |
| `mimo-v2-pro` |
| `mimo-v2-omni` |
| `mimo-v2.5-pro` |
| `mimo-v2.5` |
| `qwen3.6-plus` |
| `qwen3.5-plus` |

`minimax-m2.5` 和 `minimax-m2.7` 暂不加入，因为官方文档把它们放在 `/messages`。

## 学到什么

模型层要把 provider 的细节收在内部。Agent 只看到统一的消息、工具定义和流式事件。
