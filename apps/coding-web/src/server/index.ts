import { DEFAULT_CODING_AGENT_MAX_TURNS } from "@kairos/coding-agent";
import { resolve } from "node:path";
import { env } from "node:process";
import {
  DEFAULT_HOST,
  DEFAULT_MODEL_ID,
  DEFAULT_PORT,
  DEFAULT_PROVIDER,
  DEFAULT_ROOT,
} from "./config.js";
import {
  parseApprovalDecisionRequest,
  parseRunRequest,
  parseSessionId,
  parseSessionPathId,
} from "./requests.js";
import { errorResponse, jsonResponse } from "./responses.js";
import { CodingWebRunService } from "./service.js";
import { serveClientFile } from "./static.js";
import type { CodingWebServerOptions } from "./types.js";

export { CodingWebApprovalBroker } from "./approvals.js";
export {
  parseApprovalDecisionRequest,
  parseRunRequest,
  parseSessionId,
  parseSessionPathId,
} from "./requests.js";
export {
  BadRequestError,
  errorResponse,
  formatError,
  formatSseEvent,
  jsonResponse,
} from "./responses.js";
export { CodingWebRunService } from "./service.js";
export { serveClientFile } from "./static.js";
export type {
  CodingWebApprovalDecisionRequest,
  CodingWebApprovalRequest,
  CodingWebRunRequest,
  CodingWebServerOptions,
  CodingWebSessionSummary,
} from "./types.js";

export function createCodingWebServer(
  options: CodingWebServerOptions = {},
): Bun.Server<unknown> {
  const host = options.host ?? env.KAIROS_CODING_WEB_HOST ?? DEFAULT_HOST;
  const port =
    options.port ??
    readPort(env.KAIROS_CODING_WEB_PORT ?? env.PORT) ??
    DEFAULT_PORT;
  const root = resolve(options.root ?? env.KAIROS_CODING_WEB_ROOT ?? DEFAULT_ROOT);
  const provider = options.provider ?? env.KAIROS_CODING_WEB_PROVIDER ?? DEFAULT_PROVIDER;
  const modelId = options.modelId ?? env.KAIROS_CODING_WEB_MODEL ?? DEFAULT_MODEL_ID;
  const maxTurns =
    options.maxTurns ??
    readPositiveInteger(env.KAIROS_CODING_WEB_MAX_TURNS) ??
    DEFAULT_CODING_AGENT_MAX_TURNS;
  const service = new CodingWebRunService(
    root,
    provider,
    modelId,
    maxTurns,
    options.sessionStoreDir,
  );

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
    if (request.method === "GET" && url.pathname === "/api/health") {
      return jsonResponse({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/api/sessions") {
      return jsonResponse({ sessions: await service.listSessions() });
    }
    if (request.method === "POST" && url.pathname === "/api/sessions") {
      return jsonResponse({ session: await service.createSession() });
    }
    if (
      request.method === "DELETE" &&
      url.pathname.startsWith("/api/sessions/")
    ) {
      const sessionId = parseSessionPathId(url.pathname);
      return jsonResponse({ deleted: await service.deleteSession(sessionId) });
    }
    if (request.method === "GET" && url.pathname === "/api/session") {
      const sessionId = parseSessionId(url.searchParams.get("sessionId") ?? "");
      return jsonResponse({ state: await service.getState(sessionId) });
    }
    if (request.method === "POST" && url.pathname === "/api/run") {
      const runRequest = await parseRunRequest(request);
      return new Response(await service.run(runRequest), {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
        },
      });
    }
    if (request.method === "POST" && url.pathname === "/api/approval") {
      const approvalRequest = await parseApprovalDecisionRequest(request);
      service.resolveApproval(approvalRequest);
      return jsonResponse({ ok: true });
    }
    if (request.method === "GET") {
      const staticResponse = await serveClientFile(url.pathname);
      if (staticResponse) {
        return staticResponse;
      }
    }
  } catch (error) {
    return errorResponse(error);
  }

  return new Response("Not found.", { status: 404 });
}

function readPort(value: string | undefined): number | undefined {
  return readPositiveInteger(value);
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}
