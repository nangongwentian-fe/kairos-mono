#!/usr/bin/env bun
import { createServer } from "node:net";
import { env, exit } from "node:process";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const SERVER_HOST = env.KAIROS_CODING_WEB_HOST ?? "127.0.0.1";
const SERVER_PORT = env.KAIROS_CODING_WEB_PORT ?? "4174";
const CLIENT_HOST = env.KAIROS_CODING_WEB_CLIENT_HOST ?? "127.0.0.1";
const CLIENT_PORT = env.KAIROS_CODING_WEB_CLIENT_PORT ?? "4173";

const childEnv = {
  ...env,
  KAIROS_CODING_WEB_HOST: SERVER_HOST,
  KAIROS_CODING_WEB_PORT: SERVER_PORT,
  KAIROS_CODING_WEB_CLIENT_HOST: CLIENT_HOST,
  KAIROS_CODING_WEB_CLIENT_PORT: CLIENT_PORT,
};

await assertPortAvailable("API server", SERVER_HOST, SERVER_PORT);
await assertPortAvailable("Vite client", CLIENT_HOST, CLIENT_PORT);

const server = Bun.spawn({
  cmd: ["bun", "src/server/main.ts"],
  cwd: APP_DIR,
  env: childEnv,
  stderr: "inherit",
  stdout: "inherit",
});

const client = Bun.spawn({
  cmd: ["bun", "run", "client:dev"],
  cwd: APP_DIR,
  env: childEnv,
  stderr: "inherit",
  stdout: "inherit",
});

let stopping = false;

function stopChildren(): void {
  if (stopping) {
    return;
  }
  stopping = true;
  server.kill();
  client.kill();
}

process.on("SIGINT", () => {
  stopChildren();
  exit(130);
});

process.on("SIGTERM", () => {
  stopChildren();
  exit(143);
});

const exitCode = await Promise.race([server.exited, client.exited]);
stopChildren();
exit(exitCode);

async function assertPortAvailable(
  label: string,
  host: string,
  port: string,
): Promise<void> {
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1) {
    throw new Error(`${label} port must be a positive integer: ${port}`);
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        rejectPromise(
          new Error(
            `${label} port is already in use: ${host}:${port}. Stop the stale coding-web process or set a different port.`,
          ),
        );
        return;
      }
      rejectPromise(error);
    });
    probe.once("listening", () => {
      probe.close(() => resolvePromise());
    });
    probe.listen(portNumber, host);
  });
}
