import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AuthSession } from "@/features/auth/types";
import { ensureDefaultWallets, listVenueAccounts, listWallets, prepareVenueSetupBatch, type UserVenueAccount, type UserWallet } from "@/features/wallets/api/wallet-api";
import { shortAddress } from "@/lib/formatting/format";

export function WalletSetupPanel({ session }: { session: AuthSession | null }) {
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [accounts, setAccounts] = useState<UserVenueAccount[]>([]);
  const [message, setMessage] = useState("Wallet setup has not been checked.");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!session) return;
    setLoading(true);
    try {
      const [walletResponse, accountResponse] = await Promise.all([
        listWallets(session.userJwt),
        listVenueAccounts(session.userJwt),
      ]);
      setWallets(walletResponse.wallets ?? []);
      setAccounts(accountResponse.accounts ?? []);
      setMessage("Wallet and venue account metadata refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet refresh failed.");
    } finally {
      setLoading(false);
    }
  }

  async function setup() {
    if (!session) return;
    setLoading(true);
    try {
      const walletResponse = await ensureDefaultWallets(session.userJwt);
      await prepareVenueSetupBatch(session.userJwt);
      const accountResponse = await listVenueAccounts(session.userJwt);
      setWallets(walletResponse.wallets ?? []);
      setAccounts(accountResponse.accounts ?? []);
      setMessage("Venue setup batch prepared. Any returned signature requests must be signed by the user's Turnkey wallet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet setup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Wallet and venue setup</h2>
          <p className="mt-1 text-xs text-zinc-400">Lotus stores public wallet metadata only. Funds remain user-controlled.</p>
        </div>
        <StatusBadge tone={accounts.some((account) => account.status === "ACTIVE") ? "ready" : "pending"}>Evidence gated</StatusBadge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={refresh} disabled={!session || loading}>Refresh wallets</Button>
        <Button onClick={setup} disabled={!session || loading}>Ensure setup</Button>
      </div>
      <p className="mt-3 text-xs text-zinc-400">{message}</p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-zinc-800 p-3">
          <h3 className="text-xs font-bold uppercase text-zinc-500">Wallets</h3>
          <div className="mt-3 space-y-2">
            {wallets.length === 0 ? <p className="text-sm text-zinc-500">No wallet metadata loaded.</p> : wallets.map((wallet) => (
              <div key={wallet.walletId} className="rounded-md bg-black p-3 text-sm">
                <div className="font-mono text-zinc-200">{shortAddress(wallet.address)}</div>
                <div className="mt-1 text-xs text-zinc-500">{wallet.chainFamily} / {wallet.chain} / {wallet.status}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 p-3">
          <h3 className="text-xs font-bold uppercase text-zinc-500">Venue accounts</h3>
          <div className="mt-3 space-y-2">
            {accounts.length === 0 ? <p className="text-sm text-zinc-500">No venue account metadata loaded.</p> : accounts.map((account) => (
              <div key={`${account.venue}-${account.walletAddress}`} className="rounded-md bg-black p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{account.venue}</span>
                  <StatusBadge tone={account.status === "ACTIVE" ? "ready" : "pending"}>{account.status}</StatusBadge>
                </div>
                <div className="mt-1 font-mono text-xs text-zinc-400">{shortAddress(account.walletAddress)}</div>
                {account.readinessBlockers?.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-300">
                    {account.readinessBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
