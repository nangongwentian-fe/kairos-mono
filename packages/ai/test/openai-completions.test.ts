import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  createOpenAICompatibleModel,
  getModel,
  stream,
  type Model,
  type ModelRequest,
  type ModelStreamEvent,
} from "../src/index";

const TEST_API_KEY_ENV = "TEST_OPENCODE_GO_API_KEY";

interface MockServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

type MockRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
) => void;

describe("@kairos/ai openai-completions transport", () => {
  let previousApiKey: string | undefined;

  beforeEach(() => {
    previousApiKey = process.env[TEST_API_KEY_ENV];
    process.env[TEST_API_KEY_ENV] = "test-key";
  });

  afterEach(() => {
    if (previousApiKey === undefined) {
      delete process.env[TEST_API_KEY_ENV];
      return;
    }

    process.env[TEST_API_KEY_ENV] = previousApiKey;
  });

  test("streams text deltas and produces the final response", async () => {
    const server = await createMockServer((req, res) => {
      expect(req.url).toBe("/v1/chat/completions");
      expect(req.headers.authorization).toBe("Bearer test-key");
      res.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
        "cache-control": "no-cache",
      });
      writeSse(res, [
        createChunk({
          model: "kimi-k2.6",
          delta: { role: "assistant", content: "你好" },
        }),
        createChunk({
          model: "kimi-k2.6",
          delta: { content: "，世界" },
        }),
        createChunk({
          model: "kimi-k2.6",
          delta: {},
          finishReason: "stop",
        }),
      ]);
    });

    try {
      const model = createTestModel(server.baseUrl);
      const request: ModelRequest = {
        messages: [{ role: "user", content: "打个招呼" }],
      };

      const modelStream = stream(model, request);
      const events = await collectEvents(modelStream);
      const response = await modelStream.result();

      expect(events.map((event) => event.type)).toEqual([
        "response_start",
        "text_delta",
        "text_delta",
        "response_end",
      ]);
      expect(response.stopReason).toBe("end_turn");
      expect(response.message.content).toEqual([
        {
          type: "text",
          text: "你好，世界",
        },
      ]);
    } finally {
      await server.close();
    }
  });

  test("assembles tool calls from streamed chunks", async () => {
    const server = await createMockServer((_, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
        "cache-control": "no-cache",
      });
      writeSse(res, [
        createChunk({
          model: "kimi-k2.6",
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: {
                  name: "read_file",
                  arguments: "{\"path\":\"READ",
                },
              },
            ],
          },
        }),
        createChunk({
          model: "kimi-k2.6",
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: "ME.md\"}",
                },
              },
            ],
          },
        }),
        createChunk({
          model: "kimi-k2.6",
          delta: {},
          finishReason: "tool_calls",
        }),
      ]);
    });

    try {
      const model = createTestModel(server.baseUrl);
      const request: ModelRequest = {
        messages: [{ role: "user", content: "读 README" }],
        tools: [
          {
            name: "read_file",
            description: "Read a file",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                },
              },
              required: ["path"],
            },
          },
        ],
      };

      const modelStream = stream(model, request);
      const events = await collectEvents(modelStream);
      const response = await modelStream.result();

      const toolEvent = events.find(
        (event): event is Extract<ModelStreamEvent, { type: "tool_call" }> =>
          event.type === "tool_call",
      );

      expect(toolEvent).toBeDefined();
      expect(toolEvent?.toolCall).toEqual({
        id: "call_1",
        name: "read_file",
        arguments: {
          path: "README.md",
        },
      });
      expect(response.stopReason).toBe("tool_calls");
    } finally {
      await server.close();
    }
  });

  test("maps the OpenAI length finish reason to max_tokens", async () => {
    const server = await createMockServer((_, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
        "cache-control": "no-cache",
      });
      writeSse(res, [
        createChunk({
          model: "kimi-k2.6",
          delta: { content: "partial" },
        }),
        createChunk({
          model: "kimi-k2.6",
          delta: {},
          finishReason: "length",
        }),
      ]);
    });

    try {
      const modelStream = stream(createTestModel(server.baseUrl), {
        messages: [{ role: "user", content: "继续" }],
      });
      const response = await modelStream.result();
      expect(response.stopReason).toBe("max_tokens");
    } finally {
      await server.close();
    }
  });

  test("rejects when the API key is missing", async () => {
    delete process.env[TEST_API_KEY_ENV];

    const modelStream = stream(createTestModel("http://127.0.0.1:1"), {
      messages: [{ role: "user", content: "hello" }],
    });

    await expect(modelStream.result()).rejects.toThrow(
      `Missing API key. Set ${TEST_API_KEY_ENV}.`,
    );
  });

  test.each([401, 403])(
    "rejects on HTTP %i responses",
    async (statusCode) => {
      const server = await createMockServer((_, res) => {
        res.writeHead(statusCode, {
          "content-type": "application/json",
        });
        res.end(JSON.stringify({ error: "forbidden" }));
      });

      try {
        const modelStream = stream(createTestModel(server.baseUrl), {
          messages: [{ role: "user", content: "hello" }],
        });

        await expect(modelStream.result()).rejects.toThrow();
      } finally {
        await server.close();
      }
    },
  );

  test("rejects when the server does not return SSE", async () => {
    const server = await createMockServer((_, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const modelStream = stream(createTestModel(server.baseUrl), {
        messages: [{ role: "user", content: "hello" }],
      });

      await expect(modelStream.result()).rejects.toThrow(
        "Expected text/event-stream response",
      );
    } finally {
      await server.close();
    }
  });

  test("rejects when a streamed tool call contains invalid JSON", async () => {
    const server = await createMockServer((_, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
        "cache-control": "no-cache",
      });
      writeSse(res, [
        createChunk({
          model: "kimi-k2.6",
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_bad",
                type: "function",
                function: {
                  name: "read_file",
                  arguments: "{\"path\":",
                },
              },
            ],
          },
        }),
        createChunk({
          model: "kimi-k2.6",
          delta: {},
          finishReason: "tool_calls",
        }),
      ]);
    });

    try {
      const modelStream = stream(createTestModel(server.baseUrl), {
        messages: [{ role: "user", content: "bad json" }],
        tools: [
          {
            name: "read_file",
            description: "Read a file",
          },
        ],
      });

      await expect(modelStream.result()).rejects.toThrow(
        "Invalid tool call arguments",
      );
    } finally {
      await server.close();
    }
  });
});

