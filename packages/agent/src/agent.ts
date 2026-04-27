import { stream as streamModel, type Message, type Model } from "@kairos/ai";
import { runAgentLoop } from "./loop.js";
import type {
  AgentEvent,
  AgentEventListener,
  AgentOptions,
  AgentRunResult,
  AgentState,
  AgentStreamFunction,
  AgentTool,
  AgentToolConfirmation,
} from "./types.js";

export class Agent {
  private readonly model: Model;
  private readonly systemPrompt?: string;
  private readonly tools: readonly AgentTool<any>[];
  private readonly maxTurns: number;
  private readonly stream: AgentStreamFunction;
  private readonly confirmToolCall?: AgentToolConfirmation;
  private readonly listeners = new Set<AgentEventListener>();
  private messages: Message[];
  private running = false;

  constructor(options: AgentOptions) {
    if (options.maxTurns !== undefined && options.maxTurns < 1) {
      throw new Error("maxTurns must be at least 1.");
    }

    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools ?? [];
    this.maxTurns = options.maxTurns ?? 8;
    this.stream = options.stream ?? streamModel;
    this.confirmToolCall = options.confirmToolCall;
    this.messages = [...(options.messages ?? [])];
  }

  get state(): AgentState {
    return {
      messages: [...this.messages],
      isRunning: this.running,
    };
  }

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(messages: readonly Message[] = []): void {
    if (this.running) {
      throw new Error("Cannot reset while the agent is running.");
    }

    this.messages = [...messages];
  }

  async run(input: string): Promise<AgentRunResult> {
    if (this.running) {
      throw new Error("Agent is already running.");
    }

    this.running = true;
    try {
      return await runAgentLoop({
        input,
        model: this.model,
        systemPrompt: this.systemPrompt,
        tools: this.tools,
        maxTurns: this.maxTurns,
        messages: this.messages,
        stream: this.stream,
        confirmToolCall: this.confirmToolCall,
        emit: (event) => this.emit(event),
      });
    } finally {
      this.running = false;
    }
  }

  private async emit(event: AgentEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event);
    }
  }
}
