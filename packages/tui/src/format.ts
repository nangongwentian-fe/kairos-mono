import type { JsonValue, ToolCall } from "@kairos/ai";

const MAX_INLINE_ARGUMENT_LENGTH = 160;
const MAX_RESULT_PREVIEW_LENGTH = 500;

export function formatToolCallSummary(toolCall: ToolCall): string {
  const path = getStringArg(toolCall.arguments, "path");
  if (path) {
    return `${toolCall.name} ${path}`;
  }

  const pattern = getStringArg(toolCall.arguments, "pattern");
  if (pattern) {
    return `${toolCall.name} "${pattern}"`;
  }

  const command = getStringArg(toolCall.arguments, "command");
  if (command) {
    const args = getStringArrayArg(toolCall.arguments, "args");
    return `${toolCall.name} ${[command, ...args].join(" ")}`;
  }

  return toolCall.name;
}

export function formatToolArguments(args: JsonValue): string {
  return truncate(JSON.stringify(args, null, 2) ?? "null", MAX_RESULT_PREVIEW_LENGTH);
}

export function formatToolResult(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  return truncate(trimmed, MAX_RESULT_PREVIEW_LENGTH);
}

export function formatInlineArguments(args: JsonValue): string {
  const json = JSON.stringify(args);
  if (!json) {
    return "";
  }

  return truncate(json, MAX_INLINE_ARGUMENT_LENGTH);
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getStringArg(args: JsonValue, key: string): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return undefined;
  }

  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getStringArrayArg(args: JsonValue, key: string): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return [];
  }

  const value = args[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
