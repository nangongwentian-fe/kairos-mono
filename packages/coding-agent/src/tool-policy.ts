import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  AgentMiddleware,
  AgentToolCallDecision,
} from "@kairos/agent";
import type { JsonValue } from "@kairos/ai";
import type {
  CodingPermissionMiddlewareOptions,
  CodingToolPolicyOptions,
} from "./types.js";

const DEFAULT_PROTECTED_PATHS = [
  ".env*",
  ".git",
  ".git/**",
  "node_modules",
  "node_modules/**",
];

const SHELL_COMMANDS = new Set(["bash", "dash", "fish", "sh", "zsh"]);

const DANGEROUS_SHELL_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /(?:^|[;&|]\s*)(?:\S*\/)?sudo(?:\s|$)/,
    reason: "sudo is not allowed",
  },
  {
    pattern: /(?:^|[;&|]\s*)(?:\S*\/)?rm\s+-(?=\S*[rR])(?=\S*f)\S*(?:\s|$)/,
    reason: "rm -rf is not allowed",
  },
  {
    pattern:
      /(?:^|[;&|]\s*)(?:\S*\/)?rm\s+(?=.*(?:\s|^)(?:-[rR]|--recursive)(?:\s|$))(?=.*(?:\s|^)(?:-f|--force)(?:\s|$))/,
    reason: "rm -rf is not allowed",
  },
  {
    pattern: /(?:^|[;&|]\s*)(?:\S*\/)?chmod\s+(?:-\S+\s+)*0?777(?:\s|$)/,
    reason: "chmod 777 is not allowed",
  },
  {
    pattern: /(?:^|[;&|]\s*)(?:\S*\/)?chown(?:\s|$)/,
    reason: "chown is not allowed",
  },
];

export function createCodingPermissionMiddleware(
  options: CodingPermissionMiddlewareOptions,
): AgentMiddleware {
  const protectedPaths = [
    ...(options.protectedPaths ?? DEFAULT_PROTECTED_PATHS),
    ...(options.additionalProtectedPaths ?? []),
  ];
  const additionalBlockedCommandPatterns =
    options.additionalBlockedCommandPatterns ?? [];

  return {
    name: "coding_tool_policy",
    beforeToolCall: async (toolCall) => {
      if (toolCall.name === "edit_file" || toolCall.name === "write_file") {
        return blockProtectedFileWritePath(
          toolCall.name,
          options.root,
          protectedPaths,
          toolCall.arguments,
        );
      }

      if (toolCall.name === "run_command") {
        return blockDangerousRunCommand(
          additionalBlockedCommandPatterns,
          toolCall.arguments,
        );
      }

      return undefined;
    },
  };
}

async function blockProtectedFileWritePath(
  toolName: string,
  root: string,
  protectedPaths: readonly string[],
  args: JsonValue,
): Promise<AgentToolCallDecision | undefined> {
  const filePath = getStringArgument(args, "path");
  if (!filePath) {
    return undefined;
  }

  const normalizedPath = await normalizeRequestedPath(root, filePath);
  const matchedPattern = protectedPaths.find((pattern) =>
    matchesPathPattern(normalizedPath, pattern),
  );
  if (!matchedPattern) {
    return undefined;
  }

  return block(
    `Tool policy blocked ${toolName}: protected path "${normalizedPath}" matches "${matchedPattern}".`,
  );
}

function blockDangerousRunCommand(
  additionalBlockedCommandPatterns: readonly RegExp[],
  args: JsonValue,
): AgentToolCallDecision | undefined {
  const command = getStringArgument(args, "command");
  if (!command) {
    return undefined;
  }
  const commandArgs = getStringArrayArgument(args, "args");
  const commandName = getExecutableName(command);
  const defaultReason =
    getDefaultBlockedCommandReason(commandName, commandArgs) ??
    getDefaultBlockedShellReason(commandName, commandArgs);
  if (defaultReason) {
    return block(`Tool policy blocked run_command: ${defaultReason}.`);
  }

  const commandLine = formatCommandLine(command, commandArgs);
  const matchedPattern = additionalBlockedCommandPatterns.find((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(commandLine);
  });
  if (!matchedPattern) {
    return undefined;
  }

  return block(
    `Tool policy blocked run_command: command matches ${matchedPattern.toString()}.`,
  );
}

