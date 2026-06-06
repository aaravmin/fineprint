// Placeholder shell. Board components (TicketBoard, AgentRail, ApprovalQueue,
// EventFeed, BuildingSearch) land in M4 — see README "Template status".
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "./module_bindings/index.ts";

export default function App() {
  const { isActive: connected } = useSpacetimeDB();
  const [buildings] = useTable(tables.building);
  const [tasks] = useTable(tables.task);
  const [workers] = useTable(tables.worker);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Fineprint</h1>
      <p className="mt-1 text-sm text-muted">
        NYC compliance ops room — template shell. Dashboard components land in M4.
      </p>

      <div className="mt-6 rounded-lg border border-edge bg-panel p-4 font-mono text-sm">
        <div>
          status:{" "}
          <span className={connected ? "text-ok" : "text-warn"}>
            {connected ? "connected" : "disconnected"}
          </span>
        </div>
        <div className="mt-2 text-muted">
          buildings {buildings.length} · tasks {tasks.length} · workers {workers.length}
        </div>
      </div>
    </main>
  );
}
