import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { AuditLog } from "../src/audit.js";
import { InMemoryCrm } from "../src/crm.js";
import { type Policy, policyFromEnv } from "../src/policy.js";
import { createServer } from "../src/server.js";

const DATA = join(import.meta.dirname, "..", "data", "crm.json");

async function connect(overrides: Partial<Policy> = {}, auditFile?: string) {
  const policy = { ...policyFromEnv({}), ...overrides };
  const crm = InMemoryCrm.fromFile(DATA);
  const audit = new AuditLog(auditFile);
  const server = createServer({ crm, policy, audit });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    const text = res.content[0].text;
    return { isError: Boolean(res.isError), text, json: res.isError ? undefined : JSON.parse(text) };
  };
  return { client, call, crm, audit };
}

describe("tool listing", () => {
  it("hides write tools in the default read-only mode", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_contact", "list_deals", "search_contacts"]);
  });

  it("shows write tools in read-write mode", async () => {
    const { client } = await connect({ mode: "read-write" });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("add_note");
    expect(names).toContain("update_deal_stage");
  });

  it("respects an explicit allowlist", async () => {
    const { client } = await connect({ mode: "read-write", allowedTools: ["search_contacts", "add_note"] });
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["add_note", "search_contacts"]);
  });

  it("marks read tools as read-only for the client", async () => {
    const { client } = await connect();
    const search = (await client.listTools()).tools.find((t) => t.name === "search_contacts");
    expect(search?.annotations?.readOnlyHint).toBe(true);
  });
});

describe("read tools", () => {
  it("searches contacts and hides phone numbers by default", async () => {
    const { call } = await connect();
    const { json } = await call("search_contacts", { query: "corvus" });
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("Omar Haddad");
    expect(json[0].phone).toBe("[hidden by policy]");
  });

  it("shows phone numbers only when the policy allows it", async () => {
    const { call } = await connect({ exposePhoneNumbers: true });
    const { json } = await call("search_contacts", { query: "corvus" });
    expect(json[0].phone).toBe("+1 312 555 0188");
  });

  it("returns a contact with deals and notes", async () => {
    const { call } = await connect();
    const { json } = await call("get_contact", { contact_id: "C-102" });
    expect(json.deals[0].id).toBe("D-202");
    expect(json.recent_notes[0].body).toContain("re-keying");
  });

  it("filters deals by stage and amount, largest first", async () => {
    const { call } = await connect();
    const { json } = await call("list_deals", { stage: "qualified", min_amount: 20000 });
    expect(json.map((d: { id: string }) => d.id)).toEqual(["D-202", "D-204"]);
  });

  it("reports unknown ids as errors", async () => {
    const { call } = await connect();
    const res = await call("get_contact", { contact_id: "C-999" });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("No contact");
  });

  it("validates input", async () => {
    const { call } = await connect();
    const res = await call("search_contacts", { query: "a" });
    expect(res.isError).toBe(true);
  });
});

describe("write tools and guardrails", () => {
  it("adds a note signed by the AI actor", async () => {
    const { call, crm } = await connect({ mode: "read-write", actor: "support-bot" });
    const { json } = await call("add_note", { contact_id: "C-103", body: "Asked for a demo next week." });
    expect(json.author).toBe("support-bot");
    expect(crm.notesForContact("C-103", 5)[0].body).toBe("Asked for a demo next week.");
  });

  it("moves a small deal to another stage", async () => {
    const { call } = await connect({ mode: "read-write" });
    const { json } = await call("update_deal_stage", { deal_id: "D-203", stage: "qualified", reason: "Budget confirmed" });
    expect(json.stage).toBe("qualified");
    expect(json.previous_stage).toBe("lead");
  });

  it("refuses to change deals above the amount limit", async () => {
    const { call, crm } = await connect({ mode: "read-write", maxDealAmountForAutoUpdate: 25000 });
    const res = await call("update_deal_stage", { deal_id: "D-202", stage: "proposal", reason: "Sent proposal" });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("A person needs to change it");
    expect(crm.getDeal("D-202")?.stage).toBe("qualified");
  });

  it("refuses to close deals unless allowed", async () => {
    const { call } = await connect({ mode: "read-write" });
    const res = await call("update_deal_stage", { deal_id: "D-203", stage: "won", reason: "Signed" });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("needs a person");
  });

  it("can close deals when the team enables it", async () => {
    const { call } = await connect({ mode: "read-write", allowClosingDeals: true });
    const { json } = await call("update_deal_stage", { deal_id: "D-203", stage: "won", reason: "Signed" });
    expect(json.stage).toBe("won");
  });
});

describe("audit log", () => {
  it("records every call with its outcome and writes JSONL to disk", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "audit-")), "audit.jsonl");
    const { call, audit } = await connect({ mode: "read-write" }, file);
    await call("search_contacts", { query: "dana" });
    await call("update_deal_stage", { deal_id: "D-202", stage: "proposal", reason: "Proposal sent" });
    await call("get_contact", { contact_id: "nope" });

    expect(audit.entries.map((e) => [e.tool, e.outcome])).toEqual([
      ["search_contacts", "ok"],
      ["update_deal_stage", "refused"],
      ["get_contact", "error"],
    ]);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1]).detail).toContain("limit");
  });

  it("does not store note text in the audit log", async () => {
    const { call, audit } = await connect({ mode: "read-write" });
    await call("add_note", { contact_id: "C-101", body: "Private details about pricing" });
    expect(JSON.stringify(audit.entries)).not.toContain("Private details");
  });
});

describe("policy from environment", () => {
  it("defaults to safe settings", () => {
    const p = policyFromEnv({});
    expect(p.mode).toBe("read-only");
    expect(p.exposePhoneNumbers).toBe(false);
    expect(p.allowClosingDeals).toBe(false);
  });

  it("reads overrides", () => {
    const p = policyFromEnv({ CRM_MODE: "read-write", CRM_ALLOWED_TOOLS: "a, b", CRM_MAX_DEAL_AMOUNT: "5000" });
    expect(p).toMatchObject({ mode: "read-write", allowedTools: ["a", "b"], maxDealAmountForAutoUpdate: 5000 });
  });
});
