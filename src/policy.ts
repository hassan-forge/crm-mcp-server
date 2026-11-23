/**
 * What the AI is allowed to do. Defaults are safe: read-only, phone numbers hidden.
 * A team widens access on purpose, through environment variables, never by accident.
 */
export interface Policy {
  mode: "read-only" | "read-write";
  /** If set, only these tools are exposed to the model at all. */
  allowedTools?: string[];
  /** Stage changes on deals above this amount are refused and left for a person. */
  maxDealAmountForAutoUpdate: number;
  /** Closing a deal (won/lost) is a business decision; off unless enabled. */
  allowClosingDeals: boolean;
  exposePhoneNumbers: boolean;
  /** Name written on notes and in the audit log. */
  actor: string;
}

export const WRITE_TOOLS = new Set(["add_note", "update_deal_stage"]);

export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): Policy {
  const list = (v?: string) =>
    v
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    mode: env.CRM_MODE === "read-write" ? "read-write" : "read-only",
    allowedTools: list(env.CRM_ALLOWED_TOOLS),
    maxDealAmountForAutoUpdate: Number(env.CRM_MAX_DEAL_AMOUNT ?? 25_000),
    allowClosingDeals: env.CRM_ALLOW_CLOSING_DEALS === "true",
    exposePhoneNumbers: env.CRM_EXPOSE_PHONE === "true",
    actor: env.CRM_ACTOR ?? "ai-assistant",
  };
}

/** Returns a reason when the tool is not available under this policy. */
export function toolBlocked(policy: Policy, tool: string): string | undefined {
  if (policy.allowedTools && !policy.allowedTools.includes(tool)) {
    return `Tool ${tool} is not in CRM_ALLOWED_TOOLS.`;
  }
  if (WRITE_TOOLS.has(tool) && policy.mode !== "read-write") {
    return `The CRM is connected in read-only mode, so ${tool} is disabled.`;
  }
  return undefined;
}
