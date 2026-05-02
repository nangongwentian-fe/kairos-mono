#!/usr/bin/env bun
import { requireModel } from "@kairos/ai";
import {
  createCodingSession,
  type CodingSession,
} from "@kairos/coding-agent";
import {
  createWebUiEventStore,
  type WebUiEventStore,
  type WebUiState,
} from "@kairos/web-ui";
import { join, resolve } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;
const DEFAULT_PROVIDER = "opencode-go";
const DEFAULT_MODEL_ID = "kimi-k2.6";
const MAX_INPUT_LENGTH = 12000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(APP_DIR, "public");
const DEFAULT_ROOT = resolve(APP_DIR, "../..");

export interface CodingWebRunRequest {
  input: string;
  sessionId: string;
}

export interface CodingWebServerOptions {
  host?: string;
  port?: number;
  root?: string;
  provider?: string;
  modelId?: string;
}

interface CodingWebSessionRecord {
  session: CodingSession;
  store: WebUiEventStore;
}

export class BadRequestError extends Error {
  readonly status = 400;
}

export class CodingWebRunService {
  private readonly sessions = new Map<string, CodingWebSessionRecord>();

  constructor(
    private readonly root: string,
    private readonly provider: string,
    private readonly modelId: string,
  ) {}

  reset(sessionId: string): WebUiState {
    const record = this.getOrCreateSession(sessionId);
    record.session.reset();
    return record.store.reset();
  }

  run(request: CodingWebRunRequest): ReadableStream<Uint8Array> {
    const record = this.getOrCreateSession(request.sessionId);
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(formatSseEvent(event, data)));
        };
        const unsubscribe = record.session.subscribe((event) => {
          send("state", record.store.dispatch(event));
        });

        try {
          send("state", record.store.getState());
          await record.session.run(request.input, {
            recordWorkspaceDiff: { includeDiff: false },
          });
          send("done", { state: record.store.getState() });
        } catch (error) {
          const state = record.store.fail(error);
          send("error", {
            message: formatError(error),
            state,
          });
        } finally {
          unsubscribe();
          controller.close();
        }
      },
    });
  }

  private getOrCreateSession(sessionId: string): CodingWebSessionRecord {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const model = requireModel(this.provider, this.modelId);
    const record: CodingWebSessionRecord = {
      session: createCodingSession({
        root: this.root,
        model,
        recordWorkspaceDiff: { includeDiff: false },
        confirmToolCall: () => false,
      }),
      store: createWebUiEventStore(),
    };
    this.sessions.set(sessionId, record);
    return record;
  }
}

export async function parseRunRequest(request: Request): Promise<CodingWebRunRequest> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequestError("Request body must be JSON.");
  }

  if (!isRecord(body)) {
    throw new BadRequestError("Request body must be an object.");
  }

  const input = readString(body.input, "input").trim();
  const sessionId = readString(body.sessionId, "sessionId").trim();

  if (!input) {
    throw new BadRequestError("input must not be empty.");
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new BadRequestError(`input must be at most ${MAX_INPUT_LENGTH} characters.`);
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new BadRequestError("sessionId is invalid.");
  }

  return { input, sessionId };
}

export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createCodingWebServer(
  options: CodingWebServerOptions = {},
): Bun.Server<unknown> {
  const host = options.host ?? env.KAIROS_CODING_WEB_HOST ?? DEFAULT_HOST;
  const port = options.port ?? readPort(env.KAIROS_CODING_WEB_PORT ?? env.PORT) ?? DEFAULT_PORT;
  const root = resolve(options.root ?? env.KAIROS_CODING_WEB_ROOT ?? DEFAULT_ROOT);
  const provider = options.provider ?? env.KAIROS_CODING_WEB_PROVIDER ?? DEFAULT_PROVIDER;
  const modelId = options.modelId ?? env.KAIROS_CODING_WEB_MODEL ?? DEFAULT_MODEL_ID;
  const service = new CodingWebRunService(root, provider, modelId);

  return Bun.serve({
    hostname: host,
    port,
    fetch: (request) => handleRequest(request, service),
  });
}

async function handleRequest(
  request: Request,
  service: CodingWebRunService,
): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/") {
      return servePublicFile("index.html", "text/html; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/app.js") {
      return servePublicFile("app.js", "text/javascript; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/styles.css") {
      return servePublicFile("styles.css", "text/css; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return jsonResponse({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/api/reset") {
      const { sessionId } = await parseSessionRequest(request);
      return jsonResponse({ state: service.reset(sessionId) });
    }
    if (request.method === "POST" && url.pathname === "/api/run") {
      const runRequest = await parseRunRequest(request);
      return new Response(service.run(runRequest), {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
        },
      });
    }
  } catch (error) {
    return errorResponse(error);
  }

  return new Response("Not found.", { status: 404 });
}

async function parseSessionRequest(
  request: Request,
): Promise<{ sessionId: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequestError("Request body must be JSON.");
  }
  if (!isRecord(body)) {
    throw new BadRequestError("Request body must be an object.");
  }

  const sessionId = readString(body.sessionId, "sessionId").trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new BadRequestError("sessionId is invalid.");
  }

  return { sessionId };
}

function servePublicFile(filename: string, contentType: string): Response {
  return new Response(Bun.file(join(PUBLIC_DIR, filename)), {
    headers: {
      "Content-Type": contentType,
    },
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorResponse(error: unknown): Response {
  const status = error instanceof BadRequestError ? error.status : 500;
  return jsonResponse(
    {
      error: formatError(error),
    },
    status,
  );
}

function readPort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}

function readString(value: unknown, key: string): string {
  if (typeof value !== "string") {
    throw new BadRequestError(`${key} must be a string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const server = createCodingWebServer();
  console.log(`Kairos coding web listening on http://${server.hostname}:${server.port}`);
}