if (process.env.OPENCODE_API_KEY) {
  test(
    "can call the real opencode-go API when OPENCODE_API_KEY is set",
    async () => {
      const model = getModel("opencode-go", "qwen3.5-plus");
      expect(model).toBeDefined();

      const modelStream = stream(model!, {
        messages: [{ role: "user", content: "Reply with exactly: pong" }],
      });

      const response = await modelStream.result();
      const text = response.message.content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("");

      expect(text.length).toBeGreaterThan(0);
    },
    30_000,
  );
}

function createTestModel(baseUrl: string): Model {
  return createOpenAICompatibleModel({
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "test-provider",
    baseUrl,
    apiKeyEnv: TEST_API_KEY_ENV,
  });
}

async function createMockServer(
  handler: MockRequestHandler,
): Promise<MockServerHandle> {
  const server = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to get mock server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function collectEvents(streamResult: ReturnType<typeof stream>) {
  const events: ModelStreamEvent[] = [];

  for await (const event of streamResult) {
    events.push(event);
  }

  return events;
}

function writeSse(
  response: ServerResponse<IncomingMessage>,
  chunks: Array<Record<string, unknown>>,
): void {
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  response.write("data: [DONE]\n\n");
  response.end();
}

function createChunk({
  model,
  delta,
  finishReason = null,
}: {
  model: string;
  delta: Record<string, unknown>;
  finishReason?: string | null;
}): Record<string, unknown> {
  return {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 1,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
}
