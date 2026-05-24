import { useCallback, useEffect, useState } from "react";
import type React from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bell,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  PieChart,
  RefreshCw,
  Search,
  Terminal,
  Wallet,
} from "lucide-react";
import { CryptoLogo, VenueLogo, resolveTopicAssetLogoId } from "@/components/icons/asset-logo";
import { LotusLogo } from "@/components/icons/lotus-icons";
import type { AuthSession } from "@/features/auth/types";
import {
  createExecutionQuote,
  getExecutionHistory,
  getLiveCandidates,
  getOpenOrders,
  getPortfolioSummary,
  getPortfolioTimeSeries,
  getPositions,
  submitExecutionQuote,
  type LiveCandidatesResponse,
  type MarkedExecutionPosition,
  type OpenOrdersResponse,
  type PortfolioSummary,
  type PortfolioTimeSeriesResponse,
  type RouteQuote,
} from "@/features/trading/api/execution-api";
import {
  getEventMarkets,
  getMarketOutcomes,
  listEvents,
  listMarketCategories,
  type MarketCatalogEvent,
  type MarketCatalogMarket,
  type MarketOutcome,
} from "@/features/markets/api/market-api";
import {
  getFundingHistory,
  getVenueActivations,
  getVenueBalances,
  getVenueCapabilities,
  type FundingHistoryRow,
  type VenueActivation,
  type VenueBalance,
  type VenueCapability,
} from "@/features/funding/api/funding-api";
import { getNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification } from "@/features/notifications/api/notification-api";
import { listVenueAccounts, listWallets, type UserVenueAccount, type UserWallet } from "@/features/wallets/api/wallet-api";
import { openExecutionSocket, type ExecutionWsState } from "@/lib/ws/execution-ws-client";

type Page = "markets" | "terminal" | "portfolio" | "funding";

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type TerminalState = {
  selectedMarket: MarketCatalogMarket | null;
  outcomes: MarketOutcome[];
  outcomeId: string;
  side: "buy" | "sell";
  amount: string;
  liveCandidates: LiveCandidatesResponse | null;
  quote: RouteQuote | null;
  executionId: string | null;
  statusMessage: string | null;
  loading: boolean;
  error: string | null;
};

type PortfolioData = {
  summary: PortfolioSummary;
  timeseries: PortfolioTimeSeriesResponse;
  positions: MarkedExecutionPosition[];
  openOrders: OpenOrdersResponse["items"];
  historyItems: Awaited<ReturnType<typeof getExecutionHistory>>["items"];
};

const emptyAsync = <T,>(): AsyncState<T> => ({ data: null, loading: false, error: null });

const categoryFallback: Record<string, string> = {
  SPORTS: "🏆",
  POLITICS: "🏛",
  CRYPTO: "₿",
  ESPORTS: "🎮",
};

