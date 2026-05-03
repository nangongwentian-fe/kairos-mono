import type { CodingSessionOptions } from "@kairos/coding-agent";
import { randomUUID } from "node:crypto";
import {
  APPROVAL_TIMEOUT_MS,
  RESOLVED_APPROVAL_CACHE_MS,
} from "./config.js";
import type { CodingWebApprovalRequest } from "./types.js";

type CodingToolConfirmation = NonNullable<
  CodingSessionOptions["confirmToolCall"]
>;
type CodingToolConfirmationArgs = Parameters<CodingToolConfirmation>;

interface PendingApproval {
  sessionId: string;
  resolve: (allowed: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ResolvedApproval {
  sessionId: string;
  allowed: boolean;
  timeout: ReturnType<typeof setTimeout>;
}

export class CodingWebApprovalBroker {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly resolved = new Map<string, ResolvedApproval>();
  private emit?: (approval: CodingWebApprovalRequest) => void;

  setEmitter(
    emit: ((approval: CodingWebApprovalRequest) => void) | undefined,
  ): void {
    this.emit = emit;
  }

  request(
    sessionId: string,
    toolCall: CodingToolConfirmationArgs[0],
    tool: CodingToolConfirmationArgs[1],
    preview: CodingToolConfirmationArgs[2],
  ): Promise<boolean> {
    if (!this.emit) {
      return Promise.resolve(false);
    }

    const approval: CodingWebApprovalRequest = {
      id: randomUUID(),
      sessionId,
      toolCallId: toolCall.id,
      toolName: tool.name,
      risk: tool.risk ?? "read",
      arguments: toolCall.arguments,
      preview,
    };

    return new Promise<boolean>((resolveApproval) => {
      const timeout = setTimeout(() => {
        this.resolve(approval.sessionId, approval.id, false);
      }, APPROVAL_TIMEOUT_MS);

      this.pending.set(approval.id, {
        sessionId: approval.sessionId,
        resolve: resolveApproval,
        timeout,
      });

      try {
        this.emit?.(approval);
      } catch {
        this.resolve(approval.sessionId, approval.id, false);
      }
    });
  }

  resolve(sessionId: string, approvalId: string, allowed: boolean): boolean {
    const pending = this.pending.get(approvalId);
    if (!pending || pending.sessionId !== sessionId) {
      return this.isDuplicateResolution(sessionId, approvalId, allowed);
    }

    clearTimeout(pending.timeout);
    this.pending.delete(approvalId);
    this.rememberResolved(sessionId, approvalId, allowed);
    pending.resolve(allowed);
    return true;
  }

  cancelAll(): void {
    for (const [approvalId, pending] of this.pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(approvalId);
      this.rememberResolved(pending.sessionId, approvalId, false);
      pending.resolve(false);
    }
  }

  private isDuplicateResolution(
    sessionId: string,
    approvalId: string,
    allowed: boolean,
  ): boolean {
    const resolved = this.resolved.get(approvalId);
    return resolved?.sessionId === sessionId && resolved.allowed === allowed;
  }

  private rememberResolved(
    sessionId: string,
    approvalId: string,
    allowed: boolean,
  ): void {
    const previous = this.resolved.get(approvalId);
    if (previous) {
      clearTimeout(previous.timeout);
    }

    const timeout = setTimeout(() => {
      this.resolved.delete(approvalId);
    }, RESOLVED_APPROVAL_CACHE_MS);

    this.resolved.set(approvalId, {
      sessionId,
      allowed,
      timeout,
    });
  }
}
