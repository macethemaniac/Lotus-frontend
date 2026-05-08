import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

export function WithdrawalShell() {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Withdrawal shell</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Withdrawal v0 is non-custodial. Backend records user-broadcast transaction references and fails closed for unsupported venues.
          </p>
        </div>
        <StatusBadge tone="pending">Capability gated</StatusBadge>
      </div>
      <div className="mt-4 rounded-md border border-zinc-800 bg-black p-4 text-sm text-zinc-400">
        Supported endpoint family: `POST /funding/withdrawals`, quote, submit tx hash/reference, and status. Venue actions remain disabled until capability evidence is returned.
      </div>
    </Panel>
  );
}
