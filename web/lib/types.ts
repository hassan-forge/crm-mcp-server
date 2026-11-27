export interface PolicySettings {
  mode: "read-only" | "read-write";
  allowClosingDeals: boolean;
}

export interface JsonSchemaProperty {
  type?: string;
  enum?: string[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

export interface ToolInfo {
  name: string;
  title?: string;
  description?: string;
  inputSchema: {
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  annotations?: { readOnlyHint?: boolean };
}

export interface SessionInfo {
  policy: PolicySettings;
  tools: ToolInfo[];
}

export interface CallResult {
  isError: boolean;
  text: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  tool: string;
  args: Record<string, unknown>;
  outcome: "ok" | "refused" | "error";
  detail?: string;
}

export interface Deal {
  id: string;
  contactId: string;
  title: string;
  amount: number;
  stage: "lead" | "qualified" | "proposal" | "won" | "lost";
  updatedAt: string;
}
