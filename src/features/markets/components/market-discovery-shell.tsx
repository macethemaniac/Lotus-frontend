import { Flame, Landmark, Trophy } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

const marketCards = [
  { title: "FDV Threshold After Launch: $300M", category: "Crypto", price: "38.8c", route: "Single", venues: "2 venues scanned" },
  { title: "2026 FIFA World Cup Winner", category: "Sports", price: "16c", route: "Pair", venues: "4 venues scanned" },
  { title: "Office Exit By Date", category: "Politics", price: "56.2c", route: "Tri", venues: "3 venues scanned" },
];

export function MarketDiscoveryShell({ onStartTrade }: { onStartTrade: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
      <Panel className="hidden p-4 lg:block">
        <h2 className="text-sm font-semibold">Filter by</h2>
        <div className="mt-5 space-y-5 text-sm text-zinc-400">
          <FilterGroup title="Route Quality" items={["Best Opportunities", "Best Routes", "Review Required", "Fallback Available"]} />
          <FilterGroup title="Route Type" items={["Pair", "Single", "Tri"]} />
          <FilterGroup title="Confidence" items={["Exact Match", "Semantic Match", "Under Review"]} />
        </div>
      </Panel>

      <section className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <TabButton active icon={<Flame className="h-4 w-4" />}>Trending</TabButton>
          <TabButton active>Best Routes</TabButton>
          <TabButton icon={<Trophy className="h-4 w-4" />}>Sports</TabButton>
          <TabButton icon={<Landmark className="h-4 w-4" />}>Politics</TabButton>
        </div>
        <div className="mt-8 border-t border-zinc-800 pt-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-black">Top Opportunities</h1>
            <StatusBadge tone="pending">Backend route evidence required</StatusBadge>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {marketCards.map((market) => (
              <button
                key={market.title}
                type="button"
                onClick={onStartTrade}
                className="rounded-lg border border-zinc-800 bg-[#121214] p-5 text-left transition hover:border-lotus-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold">{market.title}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{market.category} - {market.venues}</p>
                  </div>
                  <p className="font-mono text-xl font-black">{market.price}</p>
                </div>
                <div className="mt-5 rounded-md border border-lotus-500/30 bg-lotus-500/5 px-3 py-2 text-xs text-zinc-300">
                  Route: {market.route} <span className="ml-3 text-lotus-500">Savings shown only when backend provides evidence</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <span className="rounded-md bg-black p-2 text-zinc-300">Yes</span>
                  <span className="rounded-md bg-black p-2 text-zinc-300">No</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <Panel className="border-lotus-500/40 p-5">
          <h2 className="text-sm font-bold">Today with Lotus</h2>
          <Metric label="Routeable Opportunities" value="Backend gated" />
          <Metric label="Improved Routes" value="Evidence only" />
          <Metric label="Review-Gated Markets" value="Fail closed" />
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Execution-ready capital</p>
          <p className="mt-3 text-sm text-zinc-400">Use the funding tab to load backend-confirmed venue-ready balances.</p>
        </Panel>
      </aside>
    </div>
  );
}

function FilterGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold text-white">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <label key={item} className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-lotus-500" />
            {item}
          </label>
        ))}
      </div>
    </div>
  );
}

function TabButton({ active = false, icon, children }: { active?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500 ${
        active ? "border-lotus-500/40 bg-lotus-500/10 text-lotus-500" : "border-zinc-800 bg-[#121214] text-zinc-300"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-mono font-bold text-zinc-200">{value}</span>
    </div>
  );
}
