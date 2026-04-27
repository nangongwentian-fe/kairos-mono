import type { JsonValue } from "@kairos/ai";

export function getRequiredString(
  args: Record<string, JsonValue>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export function getString(
  args: Record<string, JsonValue>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }

  return value;
}

export function getOptionalString(
  args: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }

  return value;
}

export function getOptionalNumber(
  args: Record<string, JsonValue>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`${key} must be a number.`);
  }

  return value;
}

export function getOptionalBoolean(
  args: Record<string, JsonValue>,
  key: string,
): boolean {
  const value = args[key];
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean.`);
  }

  return value;
}

export function getOptionalStringArray(
  args: Record<string, JsonValue>,
  key: string,
): string[] {
  const value = args[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${key} must be an array of strings.`);
  }

  return value as string[];
}

export function normalizePositiveInteger(
  value: number | undefined,
  defaultValue: number,
  maxValue: number,
  name: string,
): number {
  const numberValue = Number(value ?? defaultValue);
  if (!Number.isFinite(numberValue) || numberValue < 1) {
    throw new Error(`${name} must be a positive number.`);
  }

  return Math.min(Math.floor(numberValue), maxValue);
}

export function normalizeNonNegativeInteger(
  value: number | undefined,
  defaultValue: number,
  maxValue: number,
  name: string,
): number {
  const numberValue = Number(value ?? defaultValue);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return Math.min(Math.floor(numberValue), maxValue);
}
