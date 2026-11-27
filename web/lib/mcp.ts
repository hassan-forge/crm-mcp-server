import "server-only";

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { AuditEntry, CallResult, PolicySettings, SessionInfo, ToolInfo } from "./types";

/**
 * One MCP session per console process. The console starts crm-mcp-server as a
 * child process and talks to it over stdio, exactly like Claude Desktop does,
 * so everything shown here goes through the real protocol, policy and audit log.
 */
interface Session {
  client: Client;
  policy: PolicySettings;
  auditFile: string;
}

const SERVER_ENTRY =
  process.env.MCP_SERVER_ENTRY ?? resolve(process.cwd(), "..", "dist", "index.js");

const globalStore = globalThis as unknown as { __crmMcpSession?: Promise<Session> };

async function start(policy: PolicySettings): Promise<Session> {
  if (!existsSync(/*turbopackIgnore: true*/ SERVER_ENTRY)) {
    throw new Error(
      `MCP server not found at ${SERVER_ENTRY}. Run "npm run build" in the repository root first.`,
    );
  }
  const auditFile = join(mkdtempSync(join(tmpdir(), "crm-mcp-")), "audit.jsonl");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: {
      ...(process.env as Record<string, string>),
      CRM_MODE: policy.mode,
      CRM_ALLOW_CLOSING_DEALS: String(policy.allowClosingDeals),
      CRM_ACTOR: "console-user",
      AUDIT_LOG: auditFile,
    },
    stderr: "inherit",
  });
  const client = new Client({ name: "crm-mcp-console", version: "0.1.0" });
  await client.connect(transport);
  return { client, policy, auditFile };
}

async function session(): Promise<Session> {
  globalStore.__crmMcpSession ??= start({ mode: "read-only", allowClosingDeals: false });
  try {
    return await globalStore.__crmMcpSession;
  } catch (err) {
    globalStore.__crmMcpSession = undefined;
    throw err;
  }
}

export async function restart(policy: PolicySettings): Promise<SessionInfo> {
  const old = globalStore.__crmMcpSession;
  globalStore.__crmMcpSession = start(policy);
  if (old) {
    old.then((s) => s.client.close()).catch(() => undefined);
  }
  return describe();
}

export async function describe(): Promise<SessionInfo> {
  const s = await session();
  const { tools } = await s.client.listTools();
  return { policy: s.policy, tools: tools as ToolInfo[] };
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<CallResult> {
  const s = await session();
  const result = (await s.client.callTool({ name, arguments: args })) as {
    content: { type: string; text?: string }[];
    isError?: boolean;
  };
  const text = result.content.map((c) => c.text ?? "").join("\n");
  return { isError: Boolean(result.isError), text };
}

export async function readAudit(limit = 100): Promise<AuditEntry[]> {
  const s = await session();
  if (!existsSync(/*turbopackIgnore: true*/ s.auditFile)) return [];
  return readFileSync(/*turbopackIgnore: true*/ s.auditFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEntry)
    .slice(-limit)
    .reverse();
}
