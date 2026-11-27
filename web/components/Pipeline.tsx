import type { Deal } from "@/lib/types";

const STAGES: Deal["stage"][] = ["lead", "qualified", "proposal", "won", "lost"];

export default function Pipeline({ deals }: { deals: Deal[] }) {
  return (
    <div className="pipeline">
      {STAGES.map((stage) => {
        const items = deals.filter((d) => d.stage === stage);
        return (
          <div key={stage} className="stage">
            <h3>
              {stage} <span className="muted">{items.length}</span>
            </h3>
            {items.map((d) => (
              <div key={d.id} className="deal">
                <strong>{d.title}</strong>
                <span className="muted">
                  {d.id} · ${d.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
