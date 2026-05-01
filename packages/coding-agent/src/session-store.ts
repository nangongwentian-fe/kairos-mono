import type { Message, Model } from "@kairos/ai";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CodingSessionRecord, CodingSessionSummary } from "./types.js";

export const CODING_SESSION_RECORD_VERSION = 1;

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export interface CreateCodingSessionRecordOptions {
  id?: string;
  root: string;
  model: Model;
  messages?: readonly Message[];
  now?: Date;
}

export interface UpdateCodingSessionRecordOptions {
  messages: readonly Message[];
  now?: Date;
}

export function getDefaultCodingSessionStoreDir(root: string): string {
  return join(root, ".kairos", "sessions");
}

export function createCodingSessionRecord(
  options: CreateCodingSessionRecordOptions,
): CodingSessionRecord {
  const id = options.id ?? randomUUID();
  assertSafeCodingSessionId(id);
  const now = (options.now ?? new Date()).toISOString();

  return {
    version: CODING_SESSION_RECORD_VERSION,
    id,
    createdAt: now,
    updatedAt: now,
    root: options.root,
    model: {
      provider: options.model.provider,
      id: options.model.id,
      name: options.model.name,
    },
    messages: [...(options.messages ?? [])],
  };
}

export function updateCodingSessionRecord(
  record: CodingSessionRecord,
  options: UpdateCodingSessionRecordOptions,
): CodingSessionRecord {
  return {
    ...record,
    updatedAt: (options.now ?? new Date()).toISOString(),
    messages: [...options.messages],
  };
}

export async function writeCodingSessionRecord(
  record: CodingSessionRecord,
  directory = getDefaultCodingSessionStoreDir(record.root),
): Promise<void> {
  assertSafeCodingSessionId(record.id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    getCodingSessionRecordPath(directory, record.id),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

export async function readCodingSessionRecord(
  directory: string,
  id: string,
): Promise<CodingSessionRecord | undefined> {
  assertSafeCodingSessionId(id);

  try {
    const text = await readFile(getCodingSessionRecordPath(directory, id), "utf8");
    return parseCodingSessionRecord(text);
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function resolveCodingSessionRecord(
  directory: string,
  idOrAlias: string,
): Promise<CodingSessionRecord | undefined> {
  if (idOrAlias === "latest" || idOrAlias === "last") {
    const [latest] = await listCodingSessionRecords(directory);
    return latest ? readCodingSessionRecord(directory, latest.id) : undefined;
  }

  return readCodingSessionRecord(directory, idOrAlias);
}

export async function listCodingSessionRecords(
  directory: string,
): Promise<CodingSessionSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }

  const summaries = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        try {
          const text = await readFile(join(directory, entry), "utf8");
          return createCodingSessionSummary(
            parseCodingSessionRecord(text),
            join(directory, entry),
          );
        } catch {
          return undefined;
        }
      }),
  );

  return summaries
    .filter((summary): summary is CodingSessionSummary => Boolean(summary))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getCodingSessionRecordPath(
  directory: string,
  id: string,
): string {
  assertSafeCodingSessionId(id);
  return join(directory, `${id}.json`);
}

export function assertSafeCodingSessionId(id: string): void {
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new Error(`Invalid coding session id: ${id}`);
  }
}

function parseCodingSessionRecord(text: string): CodingSessionRecord {
  const value = JSON.parse(text) as Partial<CodingSessionRecord>;

  if (value.version !== CODING_SESSION_RECORD_VERSION) {
    throw new Error("Unsupported coding session record version.");
  }
  if (typeof value.id !== "string") {
    throw new Error("Invalid coding session record id.");
  }
  assertSafeCodingSessionId(value.id);
  if (typeof value.root !== "string") {
    throw new Error("Invalid coding session record root.");
  }
  if (!value.model || typeof value.model.id !== "string") {
    throw new Error("Invalid coding session record model.");
  }
  if (!Array.isArray(value.messages)) {
    throw new Error("Invalid coding session record messages.");
  }

  return {
    version: CODING_SESSION_RECORD_VERSION,
    id: value.id,
    createdAt: requireString(value.createdAt, "createdAt"),
    updatedAt: requireString(value.updatedAt, "updatedAt"),
    root: value.root,
    model: {
      provider: requireString(value.model.provider, "model.provider"),
      id: value.model.id,
      name: requireString(value.model.name, "model.name"),
    },
    messages: value.messages,
  };
}

function createCodingSessionSummary(
  record: CodingSessionRecord,
  path: string,
): CodingSessionSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    root: record.root,
    model: record.model,
    messageCount: record.messages.length,
    firstUserMessage: getFirstUserMessage(record.messages),
    path,
  };
}

function getFirstUserMessage(messages: readonly Message[]): string | undefined {
  const message = messages.find((item) => item.role === "user");
  if (!message || message.role !== "user") {
    return undefined;
  }

  return message.content.slice(0, 80);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid coding session record ${field}.`);
  }

  return value;
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
