import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AuthSession } from "@/features/auth/types";
import { getFundingHistory, getVenueActivations, getVenueBalances, type FundingHistoryRow, type VenueActivation, type VenueBalance } from "@/features/funding/api/funding-api";
import { formatNumber } from "@/lib/formatting/format";

export function FundingReadinessPanel({ session }: { session: AuthSession | null }) {
  const [balances, setBalances] = useState<VenueBalance[]>([]);
  const [activations, setActivations] = useState<VenueActivation[]>([]);
  const [history, setHistory] = useState<FundingHistoryRow[]>([]);
  const [message, setMessage] = useState("Funding readiness has not been checked.");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!session) return;
    setLoading(true);
    try {
      const [balanceResponse, activationResponse, historyResponse] = await Promise.all([
        getVenueBalances(session.userJwt),
        getVenueActivations(session.userJwt),
        getFundingHistory(session.userJwt),
      ]);
      setBalances(balanceResponse.balances ?? balanceResponse.venues ?? []);
      setActivations(activationResponse.activations ?? activationResponse.venues ?? []);
      setHistory(historyResponse.rows ?? historyResponse.history ?? []);
      setMessage("Venue-ready funding evidence refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Funding readiness refresh failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Venue-ready balances</h2>
          <p className="mt-1 text-xs text-zinc-400">Only backend-confirmed READY_TO_TRADE capital can satisfy execution preflight.</p>
        </div>
        <StatusBadge tone={balances.length > 0 ? "ready" : "pending"}>Non-custodial</StatusBadge>
      </div>

      <div className="mt-4">
        <Button variant="secondary" onClick={refresh} disabled={!session || loading}>Refresh readiness</Button>
      </div>
      <p className="mt-3 text-xs text-zinc-400">{message}</p>

      <div className="mt-4 overflow-hidden rounded-md border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-black text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Venue</th>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Ready</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {balances.length === 0 ? (
              <tr><td className="px-3 py-4 text-zinc-500" colSpan={4}>No venue-ready balances loaded.</td></tr>
            ) : balances.map((balance, index) => (
              <tr key={`${balance.venue}-${index}`}>
                <td className="px-3 py-3 font-bold">{balance.venue}</td>
                <td className="px-3 py-3 text-zinc-400">{balance.asset ?? balance.token ?? "USDC"}</td>
                <td className="px-3 py-3 font-mono">{formatNumber(balance.availableAmount ?? balance.readyAmount ?? "0")}</td>
                <td className="px-3 py-3"><StatusBadge tone="ready">READY_TO_TRADE</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activations.length > 0 || history.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <EvidenceList title="Activation evidence" rows={activations.map((item) => `${item.venue}: ${item.status ?? (item.required ? "required" : "not required")}`)} />
          <EvidenceList title="Recent funding history" rows={history.map((item) => `${item.venue ?? "Funding"}: ${item.status ?? "unknown"} ${item.amount ?? ""} ${item.asset ?? ""}`)} />
        </div>
      ) : null}
    </Panel>
  );
}

function EvidenceList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-md border border-zinc-800 p-3">
      <h3 className="text-xs font-bold uppercase text-zinc-500">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-zinc-300">
        {rows.length === 0 ? <p className="text-zinc-500">No evidence loaded.</p> : rows.map((row) => <p key={row}>{row}</p>)}
      </div>
    </div>
  );
}
