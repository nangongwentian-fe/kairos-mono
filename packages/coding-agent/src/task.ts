import { createCodingSession } from "./session.js";
import type { RunCodingTaskOptions, RunCodingTaskResult } from "./types.js";

export async function runCodingTask(
  options: RunCodingTaskOptions,
): Promise<RunCodingTaskResult> {
  const { input, onEvent, ...sessionOptions } = options;
  const session = createCodingSession(sessionOptions);
  return await session.run(input, { onEvent });
}
