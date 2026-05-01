import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Model } from "@kairos/ai";
import {
  assertSafeCodingSessionId,
  createCodingSessionRecord,
  getCodingSessionRecordPath,
  getDefaultCodingSessionStoreDir,
  listCodingSessionRecords,
  readCodingSessionRecord,
  resolveCodingSessionRecord,
  updateCodingSessionRecord,
  writeCodingSessionRecord,
} from "../src/index";

const TEST_MODEL: Model = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1",
  apiKeyEnv: "TEST_API_KEY",
  supportsTools: true,
};

describe("@kairos/coding-agent session store", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kairos-coding-session-store-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("writes and reads a session record", async () => {
    const record = createCodingSessionRecord({
      id: "session-1",
      root,
      model: TEST_MODEL,
      messages: [{ role: "user", content: "hello" }],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    await writeCodingSessionRecord(record);

    await expect(
      readCodingSessionRecord(getDefaultCodingSessionStoreDir(root), "session-1"),
    ).resolves.toEqual(record);
    expect(getCodingSessionRecordPath(getDefaultCodingSessionStoreDir(root), "session-1"))
      .toBe(join(root, ".kairos", "sessions", "session-1.json"));
  });

  test("lists summaries sorted by updated time and resolves latest", async () => {
    const older = createCodingSessionRecord({
      id: "older",
      root,
      model: TEST_MODEL,
      messages: [{ role: "user", content: "older question" }],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = createCodingSessionRecord({
      id: "newer",
      root,
      model: TEST_MODEL,
      messages: [{ role: "user", content: "newer question" }],
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    await writeCodingSessionRecord(older);
    await writeCodingSessionRecord(newer);

    const summaries = await listCodingSessionRecords(
      getDefaultCodingSessionStoreDir(root),
    );
    expect(summaries.map((summary) => summary.id)).toEqual(["newer", "older"]);
    expect(summaries[0]).toMatchObject({
      firstUserMessage: "newer question",
      messageCount: 1,
    });
    await expect(
      resolveCodingSessionRecord(getDefaultCodingSessionStoreDir(root), "latest"),
    ).resolves.toMatchObject({ id: "newer" });
  });

  test("updates messages without changing the session id", () => {
    const record = createCodingSessionRecord({
      id: "session-1",
      root,
      model: TEST_MODEL,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const updated = updateCodingSessionRecord(record, {
      messages: [{ role: "user", content: "next" }],
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(updated).toMatchObject({
      id: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      messages: [{ role: "user", content: "next" }],
    });
  });

  test("rejects unsafe session ids", () => {
    expect(() => assertSafeCodingSessionId("../bad")).toThrow(
      "Invalid coding session id",
    );
    expect(() =>
      createCodingSessionRecord({
        id: "bad/path",
        root,
        model: TEST_MODEL,
      }),
    ).toThrow("Invalid coding session id");
  });
});
