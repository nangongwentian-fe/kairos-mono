import type { AgentMiddleware } from "@kairos/agent";
import type { AssistantMessage, Message, ModelRequest } from "@kairos/ai";
import type { TodoReminderOptions } from "./types.js";

export const DEFAULT_TODO_REMINDER_TURNS = 5;

const DEFAULT_TODO_REMINDER_MESSAGE =
  "System reminder: todo_write has not been used recently. If this is non-trivial multi-step work and the current todo list is still relevant, update it with todo_write before continuing. If the todo list is stale, clean it up. Do not mention this reminder to the user.";

interface NormalizedTodoReminderOptions {
  turnsSinceTodoWrite: number;
  turnsBetweenReminders: number;
}

interface TodoReminderStats {
  assistantTurns: number;
  turnsSinceLastTodoWrite: number;
}

export function createTodoReminderMiddleware(
  options: TodoReminderOptions = {},
): AgentMiddleware {
  const config = normalizeTodoReminderOptions(options);
  let lastReminderAssistantTurn: number | undefined;

  return {
    name: "todo_reminder",
    beforeModelRequest: (request) => {
      const stats = getTodoReminderStats(request.messages);
      if (
        lastReminderAssistantTurn !== undefined &&
        stats.assistantTurns < lastReminderAssistantTurn
      ) {
        lastReminderAssistantTurn = undefined;
      }

      if (shouldAddTodoReminder(stats, lastReminderAssistantTurn, config)) {
        lastReminderAssistantTurn = stats.assistantTurns;
        return addTodoReminder(request);
      }

      return undefined;
    },
  };
}

function normalizeTodoReminderOptions(
  options: TodoReminderOptions,
): NormalizedTodoReminderOptions {
  const turnsSinceTodoWrite =
    options.turnsSinceTodoWrite ?? DEFAULT_TODO_REMINDER_TURNS;
  const turnsBetweenReminders =
    options.turnsBetweenReminders ?? DEFAULT_TODO_REMINDER_TURNS;

  assertPositiveInteger(turnsSinceTodoWrite, "turnsSinceTodoWrite");
  assertPositiveInteger(turnsBetweenReminders, "turnsBetweenReminders");

  return {
    turnsSinceTodoWrite,
    turnsBetweenReminders,
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`todoReminder.${name} must be a positive integer.`);
  }
}

function getTodoReminderStats(messages: readonly Message[]): TodoReminderStats {
  const assistantMessages = messages.filter(
    (message): message is AssistantMessage => message.role === "assistant",
  );
  let turnsSinceLastTodoWrite = 0;

  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const message = assistantMessages[index];
    if (hasTodoWriteCall(message)) {
      return {
        assistantTurns: assistantMessages.length,
        turnsSinceLastTodoWrite,
      };
    }
    turnsSinceLastTodoWrite += 1;
  }

  return {
    assistantTurns: assistantMessages.length,
    turnsSinceLastTodoWrite: assistantMessages.length,
  };
}

function hasTodoWriteCall(message: AssistantMessage): boolean {
  return message.content.some(
    (block) => block.type === "tool-call" && block.call.name === "todo_write",
  );
}

function shouldAddTodoReminder(
  stats: TodoReminderStats,
  lastReminderAssistantTurn: number | undefined,
  config: NormalizedTodoReminderOptions,
): boolean {
  if (stats.turnsSinceLastTodoWrite < config.turnsSinceTodoWrite) {
    return false;
  }

  if (lastReminderAssistantTurn === undefined) {
    return true;
  }

  return (
    stats.assistantTurns - lastReminderAssistantTurn >=
    config.turnsBetweenReminders
  );
}

function addTodoReminder(request: ModelRequest): ModelRequest {
  return {
    ...request,
    systemPrompt: appendSystemReminder(request.systemPrompt),
  };
}

function appendSystemReminder(systemPrompt: string | undefined): string {
  if (!systemPrompt) {
    return DEFAULT_TODO_REMINDER_MESSAGE;
  }

  return `${systemPrompt}\n\n${DEFAULT_TODO_REMINDER_MESSAGE}`;
}
