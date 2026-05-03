#!/usr/bin/env bun
import { createCodingWebServer } from "./index.js";

const server = createCodingWebServer();
console.log(`Kairos coding web listening on http://${server.hostname}:${server.port}`);
