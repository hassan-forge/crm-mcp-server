import { appendFileSync } from "node:fs";

export interface AuditEntry {
  at: string;
  actor: string;
  tool: string;
  args: Record<string, unknown>;
  outcome: "ok" | "refused" | "error";
  detail?: string;
}

export class AuditLog {
  readonly entries: AuditEntry[] = [];

  /** @param file Optional JSONL file; every entry is also appended there. */
  constructor(private readonly file?: string) {}

  record(entry: Omit<AuditEntry, "at">): AuditEntry {
    const full: AuditEntry = { at: new Date().toISOString(), ...entry };
    this.entries.push(full);
    if (this.file) appendFileSync(this.file, `${JSON.stringify(full)}\n`);
    return full;
  }
}
