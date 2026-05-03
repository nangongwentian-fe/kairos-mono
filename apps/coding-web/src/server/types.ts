export interface CodingWebRunRequest {
  input: string;
  sessionId: string;
}

export interface CodingWebApprovalDecisionRequest {
  sessionId: string;
  approvalId: string;
  decision: "allow" | "deny";
}

export interface CodingWebApprovalRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  risk: string;
  arguments: unknown;
  preview?: string;
}

export interface CodingWebSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface CodingWebServerOptions {
  host?: string;
  port?: number;
  root?: string;
  provider?: string;
  modelId?: string;
  maxTurns?: number;
  sessionStoreDir?: string;
}
