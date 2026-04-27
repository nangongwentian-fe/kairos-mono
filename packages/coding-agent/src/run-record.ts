import type { AgentRunResult, AgentTrace } from "@kairos/agent";
import type { Model } from "@kairos/ai";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const CODING_RUN_RECORD_VERSION = 1;

export interface CodingRunRecord {
  version: typeof CODING_RUN_RECORD_VERSION;
  id: string;
  createdAt: string;
  root: string;
  model: string;
  input: string;
  trace: AgentTrace;
  result: AgentRunResult;
}

export interface CreateCodingRunRecordOptions {
  id?: string;
  createdAt?: Date | string;
  root: string;
  model: Model | string;
  input: string;
  trace: AgentTrace;
  result: AgentRunResult;
}

export function createCodingRunRecord(
  options: CreateCodingRunRecordOptions,
): CodingRunRecord {
  return {
    version: CODING_RUN_RECORD_VERSION,
    id: options.id ?? randomUUID(),
    createdAt: formatCreatedAt(options.createdAt),
    root: options.root,
    model: formatCodingRunRecordModel(options.model),
    input: options.input,
    trace: options.trace,
    result: options.result,
  };
}

export async function writeCodingRunRecord(
  record: CodingRunRecord,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export function formatCodingRunRecordModel(model: Model | string): string {
  return typeof model === "string" ? model : `${model.provider}/${model.id}`;
}

function formatCreatedAt(createdAt: Date | string | undefined): string {
  if (createdAt instanceof Date) {
    return createdAt.toISOString();
  }

  return createdAt ?? new Date().toISOString();
}
