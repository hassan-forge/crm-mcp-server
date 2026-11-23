#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AuditLog } from "./audit.js";
import { InMemoryCrm } from "./crm.js";
import { policyFromEnv } from "./policy.js";
import { createServer } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.CRM_DATA ?? resolve(here, "..", "data", "crm.json");

const policy = policyFromEnv();
const server = createServer({
  crm: InMemoryCrm.fromFile(dataFile),
  policy,
  audit: new AuditLog(process.env.AUDIT_LOG),
});

await server.connect(new StdioServerTransport());
// stdout carries the MCP protocol, so status messages go to stderr.
console.error(`crm-mcp-server running (${policy.mode}, actor: ${policy.actor})`);
