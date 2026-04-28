import type { AgentTool } from "@kairos/agent";
import type {
  TodoItem,
  TodoStatus,
  TodoWriteResult,
  TodoWriteToolArgs,
} from "../types.js";

const TODO_STATUSES = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed",
]);

export function createTodoWriteTool(): AgentTool<TodoWriteToolArgs> {
  let todos: TodoItem[] = [];

  return {
    name: "todo_write",
    risk: "read",
    description:
      "Create or update the full task plan for the current coding run. Use this for non-trivial multi-step tasks. Always send the complete current todo list, not a partial patch.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description:
            "Complete current task list. At most one item may be in_progress.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "Stable id for this todo item within the current run.",
              },
              content: {
                type: "string",
                description: "Brief task description.",
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
                description: "Current task status.",
              },
            },
            required: ["id", "content", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["todos"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const oldTodos = cloneTodos(todos);
      const newTodos = parseTodoWriteArgs(args);
      todos = cloneTodos(newTodos);

      const result: TodoWriteResult = {
        oldTodos,
        newTodos: cloneTodos(newTodos),
        pendingCount: countTodos(newTodos, "pending"),
        inProgressCount: countTodos(newTodos, "in_progress"),
        completedCount: countTodos(newTodos, "completed"),
        metadata: {
          todos: cloneTodos(newTodos),
        },
      };

      return JSON.stringify(result, null, 2);
    },
  };
}

function parseTodoWriteArgs(args: TodoWriteToolArgs): TodoItem[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("todo_write input must be an object.");
  }

  if (!Array.isArray(args.todos)) {
    throw new Error("todos must be an array.");
  }

  const todos = args.todos.map((item, index) => parseTodoItem(item, index));
  const inProgressCount = countTodos(todos, "in_progress");
  if (inProgressCount > 1) {
    throw new Error("todos must contain at most one in_progress item.");
  }

  return todos;
}

function parseTodoItem(item: unknown, index: number): TodoItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`todos[${index}] must be an object.`);
  }

  const raw = item as Record<string, unknown>;
  const id = parseNonEmptyString(raw.id, `todos[${index}].id`);
  const content = parseNonEmptyString(raw.content, `todos[${index}].content`);
  const status = parseTodoStatus(raw.status, index);

  return {
    id,
    content,
    status,
  };
}

function parseNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${path} must not be empty.`);
  }

  return trimmed;
}

function parseTodoStatus(value: unknown, index: number): TodoStatus {
  if (typeof value !== "string" || !TODO_STATUSES.has(value as TodoStatus)) {
    throw new Error(
      `todos[${index}].status must be one of pending, in_progress, completed.`,
    );
  }

  return value as TodoStatus;
}

function countTodos(todos: readonly TodoItem[], status: TodoStatus): number {
  return todos.filter((todo) => todo.status === status).length;
}

function cloneTodos(todos: readonly TodoItem[]): TodoItem[] {
  return todos.map((todo) => ({ ...todo }));
}
