"use client";

import { useCallback, useEffect, useState } from "react";

import Pipeline from "@/components/Pipeline";
import ToolForm from "@/components/ToolForm";
import type { AuditEntry, CallResult, Deal, PolicySettings, SessionInfo } from "@/lib/types";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export default function Console() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [draft, setDraft] = useState<PolicySettings>({ mode: "read-only", allowClosingDeals: false });
  const [result, setResult] = useState<(CallResult & { tool: string }) | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDeals = useCallback(async () => {
    const r = await json<CallResult>("/api/call", {
      method: "POST",
      body: JSON.stringify({ name: "list_deals", arguments: {} }),
    });
    if (!r.isError) setDeals(JSON.parse(r.text) as Deal[]);
  }, []);

  const refreshAudit = useCallback(async () => {
    setAudit(await json<AuditEntry[]>("/api/audit"));
  }, []);

  const load = useCallback(
    async (info: SessionInfo) => {
      setSession(info);
      setDraft(info.policy);
      await refreshDeals();
      await refreshAudit();
    },
    [refreshDeals, refreshAudit],
  );

  useEffect(() => {
    json<SessionInfo>("/api/session")
      .then(load)
      .catch((err: Error) => setError(err.message));
  }, [load]);

  async function applyPolicy() {
    setBusy(true);
    setError(null);
    try {
      setResult(null);
      await load(await json<SessionInfo>("/api/session", { method: "POST", body: JSON.stringify(draft) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run(name: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await json<CallResult>("/api/call", {
        method: "POST",
        body: JSON.stringify({ name, arguments: args }),
      });
      setResult({ ...r, tool: name });
      if (name === "update_deal_stage" && !r.isError) await refreshDeals();
      await refreshAudit();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const changed =
    session &&
    (draft.mode !== session.policy.mode || draft.allowClosingDeals !== session.policy.allowClosingDeals);

  return (
    <main>
      <header className="top">
        <div>
          <h1>CRM MCP Console</h1>
          <p className="muted">
            Connected to <code>crm-mcp-server</code> over stdio, the same way Claude Desktop connects.
          </p>
        </div>
        <div className="policy">
          <div className="segmented">
            {(["read-only", "read-write"] as const).map((mode) => (
              <button
                key={mode}
                className={draft.mode === mode ? "on" : ""}
                onClick={() => setDraft({ ...draft, mode })}
              >
                {mode}
              </button>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.allowClosingDeals}
              onChange={(e) => setDraft({ ...draft, allowClosingDeals: e.target.checked })}
            />
            allow closing deals
          </label>
          <button className="apply" disabled={!changed || busy} onClick={() => void applyPolicy()}>
            Restart with policy
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="grid">
        <section className="card">
          <h2>Tools the AI can see ({session?.tools.length ?? 0})</h2>
          <p className="muted small">
            Tools blocked by the policy are not listed at all, so a model never learns they exist.
          </p>
          {session?.tools.map((t) => (
            <ToolForm key={`${session.policy.mode}-${t.name}`} tool={t} onRun={run} busy={busy} />
          ))}
        </section>

        <div className="stack">
          <section className="card">
            <h2>Result</h2>
            {result ? (
              <>
                <p className={result.isError ? "outcome bad" : "outcome ok"}>
                  <code>{result.tool}</code> {result.isError ? "refused or failed" : "ok"}
                </p>
                <pre className={result.isError ? "result bad" : "result"}>{result.text}</pre>
              </>
            ) : (
              <p className="muted">Call a tool to see exactly what the model would receive.</p>
            )}
          </section>

          <section className="card">
            <h2>Pipeline</h2>
            <Pipeline deals={deals} />
          </section>
        </div>
      </div>

      <section className="card">
        <h2>Audit log</h2>
        {audit.length === 0 ? (
          <p className="muted">Every tool call, including refused ones, is recorded here.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Tool</th>
                <th>Outcome</th>
                <th>Arguments / detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.at).toLocaleTimeString()}</td>
                  <td>{e.actor}</td>
                  <td>
                    <code>{e.tool}</code>
                  </td>
                  <td className={e.outcome}>{e.outcome}</td>
                  <td className="details">
                    {JSON.stringify(e.args)}
                    {e.detail && <div className="detail">{e.detail}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
