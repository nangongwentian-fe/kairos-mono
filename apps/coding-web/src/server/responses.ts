export class BadRequestError extends Error {
  readonly status = 400;
}

export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function errorResponse(error: unknown): Response {
  const status = error instanceof BadRequestError ? error.status : 500;
  return jsonResponse(
    {
      error: formatError(error),
    },
    status,
  );
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
