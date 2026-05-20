import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AuthSession } from "@/features/auth/types";
import {
  createExecutionQuote,
  getExecutionStatus,
  getLiveCandidates,
  getLiveReadiness,
  getPositions,
  prepareSignatures,
  submitExecutionQuote,
  submitSignedBundle,
  type ExecutionStatus,
  type LiveCandidatesResponse,
  type LiveSubmitReadinessSnapshot,
  type RouteQuote,
  type SignatureBundle,
  type TradeSide,
} from "@/features/trading/api/execution-api";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/formatting/format";
import { openExecutionSocket, type ExecutionWsState, type ExecutionWsEvent } from "@/lib/ws/execution-ws-client";

const defaultMarketId = "FRONTEND_CURATED:CRYPTO|FDV_THRESHOLD_AFTER_LAUNCH|EXTENDED|ONE_DAY_AFTER_LAUNCH|ABOVE|300000000|300M";

const isLiveReadinessBlocked = (readiness: LiveSubmitReadinessSnapshot | null): boolean =>
  Boolean(readiness && (
    readiness.status !== "fresh" ||
    readiness.venues.some((venue) => venue.status !== "fresh" || venue.blockers.length > 0)
  ));

const liveReadinessBlockerMessage = (readiness: LiveSubmitReadinessSnapshot | null): string => {
  const venue = readiness?.venues.find((item) => item.status !== "fresh" || item.blockers.length > 0);
  if (venue) {
    return `${venue.venue}: ${venue.blockers[0] ?? "Live submit readiness is stale. Refresh balances and retry."}`;
  }
  return readiness?.blockers[0] ?? "Live submit readiness is blocked. Refresh balances and retry.";
};

