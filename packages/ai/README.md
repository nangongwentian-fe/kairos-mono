# @kairos/ai

`@kairos/ai` 是最底层的模型抽象。

当前这一步只做 4 件事：

- 定义消息类型
- 定义工具声明类型
- 定义模型流式输出接口
- 接入真实的 OpenCode Go `chat/completions`

## 现在的分层

`@kairos/ai` 现在分成 3 层：

- 协议层：`Message`、`ToolDefinition`、`ModelRequest`、`ModelResponse`
- 模型注册层：`createOpenAICompatibleModel()`、`getProviders()`、`getModels()`、`getModel()`、`requireModel()`
- 传输层：`stream()` 和 `streamOpenAICompletions()`

这样后面的 `@kairos/agent` 只依赖统一协议，不需要知道 OpenCode Go 的 HTTP 细节。

## 当前导出

- `Message`
- `ToolDefinition`
- `ModelRequest`
- `ModelResponse`
- `ModelStreamEvent`
- `Model`
- `createOpenAICompatibleModel`
- `getProviders`
- `getModels`
- `getModel`
- `requireModel`
- `stream(model, request)`

## OpenCode Go 预设

当前内置的 provider 是 `opencode-go`，默认：

- `baseUrl`: `https://opencode.ai/zen/go/v1`
- API key 环境变量：`OPENCODE_API_KEY`

静态内置模型只包含文档里明确走 `chat/completions` 的那批，不包含 `minimax-m2.5` 和 `minimax-m2.7`。

## 最小例子

```ts
import { requireModel, stream, type ModelRequest } from "@kairos/ai";

const model = requireModel("opencode-go", "kimi-k2.6");

const request: ModelRequest = {
  systemPrompt: "你是一个会调用工具的 assistant。",
  messages: [{ role: "user", content: "看看 README 里写了什么" }],
  tools: [
    {
      name: "read_file",
      description: "读取文件内容",
    },
  ],
};

const modelStream = stream(model, request);

for await (const event of modelStream) {
  console.log(event);
}

const response = await modelStream.result();
console.log(response);
```

运行前先设置：

```bash
export OPENCODE_API_KEY=your-key
```

## 你现在该关注什么

如果你是为了学 agent 设计，这一步最重要的不是 HTTP 细节，而是这两个边界：

- `Model` 只是“描述一个模型”，不负责自己发请求
- `stream(model, request)` 才是“按模型的 API 类型去执行”

这样到下一步做 `@kairos/agent` 时，agent 只需要拿一个 `model` 和一个 `request`，不用知道它背后是 OpenCode Go、OpenAI 还是别的兼容源。
