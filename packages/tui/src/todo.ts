export type TuiTodoStatus = "pending" | "in_progress" | "completed";

export interface TuiTodoItem {
  id: string;
  content: string;
  status: TuiTodoStatus;
}

export interface TuiTodoUpdate {
  todos: TuiTodoItem[];
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
}

const TODO_STATUSES = new Set<TuiTodoStatus>([
  "pending",
  "in_progress",
  "completed",
]);

const MAX_TODO_CONTENT_LENGTH = 160;

export function parseTodoWriteResult(content: string): TuiTodoUpdate | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  const raw = parsed as Record<string, unknown>;
  const todos = parseTodoList(raw.metadata) ?? parseTodoList(raw.newTodos);
  if (!todos) {
    return undefined;
  }

  return {
    todos,
    pendingCount: countTodos(todos, "pending"),
    inProgressCount: countTodos(todos, "in_progress"),
    completedCount: countTodos(todos, "completed"),
  };
}

export function formatTodoUpdate(update: TuiTodoUpdate): string {
  if (update.todos.length === 0) {
    return "todos: empty\n";
  }

  const total = update.todos.length;
  const lines = [`todos: ${update.completedCount}/${total} completed`];
  for (const todo of update.todos) {
    lines.push(`  ${formatTodoMarker(todo.status)} ${truncateTodo(todo.content)}`);
  }

  return `${lines.join("\n")}\n`;
}

function parseTodoList(value: unknown): TuiTodoItem[] | undefined {
  if (!Array.isArray(value)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    const raw = value as Record<string, unknown>;
    return parseTodoList(raw.todos);
  }

  const todos: TuiTodoItem[] = [];
  for (const item of value) {
    const todo = parseTodoItem(item);
    if (!todo) {
      return undefined;
    }
    todos.push(todo);
  }

  return todos;
}

function parseTodoItem(value: unknown): TuiTodoItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.content !== "string" ||
    typeof raw.status !== "string" ||
    !TODO_STATUSES.has(raw.status as TuiTodoStatus)
  ) {
    return undefined;
  }

  return {
    id: raw.id,
    content: raw.content,
    status: raw.status as TuiTodoStatus,
  };
}

function countTodos(todos: readonly TuiTodoItem[], status: TuiTodoStatus): number {
  return todos.filter((todo) => todo.status === status).length;
}

function formatTodoMarker(status: TuiTodoStatus): string {
  if (status === "completed") {
    return "[x]";
  }

  if (status === "in_progress") {
    return "[~]";
  }

  return "[ ]";
}

function truncateTodo(value: string): string {
  if (value.length <= MAX_TODO_CONTENT_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_TODO_CONTENT_LENGTH - 3)}...`;
}
