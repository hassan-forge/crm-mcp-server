import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AuditLog } from "./audit.js";
import { type Contact, type CrmProvider, STAGES, type Stage } from "./crm.js";
import { type Policy, toolBlocked } from "./policy.js";

export class Refusal extends Error {}

export interface ServerDeps {
  crm: CrmProvider;
  policy: Policy;
  audit: AuditLog;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function createServer({ crm, policy, audit }: ServerDeps): McpServer {
  const server = new McpServer({ name: "crm-mcp-server", version: "0.1.0" });

  const redact = (c: Contact) => (policy.exposePhoneNumbers ? c : { ...c, phone: "[hidden by policy]" });

  /** Runs a tool body with policy checks, a JSON result and an audit entry for every call. */
  const run = (tool: string, args: Record<string, unknown>, body: () => unknown): ToolResult => {
    const blocked = toolBlocked(policy, tool);
    try {
      if (blocked) throw new Refusal(blocked);
      const result = body();
      audit.record({ actor: policy.actor, tool, args, outcome: "ok" });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const refused = err instanceof Refusal;
      const message = err instanceof Error ? err.message : String(err);
      audit.record({ actor: policy.actor, tool, args, outcome: refused ? "refused" : "error", detail: message });
      return { content: [{ type: "text", text: message }], isError: true };
    }
  };

  // Tools the policy blocks are not even listed, so the model never sees them.
  const expose = (tool: string) => !toolBlocked(policy, tool);

  if (expose("search_contacts")) {
    server.registerTool(
      "search_contacts",
      {
        title: "Search contacts",
        description: "Find CRM contacts by name, email or company. Returns up to `limit` matches.",
        inputSchema: {
          query: z.string().min(2).describe("Part of a name, email or company"),
          limit: z.number().int().min(1).max(25).default(10),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query, limit }) =>
        run("search_contacts", { query, limit }, () => crm.searchContacts(query, limit).map(redact)),
    );
  }

  if (expose("get_contact")) {
    server.registerTool(
      "get_contact",
      {
        title: "Get contact",
        description: "Get one contact with their deals and most recent notes.",
        inputSchema: { contact_id: z.string().describe("Contact id, e.g. C-101") },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ contact_id }) =>
        run("get_contact", { contact_id }, () => {
          const contact = crm.getContact(contact_id);
          if (!contact) throw new Error(`No contact with id ${contact_id}`);
          return {
            contact: redact(contact),
            deals: crm.dealsForContact(contact_id),
            recent_notes: crm.notesForContact(contact_id, 5),
          };
        }),
    );
  }

  if (expose("list_deals")) {
    server.registerTool(
      "list_deals",
      {
        title: "List deals",
        description: "List deals, largest first, optionally filtered by pipeline stage and minimum amount.",
        inputSchema: {
          stage: z.enum(STAGES).optional(),
          min_amount: z.number().min(0).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ stage, min_amount }) =>
        run("list_deals", { stage, min_amount }, () => crm.listDeals({ stage, minAmount: min_amount })),
    );
  }

  if (expose("add_note")) {
    server.registerTool(
      "add_note",
      {
        title: "Add note",
        description: "Add a note to a contact, for example a call summary. Notes are signed with the AI's name.",
        inputSchema: {
          contact_id: z.string(),
          body: z.string().min(3).max(4000),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async ({ contact_id, body }) =>
        run("add_note", { contact_id, body_length: body.length }, () =>
          crm.addNote(contact_id, body, policy.actor),
        ),
    );
  }

  if (expose("update_deal_stage")) {
    server.registerTool(
      "update_deal_stage",
      {
        title: "Update deal stage",
        description:
          "Move a deal to another pipeline stage. Large deals and closing a deal (won/lost) may be refused by policy and left for a person.",
        inputSchema: {
          deal_id: z.string(),
          stage: z.enum(STAGES),
          reason: z.string().min(3).describe("Why the stage is changing; stored in the audit log"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ deal_id, stage, reason }) =>
        run("update_deal_stage", { deal_id, stage, reason }, () => {
          const deal = crm.getDeal(deal_id);
          if (!deal) throw new Error(`No deal with id ${deal_id}`);
          checkStageChange(policy, deal.amount, stage);
          const before = deal.stage;
          const updated = crm.updateDealStage(deal_id, stage);
          return { ...updated, previous_stage: before };
        }),
    );
  }

  return server;
}

export function checkStageChange(policy: Policy, amount: number, stage: Stage): void {
  if ((stage === "won" || stage === "lost") && !policy.allowClosingDeals) {
    throw new Refusal(`Marking a deal as ${stage} needs a person. Leave a note for the deal owner instead.`);
  }
  if (amount > policy.maxDealAmountForAutoUpdate) {
    throw new Refusal(
      `This deal (${amount}) is above the ${policy.maxDealAmountForAutoUpdate} limit for AI updates. A person needs to change it.`,
    );
  }
}