export function PrivateBetaTradeFlow({ session }: { session: AuthSession | null }) {
  const [side, setSide] = useState<TradeSide>("buy");
  const [marketId, setMarketId] = useState(defaultMarketId);
  const [outcomeId, setOutcomeId] = useState("YES");
  const [amount, setAmount] = useState("1");
  const [venues, setVenues] = useState("POLYMARKET,LIMITLESS,PREDICT_FUN");
  const [liveCandidates, setLiveCandidates] = useState<LiveCandidatesResponse | null>(null);
  const [quote, setQuote] = useState<RouteQuote | null>(null);
  const [signatureBundle, setSignatureBundle] = useState<SignatureBundle | null>(null);
  const [signedLegsJson, setSignedLegsJson] = useState("");
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus | null>(null);
  const [liveReadiness, setLiveReadiness] = useState<LiveSubmitReadinessSnapshot | null>(null);
  const [positions, setPositions] = useState<unknown[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [message, setMessage] = useState("Load live candidates to begin.");
  const [loading, setLoading] = useState(false);
  const [wsState, setWsState] = useState<ExecutionWsState>("idle");
  const [lastWsEvent, setLastWsEvent] = useState<ExecutionWsEvent | null>(null);

  const executionId = quote?.quoteId ?? executionStatus?.executionId;
  const venueList = useMemo(() => venues.split(",").map((venue) => venue.trim()).filter(Boolean), [venues]);

  useEffect(() => {
    if (!executionId) return;
    const interval = window.setInterval(() => {
      if (session) void refreshExecutionStatus(executionId, false);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [executionId, session]);

  useEffect(() => {
    if (!executionId) return;
    const client = openExecutionSocket({
      onStateChange: setWsState,
      onEvent: (event) => {
        setLastWsEvent(event);
        if (event.type === "EXECUTION_STATUS_UPDATE") {
          setExecutionStatus((previous) => ({ ...(previous ?? { executionId, dryRun: false }), ...(event.payload as Record<string, unknown>) } as ExecutionStatus));
        }
      },
    });
    client.socket.addEventListener("open", () => {
      client.subscribe(`execution:quote:${executionId}`);
      if (session?.userId) client.subscribe(`execution:user:${session.userId}`);
    });
    return () => client.socket.close();
  }, [executionId, session?.userId]);

  async function loadCandidates() {
    if (!session) return;
    setLoading(true);
    try {
      const result = await getLiveCandidates(session.userJwt, { side, marketId, outcomeId, amount, venues: venueList });
      setLiveCandidates(result);
      setQuote(null);
      setSignatureBundle(null);
      setExecutionStatus(null);
      setMessage(`Loaded ${result.candidates.length} live candidate(s); ${result.blocked.length} blocked.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live candidate lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function createQuote() {
    if (!session || !liveCandidates) return;
    setLoading(true);
    try {
      const result = await createExecutionQuote(session.userJwt, {
        side,
        marketId,
        outcomeId,
        amount,
        candidates: liveCandidates.candidates,
      });
      setQuote(result.quote);
      setSignatureBundle(null);
      setMessage("Execution quote created from backend live venue evidence.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quote creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function submitQuote() {
    if (!session || !quote) return;
    setLoading(true);
    try {
      const result = await submitExecutionQuote(session.userJwt, quote.quoteId);
      setExecutionStatus({ executionId: result.executionId, status: result.status, route: result.route, dryRun: false, submittedLegs: [] });
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quote submit failed.");
    } finally {
      setLoading(false);
    }
  }

  async function prepare() {
    if (!session || !executionId) return;
    setLoading(true);
    try {
      const readiness = await getLiveReadiness(session.userJwt, executionId);
      setLiveReadiness(readiness);
      if (isLiveReadinessBlocked(readiness)) {
        setMessage(liveReadinessBlockerMessage(readiness));
        return;
      }
      const result = await prepareSignatures(session.userJwt, executionId);
      setSignatureBundle(result);
      setMessage(`Prepared ${result.signatureRequests.length} signature request(s). Sign with the user's Turnkey wallet, then paste signed legs JSON.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Signature preparation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshReadiness() {
    if (!session || !executionId) return;
    try {
      const result = await getLiveReadiness(session.userJwt, executionId);
      setLiveReadiness(result);
      setMessage("Live readiness refreshed. Backend preflight remains authoritative.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live readiness refresh failed.");
    }
  }

  async function submitBundle() {
    if (!session || !executionId) return;
    setLoading(true);
    try {
      const readiness = await getLiveReadiness(session.userJwt, executionId);
      setLiveReadiness(readiness);
      if (isLiveReadinessBlocked(readiness)) {
        setMessage(liveReadinessBlockerMessage(readiness));
        return;
      }
      const parsed = JSON.parse(signedLegsJson) as unknown[];
      const result = await submitSignedBundle(session.userJwt, executionId, parsed, dryRun);
      setExecutionStatus(result);
      setMessage(dryRun ? "Dry-run signed bundle verified." : "Live signed bundle submitted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Signed bundle submit failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshExecutionStatus(id = executionId, noisy = true) {
    if (!session || !id) return;
    try {
      const result = await getExecutionStatus(session.userJwt, id);
      setExecutionStatus(result);
      if (result.route?.marketId && result.route?.outcomeId) {
        const positionResponse = await getPositions(session.userJwt, {
          marketId: result.route.marketId,
          outcomeId: result.route.outcomeId,
        });
        setPositions(positionResponse.positions ?? []);
      }
      if (noisy) setMessage("Execution status refreshed.");
    } catch (error) {
      if (noisy) setMessage(error instanceof Error ? error.message : "Execution status refresh failed.");
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Private-beta RFQ and execution flow</h2>
          <p className="mt-1 text-xs text-zinc-400">Live candidates, route quotes, signatures, and submit are all backend-gated.</p>
        </div>
        <StatusBadge tone={wsState === "open" ? "ready" : "neutral"}>WS {wsState}</StatusBadge>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_120px_120px_160px]">
        <label className="text-xs font-semibold text-zinc-400 lg:col-span-4">
          Market ID
          <input className="mt-2 w-full rounded-md border border-zinc-800 bg-black p-3 font-mono text-xs text-zinc-200 outline-none focus:border-lotus-500" value={marketId} onChange={(event) => setMarketId(event.target.value)} />
        </label>
        <label className="text-xs font-semibold text-zinc-400">
          Outcome
          <input className="mt-2 w-full rounded-md border border-zinc-800 bg-black p-3 text-sm text-zinc-200 outline-none focus:border-lotus-500" value={outcomeId} onChange={(event) => setOutcomeId(event.target.value)} />
        </label>
        <label className="text-xs font-semibold text-zinc-400">
          Side
          <select className="mt-2 w-full rounded-md border border-zinc-800 bg-black p-3 text-sm text-zinc-200 outline-none focus:border-lotus-500" value={side} onChange={(event) => setSide(event.target.value as TradeSide)}>
            <option value="buy">buy</option>
            <option value="sell">sell</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-zinc-400">
          Amount
          <input className="mt-2 w-full rounded-md border border-zinc-800 bg-black p-3 text-sm text-zinc-200 outline-none focus:border-lotus-500" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="text-xs font-semibold text-zinc-400">
          Venues
          <input className="mt-2 w-full rounded-md border border-zinc-800 bg-black p-3 text-xs text-zinc-200 outline-none focus:border-lotus-500" value={venues} onChange={(event) => setVenues(event.target.value)} />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={loadCandidates} disabled={!session || loading}>Load live candidates</Button>
        <Button variant="secondary" onClick={createQuote} disabled={!session || !liveCandidates || loading}>Create quote</Button>
        <Button variant="secondary" onClick={submitQuote} disabled={!session || !quote || loading}>Submit quote gate</Button>
        <Button variant="secondary" onClick={prepare} disabled={!session || !executionId || loading}>Prepare signatures</Button>
        <Button variant="secondary" onClick={refreshReadiness} disabled={!session || !executionId}>Refresh readiness</Button>
        <Button variant="secondary" onClick={() => void refreshExecutionStatus()} disabled={!session || !executionId}>Refresh status</Button>
      </div>

      <p className="mt-3 text-xs text-zinc-400">{message}</p>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <FlowCard title="Live candidates">
          {liveCandidates ? (
            <div className="space-y-2 text-sm">
              <p>{liveCandidates.candidates.length} candidate(s), {liveCandidates.blocked.length} blocked</p>
              {liveCandidates.candidates.map((candidate) => (
                <div key={`${candidate.venue}-${candidate.venueMarketId ?? ""}`} className="rounded-md bg-black p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{candidate.venue}</span>
                    <span className="font-mono">{candidate.price}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">Available {formatNumber(candidate.availableSize)} / {candidate.quoteQuality ?? "quote evidence"}</p>
                </div>
              ))}
              {liveCandidates.blocked.map((blocker) => <p key={`${blocker.venue}-${blocker.reason}`} className="text-xs text-amber-300">{blocker.venue}: {blocker.reason}</p>)}
            </div>
          ) : <p className="text-sm text-zinc-500">No live candidates loaded.</p>}
        </FlowCard>

        <FlowCard title="Route quote">
          {quote ? (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-xs text-zinc-400">{quote.quoteId}</p>
              <p>{quote.routeType} via {quote.venuePath.join(" → ")}</p>
              <p>Amount {formatNumber(quote.executableAmount)} at effective price {quote.effectivePrice}</p>
              <p>Savings {formatUsd(quote.estimatedSavings ?? 0)}</p>
              <p className="text-xs text-zinc-500">Expires {formatDateTime(quote.expiresAt)}</p>
            </div>
          ) : <p className="text-sm text-zinc-500">No backend route quote yet.</p>}
        </FlowCard>

        <FlowCard title="Signature requests">
          {signatureBundle ? (
            <div className="space-y-3">
              <p className="text-sm">{signatureBundle.signatureRequests.length} user signature request(s)</p>
              <pre className="max-h-64 overflow-auto rounded-md bg-black p-3 text-xs text-zinc-300 custom-scrollbar">{JSON.stringify(signatureBundle, null, 2)}</pre>
              <label className="block text-xs font-semibold text-zinc-400">
                Signed legs JSON
                <textarea className="mt-2 h-28 w-full resize-none rounded-md border border-zinc-800 bg-black p-3 font-mono text-xs outline-none focus:border-lotus-500" value={signedLegsJson} onChange={(event) => setSignedLegsJson(event.target.value)} placeholder='[{"legIndex":0,"venue":"PREDICT_FUN","signedPayload":{...}}]' />
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} className="h-4 w-4 accent-lotus-500" />
                Dry-run submit first
              </label>
              <Button onClick={submitBundle} disabled={!session || !signedLegsJson || loading}>Submit signed bundle</Button>
            </div>
          ) : <p className="text-sm text-zinc-500">No signature bundle prepared.</p>}
        </FlowCard>

        <FlowCard title="Execution status and positions">
          {executionStatus ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-400">{executionStatus.executionId}</span>
                <StatusBadge tone={executionStatus.status === "FAILED" || executionStatus.userStatus === "FAILED" ? "blocked" : "pending"}>{executionStatus.status ?? executionStatus.userStatus ?? "UNKNOWN"}</StatusBadge>
              </div>
              <pre className="max-h-56 overflow-auto rounded-md bg-black p-3 text-xs text-zinc-300 custom-scrollbar">{JSON.stringify(executionStatus, null, 2)}</pre>
              <p className="text-xs text-zinc-500">Positions loaded: {positions.length}</p>
              {lastWsEvent ? <p className="text-xs text-emerald-300">Last WS event: {lastWsEvent.type} at {formatDateTime(lastWsEvent.emittedAt)}</p> : null}
            </div>
          ) : <p className="text-sm text-zinc-500">No execution status loaded.</p>}
        </FlowCard>

        <FlowCard title="Live readiness">
          {liveReadiness ? (
            <pre className="max-h-56 overflow-auto rounded-md bg-black p-3 text-xs text-zinc-300 custom-scrollbar">{JSON.stringify(liveReadiness, null, 2)}</pre>
          ) : <p className="text-sm text-zinc-500">Readiness is checked by backend before live submit.</p>}
        </FlowCard>
      </div>
    </Panel>
  );
}

function FlowCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-800 p-3">
      <h3 className="mb-3 text-xs font-bold uppercase text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}