function getDefaultBlockedCommandReason(
  commandName: string,
  args: readonly string[],
): string | undefined {
  if (commandName === "sudo") {
    return "sudo is not allowed";
  }
  if (commandName === "chown") {
    return "chown is not allowed";
  }
  if (commandName === "chmod" && args.some(isWorldWritableMode)) {
    return "chmod 777 is not allowed";
  }
  if (commandName === "rm" && hasRecursiveForceFlags(args)) {
    return "rm -rf is not allowed";
  }

  return undefined;
}

function getDefaultBlockedShellReason(
  commandName: string,
  args: readonly string[],
): string | undefined {
  if (!SHELL_COMMANDS.has(commandName)) {
    return undefined;
  }

  const script = getShellScript(args);
  if (!script) {
    return undefined;
  }

  return DANGEROUS_SHELL_PATTERNS.find(({ pattern }) => pattern.test(script))
    ?.reason;
}

function getShellScript(args: readonly string[]): string | undefined {
  const optionIndex = args.findIndex(
    (arg) => arg === "-c" || (arg.startsWith("-") && arg.includes("c")),
  );
  if (optionIndex === -1) {
    return undefined;
  }

  return args[optionIndex + 1];
}

function hasRecursiveForceFlags(args: readonly string[]): boolean {
  let hasRecursive = false;
  let hasForce = false;
  for (const arg of args) {
    if (arg === "--recursive" || arg === "-r" || arg === "-R") {
      hasRecursive = true;
      continue;
    }
    if (arg === "--force" || arg === "-f") {
      hasForce = true;
      continue;
    }
    if (!arg.startsWith("--") && arg.startsWith("-")) {
      hasRecursive ||= /[rR]/.test(arg);
      hasForce ||= arg.includes("f");
    }
  }

  return hasRecursive && hasForce;
}

function isWorldWritableMode(arg: string): boolean {
  return arg === "777" || arg === "0777";
}

async function normalizeRequestedPath(
  rootPath: string,
  requestedPath: string,
): Promise<string> {
  const root = await realpath(rootPath);
  const target = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(root, requestedPath);
  const relativePath = relative(root, target);
  if (relativePath === "") {
    return ".";
  }
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return toPosixPath(requestedPath);
  }

  return toPosixPath(relativePath);
}

function matchesPathPattern(path: string, pattern: string): boolean {
  return globToRegExp(toPosixPath(pattern)).test(toPosixPath(path));
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];
    if (char === "*" && nextChar === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegExp(char ?? "");
  }

  return new RegExp(`${source}$`);
}

function getStringArgument(args: JsonValue, key: string): string | undefined {
  const record = getArgumentRecord(args);
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function getStringArrayArgument(args: JsonValue, key: string): string[] {
  const record = getArgumentRecord(args);
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getArgumentRecord(
  args: JsonValue,
): Record<string, JsonValue> | undefined {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return undefined;
  }

  return args as Record<string, JsonValue>;
}

function getExecutableName(command: string): string {
  return command.split(/[\\/]/).at(-1) ?? command;
}

function formatCommandLine(command: string, args: readonly string[]): string {
  return [command, ...args].map(formatCommandPart).join(" ");
}

function formatCommandPart(value: string): string {
  if (/^[\w./:=@+-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function toPosixPath(value: string): string {
  return value.split(sep).join("/").replace(/^\.\//, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

function block(reason: string): AgentToolCallDecision {
  return {
    block: true,
    reason,
    isError: true,
  };
}

export type { CodingToolPolicyOptions };
