import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

export function PortfolioShell() {
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Panel className="p-5">
        <h1 className="text-sm font-bold">Portfolio</h1>
        <p className="mt-5 text-3xl font-black">Backend positions</p>
        <p className="mt-2 text-sm text-zinc-400">Verified positions are loaded from execution settlement evidence, not local wallet guesses.</p>
      </Panel>
      <Panel className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Performance</h2>
          <StatusBadge tone="pending">PNL aggregate pending contract</StatusBadge>
        </div>
        <div className="mt-8 flex h-48 items-center justify-center rounded-md border border-dashed border-zinc-800 text-sm text-zinc-500">
          Portfolio chart waits for backend-supported PnL aggregates or approved frontend calculation rules.
        </div>
      </Panel>
      <Panel className="p-5 lg:col-span-2">
        <h2 className="font-bold">Current Positions</h2>
        <p className="mt-3 text-sm text-zinc-400">The trade flow panel loads `GET /execution/positions` for the selected market and outcome.</p>
      </Panel>
    </div>
  );
}
