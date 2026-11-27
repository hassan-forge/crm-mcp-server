"use client";

import { FormEvent, useState } from "react";

import type { ToolInfo } from "@/lib/types";

/** Example values so every tool can be tried with one click. */
const EXAMPLES: Record<string, Record<string, string>> = {
  search_contacts: { query: "dental" },
  get_contact: { contact_id: "C-101" },
  list_deals: {},
  add_note: { contact_id: "C-101", body: "Call summary: wants a Slack integration demo next week." },
  update_deal_stage: { deal_id: "D-203", stage: "qualified", reason: "Budget confirmed on call" },
};

function coerce(type: string | undefined, raw: string): unknown {
  if (type === "number" || type === "integer") return Number(raw);
  if (type === "boolean") return raw === "true";
  return raw;
}

export default function ToolForm({
  tool,
  onRun,
  busy,
}: {
  tool: ToolInfo;
  onRun: (name: string, args: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const properties = tool.inputSchema.properties ?? {};
  const required = new Set(tool.inputSchema.required ?? []);
  const [values, setValues] = useState<Record<string, string>>(EXAMPLES[tool.name] ?? {});

  function submit(event: FormEvent) {
    event.preventDefault();
    const args: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const raw = values[key];
      if (raw === undefined || raw === "") continue;
      args[key] = coerce(prop.type, raw);
    }
    onRun(tool.name, args);
  }

  return (
    <form className="tool" onSubmit={submit}>
      <div className="tool-head">
        <code>{tool.name}</code>
        <span className={tool.annotations?.readOnlyHint ? "tag read" : "tag write"}>
          {tool.annotations?.readOnlyHint ? "read" : "write"}
        </span>
      </div>
      {tool.description && <p className="muted">{tool.description}</p>}
      {Object.entries(properties).map(([key, prop]) => (
        <label key={key} className="field">
          <span>
            {key}
            {required.has(key) && <em> *</em>}
          </span>
          {prop.enum ? (
            <select
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            >
              <option value="">{required.has(key) ? "choose…" : "any"}</option>
              {prop.enum.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={prop.type === "number" || prop.type === "integer" ? "number" : "text"}
              placeholder={prop.description ?? (prop.default !== undefined ? `default ${prop.default}` : "")}
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          )}
        </label>
      ))}
      <button type="submit" disabled={busy}>
        Call tool
      </button>
    </form>
  );
}
