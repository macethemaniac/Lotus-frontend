import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

const references = [
  "AuthPageMockup",
  "DashboardV2Mockup",
  "InfraTradingTerminal",
  "PortfolioMockupV2",
  "FundingDeposit",
  "DepositSuccessReceipt",
  "DepositFailedReceipt",
  "CanonicalMarketView",
  "RoutePreview",
  "ExecutionReceipt",
  "AlertsNotifications",
  "GlobalFooterVariations",
  "InfraLeaderboard",
];

export function DesignReferencePanel() {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Design references</h2>
          <p className="mt-1 text-xs text-zinc-400">These files are preserved under `src/design` and are not wired as production routes yet.</p>
        </div>
        <StatusBadge tone="neutral">Reference only</StatusBadge>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {references.map((name) => (
          <div key={name} className="rounded-md border border-zinc-800 bg-black p-3 font-mono text-xs text-zinc-300">{name}</div>
        ))}
      </div>
    </Panel>
  );
}
