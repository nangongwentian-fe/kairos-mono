import {
  APPROVAL_ID_PATTERN,
  MAX_INPUT_LENGTH,
  SESSION_ID_PATTERN,
} from "./config.js";
import { BadRequestError } from "./responses.js";
import type {
  CodingWebApprovalDecisionRequest,
  CodingWebRunRequest,
} from "./types.js";

export async function parseRunRequest(
  request: Request,
): Promise<CodingWebRunRequest> {
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
    throw new BadRequestError(
      `input must be at most ${MAX_INPUT_LENGTH} characters.`,
    );
  }
  return { input, sessionId: parseSessionId(sessionId) };
}

export async function parseApprovalDecisionRequest(
  request: Request,
): Promise<CodingWebApprovalDecisionRequest> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequestError("Request body must be JSON.");
  }

  if (!isRecord(body)) {
    throw new BadRequestError("Request body must be an object.");
  }

  const sessionId = parseSessionId(readString(body.sessionId, "sessionId"));
  const approvalId = readString(body.approvalId, "approvalId").trim();
  const decision = readString(body.decision, "decision").trim();

  if (!APPROVAL_ID_PATTERN.test(approvalId)) {
    throw new BadRequestError("approvalId is invalid.");
  }
  if (decision !== "allow" && decision !== "deny") {
    throw new BadRequestError("decision must be allow or deny.");
  }

  return { sessionId, approvalId, decision };
}

export function parseSessionId(value: string): string {
  const sessionId = value.trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new BadRequestError("sessionId is invalid.");
  }
  return sessionId;
}

export function parseSessionPathId(pathname: string): string {
  const rawSessionId = pathname.slice("/api/sessions/".length);
  try {
    return parseSessionId(decodeURIComponent(rawSessionId));
  } catch {
    throw new BadRequestError("sessionId is invalid.");
  }
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
