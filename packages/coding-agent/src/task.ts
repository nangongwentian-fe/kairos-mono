import { createTraceRecorder } from "@kairos/agent";
import { createCodingAgent } from "./agent.js";
import type {
  RunCodingTaskOptions,
  RunCodingTaskResult,
} from "./types.js";

export async function runCodingTask(
  options: RunCodingTaskOptions,
): Promise<RunCodingTaskResult> {
  const { input, onEvent, ...agentOptions } = options;
  const recorder = createTraceRecorder();
  const agent = createCodingAgent(agentOptions);

  agent.subscribe(recorder.onEvent);
  if (onEvent) {
    agent.subscribe(onEvent);
  }

  const result = await agent.run(input);

  return {
    result,
    trace: recorder.trace,
  };
}