export function LotusBetaShell({ session }: { session: AuthSession }) {
  const [page, setPage] = useState<Page>("markets");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [wsState, setWsState] = useState<ExecutionWsState>("idle");
  const [categories, setCategories] = useState<Array<{ category: string; marketCount: number; eventCount?: number }>>([]);
  const [events, setEvents] = useState<AsyncState<MarketCatalogEvent[]>>(emptyAsync);
  const [notifications, setNotifications] = useState<AsyncState<UserNotification[]>>(emptyAsync);
  const [account, setAccount] = useState<AsyncState<{ wallets: UserWallet[]; venueAccounts: UserVenueAccount[] }>>(emptyAsync);
  const [funding, setFunding] = useState<AsyncState<{
    balances: VenueBalance[];
    activations: VenueActivation[];
    capabilities: VenueCapability[];
    history: FundingHistoryRow[];
  }>>(emptyAsync);
  const [portfolio, setPortfolio] = useState<AsyncState<PortfolioData>>(emptyAsync);
  const [terminal, setTerminal] = useState<TerminalState>({
    selectedMarket: null,
    outcomes: [],
    outcomeId: "",
    side: "buy",
    amount: "10",
    liveCandidates: null,
    quote: null,
    executionId: null,
    statusMessage: null,
    loading: false,
    error: null,
  });

  const loadMarkets = useCallback(async () => {
    setEvents((state) => ({ ...state, loading: true, error: null }));
    try {
      const [categoryResponse, eventResponse] = await Promise.all([
        listMarketCategories(),
        listEvents({ category: category || undefined, search: search || undefined, limit: 40 }),
      ]);
      setCategories(categoryResponse.categories);
      setEvents({ data: eventResponse.events, loading: false, error: null });
    } catch (error) {
      setEvents({ data: null, loading: false, error: errorMessage(error) });
    }
  }, [category, search]);

  const loadNotifications = useCallback(async () => {
    setNotifications((state) => ({ ...state, loading: true, error: null }));
    try {
      const response = await getNotifications(session.userJwt, { limit: 25 });
      setNotifications({ data: response.items, loading: false, error: null });
    } catch (error) {
      setNotifications({ data: null, loading: false, error: errorMessage(error) });
    }
  }, [session.userJwt]);

  const loadAccount = useCallback(async () => {
    setAccount((state) => ({ ...state, loading: true, error: null }));
    try {
      const [wallets, venueAccounts] = await Promise.all([
        listWallets(session.userJwt),
        listVenueAccounts(session.userJwt),
      ]);
      setAccount({ data: { wallets: wallets.wallets, venueAccounts: venueAccounts.accounts }, loading: false, error: null });
    } catch (error) {
      setAccount({ data: null, loading: false, error: errorMessage(error) });
    }
  }, [session.userJwt]);

  const loadFunding = useCallback(async () => {
    setFunding((state) => ({ ...state, loading: true, error: null }));
    try {
      const [balances, activations, capabilities, history] = await Promise.all([
        getVenueBalances(session.userJwt),
        getVenueActivations(session.userJwt),
        getVenueCapabilities(session.userJwt),
        getFundingHistory(session.userJwt),
      ]);
      setFunding({
        data: {
          balances: balances.balances ?? balances.venues ?? [],
          activations: activations.activations ?? activations.venues ?? [],
          capabilities: normalizeCapabilities(capabilities.capabilities),
          history: history.rows ?? history.history ?? [],
        },
        loading: false,
        error: null,
      });
    } catch (error) {
      setFunding({ data: null, loading: false, error: errorMessage(error) });
    }
  }, [session.userJwt]);

  const loadPortfolio = useCallback(async () => {
    setPortfolio((state) => ({ ...state, loading: true, error: null }));
    try {
      const [summary, timeseries, positions, openOrders, history] = await Promise.all([
        getPortfolioSummary(session.userJwt),
        getPortfolioTimeSeries(session.userJwt, { range: "7D" }),
        getPositions(session.userJwt, { limit: 100 }),
        getOpenOrders(session.userJwt, { limit: 25 }),
        getExecutionHistory(session.userJwt, { limit: 25 }),
      ]);
      setPortfolio({
        data: {
          summary,
          timeseries,
          positions: positions.positions as MarkedExecutionPosition[],
          openOrders: openOrders.items,
          historyItems: history.items,
        },
        loading: false,
        error: null,
      });
    } catch (error) {
      setPortfolio({ data: null, loading: false, error: errorMessage(error) });
    }
  }, [session.userJwt]);

  const refreshPrivateData = useCallback(() => {
    void loadNotifications();
    void loadAccount();
    void loadFunding();
    void loadPortfolio();
  }, [loadAccount, loadFunding, loadNotifications, loadPortfolio]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadMarkets(), 250);
    return () => window.clearTimeout(timeout);
  }, [loadMarkets]);

  useEffect(() => {
    refreshPrivateData();
  }, [refreshPrivateData]);

  useEffect(() => {
    const client = openExecutionSocket({
      onStateChange: setWsState,
      onEvent: (event) => {
        if (event.type === "USER_NOTIFICATION") void loadNotifications();
        if (event.type === "EXECUTION_MARK_UPDATE" || event.type === "EXECUTION_PORTFOLIO_UPDATE" || event.type === "EXECUTION_STATUS_UPDATE") void loadPortfolio();
      },
    });
    const subscribeWhenOpen = () => {
      client.subscribe(`notifications:user:${session.userId}`);
      client.subscribe(`execution:portfolio:${session.userId}`);
      client.subscribe(`execution:user:${session.userId}`);
    };
    client.socket.addEventListener("open", subscribeWhenOpen);
    return () => {
      client.socket.removeEventListener("open", subscribeWhenOpen);
      client.socket.close();
    };
  }, [loadNotifications, loadPortfolio, session.userId]);

  const unreadCount = notifications.data?.filter((item) => item.readAt === null).length ?? 0;

  const openMarket = async (market: MarketCatalogMarket) => {
    setPage("terminal");
    setTerminal((state) => ({
      ...state,
      selectedMarket: market,
      outcomes: [],
      outcomeId: "",
      liveCandidates: null,
      quote: null,
      executionId: null,
      statusMessage: null,
      loading: true,
      error: null,
    }));
    try {
      const marketId = market.canonicalMarketIds[0] ?? market.canonicalEventId;
      const [outcomes, eventMarkets] = await Promise.all([
        getMarketOutcomes(marketId),
        market.eventId ? getEventMarkets(market.eventId).catch(() => null) : Promise.resolve(null),
      ]);
      const freshMarket = eventMarkets?.markets.find((entry) => entry.canonicalMarketIds.includes(marketId)) ?? market;
      setTerminal((state) => ({
        ...state,
        selectedMarket: freshMarket,
        outcomes: outcomes.outcomes,
        outcomeId: outcomes.outcomes[0]?.id ?? "",
        loading: false,
      }));
    } catch (error) {
      setTerminal((state) => ({ ...state, loading: false, error: errorMessage(error) }));
    }
  };

  const requestLiveRoutes = async () => {
    const market = terminal.selectedMarket;
    if (!market || !terminal.outcomeId) {
      setTerminal((state) => ({ ...state, error: "Select a backend market and outcome first." }));
      return;
    }
    setTerminal((state) => ({ ...state, loading: true, error: null, quote: null, statusMessage: null }));
    try {
      const response = await getLiveCandidates(session.userJwt, {
        side: terminal.side,
        marketId: market.canonicalMarketIds[0] ?? market.canonicalEventId,
        outcomeId: terminal.outcomeId,
        amount: terminal.amount,
        venues: market.venues,
      });
      setTerminal((state) => ({ ...state, liveCandidates: response, loading: false }));
    } catch (error) {
      setTerminal((state) => ({ ...state, loading: false, error: errorMessage(error) }));
    }
  };

  const requestQuote = async () => {
    if (!terminal.liveCandidates || !terminal.selectedMarket) return;
    setTerminal((state) => ({ ...state, loading: true, error: null }));
    try {
      const response = await createExecutionQuote(session.userJwt, {
        side: terminal.side,
        marketId: terminal.selectedMarket.canonicalMarketIds[0] ?? terminal.selectedMarket.canonicalEventId,
        outcomeId: terminal.outcomeId,
        amount: terminal.amount,
        venues: terminal.selectedMarket.venues,
        candidates: terminal.liveCandidates.candidates,
      });
      setTerminal((state) => ({ ...state, quote: response.quote, loading: false }));
    } catch (error) {
      setTerminal((state) => ({ ...state, loading: false, error: errorMessage(error) }));
    }
  };

  const submitQuote = async () => {
    if (!terminal.quote) return;
    setTerminal((state) => ({ ...state, loading: true, error: null }));
    try {
      const response = await submitExecutionQuote(session.userJwt, terminal.quote.quoteId);
      setTerminal((state) => ({
        ...state,
        executionId: response.executionId,
        statusMessage: response.message,
        loading: false,
      }));
      void loadPortfolio();
      void loadNotifications();
    } catch (error) {
      setTerminal((state) => ({ ...state, loading: false, error: errorMessage(error) }));
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-zinc-800 bg-zinc-950/95 px-2 py-4">
        <LotusLogo className="h-8 w-8 text-[#ccff00]" />
        <nav className="mt-8 flex flex-col gap-3">
          <NavButton label="Markets" active={page === "markets"} onClick={() => setPage("markets")} icon={<BarChart2 className="h-5 w-5" />} />
          <NavButton label="Terminal" active={page === "terminal"} onClick={() => setPage("terminal")} icon={<Terminal className="h-5 w-5" />} />
          <NavButton label="Portfolio" active={page === "portfolio"} onClick={() => setPage("portfolio")} icon={<PieChart className="h-5 w-5" />} />
          <NavButton label="Funding" active={page === "funding"} onClick={() => setPage("funding")} icon={<Wallet className="h-5 w-5" />} />
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-5">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <label className="sr-only" htmlFor="market-search">Search markets</label>
            <input
              id="market-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
              placeholder="Search backend-approved markets"
              type="search"
              autoComplete="off"
            />
          </div>
          <WsBadge state={wsState} />
          <button
            type="button"
            onClick={refreshPrivateData}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void markAllNotificationsRead(session.userJwt).then(loadNotifications)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
            aria-label="Mark notifications read"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {unreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {page === "markets" && (
            <MarketsView
              category={category}
              categories={categories}
              events={events}
              onCategory={setCategory}
              onRefresh={loadMarkets}
              onOpenMarket={(market) => void openMarket(market)}
            />
          )}
          {page === "terminal" && (
            <TerminalView
              state={terminal}
              setState={setTerminal}
              onLiveRoutes={() => void requestLiveRoutes()}
              onQuote={() => void requestQuote()}
              onSubmit={() => void submitQuote()}
            />
          )}
          {page === "portfolio" && <PortfolioView state={portfolio} onRefresh={loadPortfolio} />}
          {page === "funding" && (
            <FundingView
              account={account}
              funding={funding}
              notifications={notifications}
              onRefresh={refreshPrivateData}
              onReadNotification={(id) => void markNotificationRead(session.userJwt, id).then(loadNotifications)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function MarketsView({
  category,
  categories,
  events,
  onCategory,
  onRefresh,
  onOpenMarket,
}: {
  category: string;
  categories: Array<{ category: string; marketCount: number; eventCount?: number }>;
  events: AsyncState<MarketCatalogEvent[]>;
  onCategory: (category: string) => void;
  onRefresh: () => void;
  onOpenMarket: (market: MarketCatalogMarket) => void;
}) {
  return (
    <section className="space-y-5">
      <SectionHeader
        title="Markets"
        subtitle="Backend-approved canonical events and markets. Media is sanitized by Lotus before display."
        onRefresh={onRefresh}
      />
      <div className="flex flex-wrap gap-2">
        <FilterButton active={!category} onClick={() => onCategory("")}>All</FilterButton>
        {categories.map((entry) => (
          <FilterButton key={entry.category} active={category === entry.category} onClick={() => onCategory(entry.category)}>
            {prettyVenue(entry.category)} {entry.eventCount ?? entry.marketCount}
          </FilterButton>
        ))}
      </div>
      <StateBlock state={events} empty="No approved markets matched this filter.">
        {(items) => (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((event) => (
              <article key={event.eventId} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex gap-4">
                  <MarketMedia item={event} category={event.category} title={event.title} className="h-16 w-16" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-bold text-white">{event.title}</h2>
                        <p className="mt-1 text-xs text-zinc-500">{prettyVenue(event.category)} · {event.marketCount} markets · {event.venueCount} venues</p>
                      </div>
                      <StatusPill tone={event.status === "OPEN" ? "success" : "warning"}>{event.status}</StatusPill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {event.venues.map((venue) => <VenueChip key={venue} venue={venue} />)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 divide-y divide-zinc-800">
                  {event.markets.slice(0, 5).map((market) => (
                    <button
                      key={market.canonicalMarketIds[0] ?? market.canonicalEventId}
                      type="button"
                      onClick={() => onOpenMarket(market)}
                      className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                    >
                      <MarketMedia item={market} category={market.category} title={market.title} className="h-10 w-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-zinc-100">{market.title}</span>
                        <span className="mt-1 block text-xs text-zinc-500">{market.routeability.hasCrossVenue ? "Cross-venue routeable" : "Single venue"} · {market.outcomeCount} outcomes</span>
                      </span>
                      <span className="text-xs font-bold text-[#ccff00]">Open</span>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </StateBlock>
    </section>
  );
}

function TerminalView({
  state,
  setState,
  onLiveRoutes,
  onQuote,
  onSubmit,
}: {
  state: TerminalState;
  setState: React.Dispatch<React.SetStateAction<TerminalState>>;
  onLiveRoutes: () => void;
  onQuote: () => void;
  onSubmit: () => void;
}) {
  const market = state.selectedMarket;
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <SectionTitle title="Terminal" subtitle="Market orders only for this beta pass. Limit orders stay disabled until the backend creation/cancel contract exists." />
        {market ? (
          <div className="mt-5 space-y-5">
            <div className="flex items-start gap-4">
              <MarketMedia item={market} category={market.category} title={market.title} className="h-16 w-16" />
              <div className="min-w-0">
                <h1 className="text-xl font-black text-white">{market.title}</h1>
                <p className="mt-1 text-sm text-zinc-500">{prettyVenue(market.category)} · {market.venueCount} venues · {market.outcomeCount} outcomes</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{market.venues.map((venue) => <VenueChip key={venue} venue={venue} />)}</div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Outcome
                <select
                  value={state.outcomeId}
                  onChange={(event) => setState((value) => ({ ...value, outcomeId: event.target.value, liveCandidates: null, quote: null }))}
                  className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                >
                  {state.outcomes.map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Amount
                <input
                  value={state.amount}
                  onChange={(event) => setState((value) => ({ ...value, amount: event.target.value, liveCandidates: null, quote: null }))}
                  className="mt-2 h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 font-mono text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                  inputMode="decimal"
                  type="text"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterButton active={state.side === "buy"} onClick={() => setState((value) => ({ ...value, side: "buy", liveCandidates: null, quote: null }))}>Buy</FilterButton>
              <FilterButton active={state.side === "sell"} onClick={() => setState((value) => ({ ...value, side: "sell", liveCandidates: null, quote: null }))}>Sell</FilterButton>
              <button className="h-10 cursor-not-allowed rounded-lg border border-zinc-800 px-3 text-sm font-semibold text-zinc-600" type="button" disabled>
                Limit later
              </button>
            </div>
            {state.error && <InlineError message={state.error} />}
            {state.statusMessage && <InlineSuccess message={state.statusMessage} />}
          </div>
        ) : (
          <EmptyState title="No market selected" body="Open a backend-approved market from the Markets page to start a live route check." />
        )}
      </div>
      <aside className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <SectionTitle title="Execution" subtitle="Each step calls Lotus backend. Nothing signs or broadcasts from the browser here." />
        <div className="mt-5 space-y-3">
          <ActionButton onClick={onLiveRoutes} disabled={!market || state.loading}>
            {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            Find live routes
          </ActionButton>
          <ActionButton onClick={onQuote} disabled={!state.liveCandidates || state.loading || state.liveCandidates.candidates.length === 0}>
            Create quote
          </ActionButton>
          <ActionButton onClick={onSubmit} disabled={!state.quote || state.loading}>
            Submit market order
          </ActionButton>
        </div>
        {state.liveCandidates && (
          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="text-xs font-bold text-zinc-300">{state.liveCandidates.candidates.length} live candidates</div>
            <div className="mt-3 space-y-2">
              {state.liveCandidates.candidates.map((candidate) => (
                <div key={`${candidate.venue}-${candidate.venueMarketId ?? ""}`} className="flex items-center justify-between text-xs">
                  <VenueChip venue={candidate.venue} />
                  <span className="font-mono text-zinc-300">{candidate.price} · {candidate.availableSize}</span>
                </div>
              ))}
              {state.liveCandidates.blocked.map((blocker) => (
                <p key={`${blocker.venue}-${blocker.reason}`} className="text-xs text-amber-300">{prettyVenue(blocker.venue)}: {blocker.reason}</p>
              ))}
            </div>
          </div>
        )}
        {state.quote && (
          <div className="mt-4 rounded-lg border border-[#ccff00]/30 bg-[#ccff00]/10 p-3 text-xs">
            <div className="font-bold text-[#ccff00]">{state.quote.routeType} route</div>
            <p className="mt-2 text-zinc-300">Effective price: <span className="font-mono">{state.quote.effectivePrice}</span></p>
            <p className="mt-1 text-zinc-400">Expires {formatTime(state.quote.expiresAt)}</p>
          </div>
        )}
        {state.executionId && <p className="mt-4 break-all rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">Execution ID: {state.executionId}</p>}
      </aside>
    </section>
  );
}

function PortfolioView({ state, onRefresh }: { state: AsyncState<PortfolioData>; onRefresh: () => void }) {
  return (
    <section className="space-y-5">
      <SectionHeader title="Portfolio" subtitle="Verified positions, open orders, history, and backend live mark attempts." onRefresh={onRefresh} />
      <StateBlock state={state} empty="No portfolio data is available yet.">
        {(data) => (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Cost basis" value={formatMoneyString(data.summary.totalCostBasis)} />
              <MetricCard label="Mark value" value={data.summary.totalMarkValue ? formatMoneyString(data.summary.totalMarkValue) : "Unavailable"} />
              <MetricCard label="Unrealized PnL" value={data.summary.totalUnrealizedPnl ? formatMoneyString(data.summary.totalUnrealizedPnl) : "Unavailable"} />
              <MetricCard label="Open orders" value={String(data.openOrders.length)} />
            </div>
            {!data.timeseries.historyAvailable && (
              <InlineNotice message="Portfolio time-series is a current backend MTM snapshot only. Historical PnL is not drawn until persisted snapshots exist." />
            )}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <DataPanel title="Verified positions">
                {data.positions.length === 0 ? <EmptyState title="No verified positions" body="Positions appear after backend settlement evidence verifies fills." /> : (
                  <div className="divide-y divide-zinc-800">
                    {data.positions.map((position) => (
                      <div key={position.positionId} className="py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2"><VenueChip venue={position.venue} /><span className="truncate text-sm font-semibold">{position.marketId}</span></div>
                            <p className="mt-1 text-xs text-zinc-500">Outcome {position.outcomeId} · size {position.verifiedSize} · entry {position.averageEntryPrice}</p>
                          </div>
                          <div className="text-right text-xs">
                            <div className="font-mono text-zinc-100">{position.markValue ?? "No mark"}</div>
                            <div className={position.markFreshness === "live" ? "text-emerald-400" : "text-amber-300"}>
                              {position.markFreshness === "live" ? `PnL ${position.unrealizedPnl}` : position.markBlocker ?? "Mark unavailable"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DataPanel>
              <DataPanel title="Open orders and history">
                <div className="space-y-4">
                  <MiniList label="Open orders" items={data.openOrders.map((order) => `${order.executionId} · ${order.userStatus ?? order.status ?? "unknown"}`)} />
                  <MiniList label="Recent executions" items={data.historyItems.map((item) => `${item.executionId} · ${item.userStatus ?? item.status ?? "unknown"}`)} />
                </div>
              </DataPanel>
            </div>
          </>
        )}
      </StateBlock>
    </section>
  );
}

function FundingView({
  account,
  funding,
  notifications,
  onRefresh,
  onReadNotification,
}: {
  account: AsyncState<{ wallets: UserWallet[]; venueAccounts: UserVenueAccount[] }>;
  funding: AsyncState<{ balances: VenueBalance[]; activations: VenueActivation[]; capabilities: VenueCapability[]; history: FundingHistoryRow[] }>;
  notifications: AsyncState<UserNotification[]>;
  onRefresh: () => void;
  onReadNotification: (notificationId: string) => void;
}) {
  return (
    <section className="space-y-5">
      <SectionHeader title="Funding" subtitle="Venue-ready balances, activation blockers, safe capabilities, and durable notifications." onRefresh={onRefresh} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <StateBlock state={funding} empty="No funding rows returned yet.">
          {(data) => (
            <div className="space-y-5">
              <DataPanel title="Venue-ready balances">
                {data.balances.length === 0 ? <EmptyState title="No venue-ready balances" body="Funding becomes tradeable only when backend readiness returns a ready venue balance." /> : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.balances.map((balance) => (
                      <div key={`${balance.venue}-${balance.asset ?? balance.token ?? ""}`} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <VenueChip venue={balance.venue} />
                        <div className="mt-3 font-mono text-lg font-black">{balance.readyAmount ?? balance.availableAmount ?? "0"}</div>
                        <p className="text-xs text-zinc-500">{balance.asset ?? balance.token ?? "asset"} · updated {balance.updatedAt ? formatTime(balance.updatedAt) : "unknown"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </DataPanel>
              <DataPanel title="Activation and capability state">
                <MiniList label="Activations" items={data.activations.map((item) => `${prettyVenue(item.venue)} · ${item.status ?? "unknown"}${item.blockers?.length ? ` · ${item.blockers.join(", ")}` : ""}`)} />
                <MiniList label="Capabilities" items={data.capabilities.map((item) => `${prettyVenue(String(item.venue ?? "venue"))} · ${String(item.status ?? item.supported ?? "configured")}`)} />
                <MiniList label="Recent funding history" items={data.history.map((row) => `${row.id ?? "intent"} · ${row.status ?? "unknown"} · ${row.amount ?? ""} ${row.asset ?? ""}`)} />
              </DataPanel>
            </div>
          )}
        </StateBlock>
        <aside className="space-y-5">
          <StateBlock state={account} empty="No account metadata returned.">
            {(data) => (
              <DataPanel title="Account readiness">
                <MiniList label="Wallets" items={data.wallets.map((wallet) => `${wallet.chain} · ${short(wallet.address)} · ${wallet.status}`)} />
                <MiniList label="Venue accounts" items={data.venueAccounts.map((accountRow) => `${prettyVenue(accountRow.venue)} · ${accountRow.status}${accountRow.readinessBlockers.length ? ` · ${accountRow.readinessBlockers.join(", ")}` : ""}`)} />
              </DataPanel>
            )}
          </StateBlock>
          <DataPanel title="Notifications">
            {notifications.loading && <p className="text-sm text-zinc-500">Loading notifications...</p>}
            {notifications.error && <InlineError message={notifications.error} />}
            {notifications.data?.length === 0 && <EmptyState title="No notifications" body="Execution and funding notices appear here and remain available through the HTTP inbox." />}
            <div className="space-y-2">
              {notifications.data?.slice(0, 8).map((item) => (
                <button
                  key={item.notificationId}
                  type="button"
                  onClick={() => onReadNotification(item.notificationId)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left transition hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-zinc-100">{item.title}</span>
                    {item.readAt === null && <span className="h-2 w-2 rounded-full bg-red-500" />}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{item.body}</p>
                </button>
              ))}
            </div>
          </DataPanel>
        </aside>
      </div>
    </section>
  );
}

function StateBlock<T>({ state, empty, children }: { state: AsyncState<T>; empty: string; children: (data: T) => React.ReactNode }) {
  if (state.loading && !state.data) {
    return <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">Loading backend data...</div>;
  }
  if (state.error) {
    return <InlineError message={state.error} />;
  }
  if (!state.data || (Array.isArray(state.data) && state.data.length === 0)) {
    return <EmptyState title="Nothing to show" body={empty} />;
  }
  return <>{children(state.data)}</>;
}

function SectionHeader({ title, subtitle, onRefresh }: { title: string; subtitle: string; onRefresh: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <SectionTitle title={title} subtitle={subtitle} />
      <button type="button" onClick={onRefresh} className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-xl font-black text-white">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="text-sm font-bold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NavButton({ label, active, icon, onClick }: { label: string; active: boolean; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${active ? "bg-[#ccff00] text-black" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"}`}
    >
      {icon}
    </button>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${active ? "border-[#ccff00]/60 bg-[#ccff00]/10 text-[#ccff00]" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"}`}
    >
      {children}
    </button>
  );
}

function ActionButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ccff00] px-4 text-sm font-black text-black transition hover:bg-[#b7e600] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
    >
      {children}
    </button>
  );
}

function MarketMedia({ item, category, title, className }: { item: { imageUrl?: string | null; iconUrl?: string | null }; category: string; title: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const rawSrc = item.imageUrl ?? item.iconUrl;
  useEffect(() => setFailed(false), [rawSrc]);
  const src = !failed ? rawSrc : null;
  const topicLogoId = resolveTopicAssetLogoId(title);
  if (src) {
    return (
      <img
        src={src}
        alt={`${title} market`}
        className={`${className} shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 object-cover`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  if (topicLogoId) {
    return <CryptoLogo id={topicLogoId} label={title} className={`${className} shrink-0 rounded-lg`} />;
  }
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-xl`} aria-label={`${title} market`}>
      {categoryFallback[category.toUpperCase()] ?? "◇"}
    </span>
  );
}

function VenueChip({ venue }: { venue: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-semibold text-zinc-300">
      <VenueLogo id={venue} label={prettyVenue(venue)} className="h-3.5 w-3.5 rounded-full" />
      {prettyVenue(venue)}
    </span>
  );
}

function StatusPill({ tone, children }: { tone: "success" | "warning"; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
      {children}
    </span>
  );
}

function WsBadge({ state }: { state: ExecutionWsState }) {
  const live = state === "open";
  return (
    <span className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold md:inline-flex ${live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-500"}`}>
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-zinc-600"}`} />
      Realtime {state}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-3 truncate font-mono text-xl font-black text-white">{value}</p>
    </div>
  );
}

function MiniList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">None returned.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.slice(0, 8).map((item) => (
            <li key={item} className="truncate rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center">
      <Clock className="mx-auto h-5 w-5 text-zinc-600" aria-hidden="true" />
      <h2 className="mt-3 text-sm font-bold text-zinc-300">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function InlineNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
      <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function InlineSuccess({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function normalizeCapabilities(value: VenueCapability[] | Record<string, VenueCapability>): VenueCapability[] {
  if (Array.isArray(value)) return value;
  return Object.entries(value).map(([venue, capability]) => ({ venue, ...capability }));
}

function prettyVenue(value: string): string {
  return value
    .replace(/_/g, ".")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Polymarket", "Polymarket")
    .replace("Predict.Fun", "Predict.fun");
}

function short(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

function formatMoneyString(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(numeric);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Backend request failed.";
}
