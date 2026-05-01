import { describe, expect, test } from "bun:test";

import {
  createTodoWriteTool,
  type TodoWriteResult,
} from "../src/index";

describe("@kairos/coding-agent todo_write tool", () => {
  test("updates the in-memory todo list with a complete list", async () => {
    const tool = createTodoWriteTool();

    const first = parseTodoWriteResult(
      await tool.execute({
        todos: [
          {
            id: "inspect",
            content: "Inspect existing tools",
            status: "completed",
          },
          {
            id: "implement",
            content: "Implement todo_write",
            status: "in_progress",
          },
          {
            id: "verify",
            content: "Run tests",
            status: "pending",
          },
        ],
      }),
    );

    expect(first).toEqual({
      oldTodos: [],
      newTodos: [
        {
          id: "inspect",
          content: "Inspect existing tools",
          status: "completed",
        },
        {
          id: "implement",
          content: "Implement todo_write",
          status: "in_progress",
        },
        {
          id: "verify",
          content: "Run tests",
          status: "pending",
        },
      ],
      pendingCount: 1,
      inProgressCount: 1,
      completedCount: 1,
      metadata: {
        todos: [
          {
            id: "inspect",
            content: "Inspect existing tools",
            status: "completed",
          },
          {
            id: "implement",
            content: "Implement todo_write",
            status: "in_progress",
          },
          {
            id: "verify",
            content: "Run tests",
            status: "pending",
          },
        ],
      },
    });

    const second = parseTodoWriteResult(
      await tool.execute({
        todos: [
          {
            id: "inspect",
            content: "Inspect existing tools",
            status: "completed",
          },
          {
            id: "implement",
            content: "Implement todo_write",
            status: "completed",
          },
          {
            id: "verify",
            content: "Run tests",
            status: "in_progress",
          },
        ],
      }),
    );

    expect(second.oldTodos).toEqual(first.newTodos);
    expect(second.pendingCount).toBe(0);
    expect(second.inProgressCount).toBe(1);
    expect(second.completedCount).toBe(2);
  });

  test("rejects invalid todo status", async () => {
    const tool = createTodoWriteTool();

    await expect(
      tool.execute({
        todos: [
            {
              id: "bad",
              content: "Bad status",
              status: "blocked" as never,
            },
        ],
      }),
    ).rejects.toThrow(
      "todos[0].status must be one of pending, in_progress, completed.",
    );
  });

  test("rejects multiple in_progress todos", async () => {
    const tool = createTodoWriteTool();

    await expect(
      tool.execute({
        todos: [
          {
            id: "one",
            content: "First task",
            status: "in_progress",
          },
          {
            id: "two",
            content: "Second task",
            status: "in_progress",
          },
        ],
      }),
    ).rejects.toThrow("todos must contain at most one in_progress item.");
  });

  test("rejects empty content", async () => {
    const tool = createTodoWriteTool();

    await expect(
      tool.execute({
        todos: [
          {
            id: "empty",
            content: " ",
            status: "pending",
          },
        ],
      }),
    ).rejects.toThrow("todos[0].content must not be empty.");
  });
});

function parseTodoWriteResult(value: string): TodoWriteResult {
  return JSON.parse(value) as TodoWriteResult;
}
