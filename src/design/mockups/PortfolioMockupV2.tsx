import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { 
  Wallet, Gift, Key, ArrowUpRight, ArrowDownRight,
  Download, ArrowDownToLine, ArrowUpFromLine, Sparkles,
  BarChart2, Calendar, ChevronRight, Search, Share, ShieldCheck, X, Copy, Check
} from 'lucide-react';
import { VenueLogo } from '@/components/icons/asset-logo';
import type { AuthSession } from '@/features/auth/types';
import { listVenueAccounts, type UserVenueAccount } from '@/features/wallets/api/wallet-api';
import {
  getExecutionHistory,
  getOpenOrders,
  getPortfolioSummary,
  getPortfolioTimeSeries,
  type ExecutionStatus,
  type PortfolioSummary,
  type PortfolioTimeSeriesResponse,
} from '@/features/trading/api/execution-api';
import { getVenueActivations, getVenueBalances, type VenueActivation, type VenueBalance } from '@/features/funding/api/funding-api';
import { openExecutionSocket } from '@/lib/ws/execution-ws-client';
import { FundingDeposit } from './FundingDeposit';

type PerformanceRange = '1D' | '7D' | '30D' | '90D' | 'ALL';

type PortfolioPerformancePoint = {
  label: string;
  date: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalValue: number;
  volume: number;
};

const portfolioPerformanceSeries: PortfolioPerformancePoint[] = [
  { label: 'Jan', date: 'Jan 31', realizedPnl: 25400, unrealizedPnl: 820, totalValue: 10420, volume: 42000 },
  { label: 'Feb', date: 'Feb 28', realizedPnl: 163096.35, unrealizedPnl: 1210, totalValue: 11880, volume: 224000 },
  { label: 'Mar', date: 'Mar 31', realizedPnl: 271800, unrealizedPnl: -380, totalValue: 11360, volume: 489500 },
  { label: 'Apr', date: 'Apr 30', realizedPnl: 458400, unrealizedPnl: 240, totalValue: 13240, volume: 995400 },
  { label: 'May', date: 'May 31', realizedPnl: 612900, unrealizedPnl: 1120, totalValue: 14180, volume: 1684000 },
  { label: 'Jun', date: 'Jun 30', realizedPnl: 721250, unrealizedPnl: 940, totalValue: 13880, volume: 2210000 },
  { label: 'Jul', date: 'Jul 31', realizedPnl: 804600, unrealizedPnl: 420, totalValue: 14610, volume: 2820000 },
  { label: 'Aug', date: 'Aug 31', realizedPnl: 881191.68, unrealizedPnl: 579.8, totalValue: 14758.4, volume: 3456132.48 },
];

const formatCurrency = (value: number, compact = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(value);

const formatSignedCurrency = (value: number) => `${value >= 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;

const trackedVenues = [
  { id: 'polymarket', backend: 'POLYMARKET', label: 'Polymarket' },
  { id: 'limitless', backend: 'LIMITLESS', label: 'Limitless' },
  { id: 'predict', backend: 'PREDICT_FUN', label: 'Predict.fun' },
  { id: 'opinion', backend: 'OPINION', label: 'Opinion' },
  { id: 'myriad', backend: 'MYRIAD', label: 'Myriad' },
];

const getRangeSeries = (range: PerformanceRange) => {
  if (range === '1D') return portfolioPerformanceSeries.slice(-2);
  if (range === '7D') return portfolioPerformanceSeries.slice(-4);
  if (range === '30D') return portfolioPerformanceSeries.slice(-6);
  return portfolioPerformanceSeries;
};

const parseMoney = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMaybeCurrency = (value: string | number | null | undefined, fallback = 'Unavailable') => {
  const parsed = parseMoney(value);
  return parsed === null ? fallback : formatCurrency(parsed);
};

const formatMaybeSignedCurrency = (value: string | number | null | undefined) => {
  const parsed = parseMoney(value);
  return parsed === null ? 'Unavailable' : formatSignedCurrency(parsed);
};

const venueKey = (venue: string) => venue.toUpperCase().replace(/[\s.-]+/g, '_');

const venueLabel = (venue: string) =>
  trackedVenues.find((item) => item.backend === venueKey(venue) || item.id === venue.toLowerCase())?.label ??
  venue.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const venueLogoId = (venue: string) =>
  trackedVenues.find((item) => item.backend === venueKey(venue) || item.id === venue.toLowerCase())?.id ?? venue.toLowerCase();

const userSafeError = (error: unknown) => error instanceof Error ? error.message : 'Portfolio data is temporarily unavailable.';

const shortAddress = (value: string) => value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;

const pointFromSnapshot = (point: PortfolioTimeSeriesResponse['points'][number], index: number): PortfolioPerformancePoint => {
  const totalValue = parseMoney(point.totalMarkValue) ?? parseMoney(point.totalCostBasis) ?? 0;
  const unrealizedPnl = parseMoney(point.totalUnrealizedPnl) ?? 0;
  return {
    label: new Date(point.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    date: point.timestamp,
    realizedPnl: 0,
    unrealizedPnl,
    totalValue,
    volume: point.positionCount,
  };
};

type VenueCashRow = {
  id: string;
  backend: string;
  label: string;
  balance: number;
  status: string;
  activation: 'ready' | 'required' | 'blocked';
  blockers: string[];
  walletAddress?: string;
  venueAccountStatus?: string;
};

type PortfolioDataState = {
  summary: PortfolioSummary | null;
  timeseries: PortfolioTimeSeriesResponse | null;
  balances: VenueBalance[];
  activations: VenueActivation[];
  venueAccounts: UserVenueAccount[];
  openOrders: ExecutionStatus[];
  history: ExecutionStatus[];
};

function PerformanceTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as PortfolioPerformancePoint | undefined;
  if (!point) return null;

  return (
    <div className="w-[178px] rounded-lg border border-zinc-700/80 bg-[#18181b] p-3 shadow-2xl">
      <div className="mb-2 text-xs font-semibold text-zinc-200">{label}</div>
      <div className="space-y-1.5 rounded-md bg-black/40 px-2 py-1.5 text-[11px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Realized</span>
          <span className="font-mono font-semibold text-[#22c55e]">{formatSignedCurrency(point.realizedPnl)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Unrealized</span>
          <span className={`font-mono font-semibold ${point.unrealizedPnl >= 0 ? 'text-[#22c55e]' : 'text-red-400'}`}>
            {formatSignedCurrency(point.unrealizedPnl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Value</span>
          <span className="font-mono font-semibold text-zinc-200">{formatCurrency(point.totalValue)}</span>
        </div>
      </div>
    </div>
  );
}

export const PortfolioMockupV2: React.FC<{ session?: AuthSession | null }> = ({ session }) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history' | 'tips'>('positions');
  const [fundingModal, setFundingModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [activationVenue, setActivationVenue] = useState<VenueCashRow | null>(null);
  const [performanceRange, setPerformanceRange] = useState<PerformanceRange>('7D');
  const [data, setData] = useState<PortfolioDataState>({
    summary: null,
    timeseries: null,
    balances: [],
    activations: [],
    venueAccounts: [],
    openOrders: [],
    history: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const token = session?.userJwt ?? null;

  const loadPortfolio = useCallback(async () => {
    if (!token) {
      setData({ summary: null, timeseries: null, balances: [], activations: [], venueAccounts: [], openOrders: [], history: [] });
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [summary, timeseries, balanceResponse, activationResponse, venueAccounts, openOrders, history] = await Promise.all([
        getPortfolioSummary(token),
        getPortfolioTimeSeries(token, { range: performanceRange }),
        getVenueBalances(token),
        getVenueActivations(token),
        listVenueAccounts(token),
        getOpenOrders(token, { limit: 50 }),
        getExecutionHistory(token, { limit: 50 }),
      ]);

      setData({
        summary,
        timeseries,
        balances: balanceResponse.balances ?? balanceResponse.venues ?? [],
        activations: activationResponse.activations ?? activationResponse.venues ?? [],
        venueAccounts: venueAccounts.accounts ?? [],
        openOrders: openOrders.items,
        history: history.items,
      });
    } catch (loadError) {
      setError(userSafeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [performanceRange, token]);

  useEffect(() => {
    void loadPortfolio();
    const interval = window.setInterval(() => {
      void loadPortfolio();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadPortfolio]);

  useEffect(() => {
    if (!session?.userId) return;
    const client = openExecutionSocket({
      onEvent: (event) => {
        if (
          event.type === 'EXECUTION_PORTFOLIO_UPDATE' ||
          event.type === 'EXECUTION_MARK_UPDATE' ||
          event.type === 'EXECUTION_POSITION_UPDATE' ||
          event.type === 'EXECUTION_STATUS_UPDATE' ||
          event.type === 'EXECUTION_BALANCE_UPDATE'
        ) {
          void loadPortfolio();
        }
      },
      onStateChange: () => undefined,
    });
    client.socket.addEventListener('open', () => {
      client.subscribe(`execution:portfolio:${session.userId}`);
      client.subscribe(`execution:user:${session.userId}`);
    });
    return () => client.socket.close();
  }, [loadPortfolio, session?.userId]);

  const venueRows = useMemo<VenueCashRow[]>(() => {
    return trackedVenues.map((venue) => {
      const balances = data.balances.filter((balance) => venueKey(balance.venue) === venue.backend);
      const balance = balances.reduce((sum, item) => sum + (parseMoney(item.readyAmount ?? item.availableAmount) ?? 0), 0);
      const activation = data.activations.find((item) => venueKey(item.venue) === venue.backend);
      const account = data.venueAccounts.find((item) => venueKey(item.venue) === venue.backend);
      const activationRequired = activation?.required === true || ['REQUIRED', 'ACTION_REQUIRED', 'PENDING'].includes(String(activation?.status ?? '').toUpperCase());
      const blockers = activation?.blockers ?? [];
      return {
        ...venue,
        balance,
        status: balance > 0 ? 'Ready to trade' : activationRequired ? 'Activation required' : 'No venue-ready USDC',
        activation: blockers.length > 0 ? 'blocked' : activationRequired ? 'required' : 'ready',
        blockers,
        walletAddress: account?.walletAddress,
        venueAccountStatus: account?.status,
      };
    });
  }, [data.activations, data.balances, data.venueAccounts]);

  const positions = data.summary?.positions ?? [];
  const totalCash = venueRows.reduce((sum, venue) => sum + venue.balance, 0);
  const positionValue = parseMoney(data.summary?.totalMarkValue) ?? parseMoney(data.summary?.totalCostBasis) ?? 0;
  const totalValue = totalCash + positionValue;
  const unrealizedPnl = parseMoney(data.summary?.totalUnrealizedPnl);
  const totalRoi = data.summary && parseMoney(data.summary.totalCostBasis)
    ? ((unrealizedPnl ?? 0) / (parseMoney(data.summary.totalCostBasis) || 1)) * 100
    : null;
  const performanceSeries = useMemo(() => {
    if (data.timeseries?.points.length) return data.timeseries.points.map(pointFromSnapshot);
    return [];
  }, [data.timeseries]);
  const latestPerformance = performanceSeries[performanceSeries.length - 1] ?? null;
  const activationRequiredVenues = venueRows.filter((venue) => venue.activation !== 'ready');
  const copyVenueAddress = useCallback((address: string) => {
    void navigator.clipboard?.writeText(address).then(() => {
      setCopiedAddress(address);
      window.setTimeout(() => {
        setCopiedAddress((current) => current === address ? null : current);
      }, 1_500);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 font-sans antialiased space-y-6 animate-fade-in relative">
      
      {/* Top Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        
        {/* Left Panel - Portfolio */}
        <div className="rounded-xl border border-zinc-800 bg-[#121214] overflow-hidden flex flex-col">
          <div className="p-5 space-y-5">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-semibold text-zinc-100">
                <Wallet className="w-4 h-4 text-zinc-400" />
                Portfolio
              </div>
              <button
                type="button"
                onClick={() => void loadPortfolio()}
                disabled={loading || !token}
                className="min-h-8 rounded-lg border border-zinc-800 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
              >
                {loading ? 'Syncing' : 'Refresh'}
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                {error}
              </div>
            )}

            {/* Total Value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800/80 bg-black/20 p-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Total Value</div>
                <div className="text-[29px] leading-none font-bold tracking-tight text-white">{formatCurrency(totalValue)}</div>
              </div>
              <div className="rounded-xl border border-zinc-800/80 bg-black/20 p-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Positions</div>
                <div className="text-[29px] leading-none font-bold tracking-tight text-white">{formatMaybeCurrency(data.summary?.totalMarkValue, formatCurrency(0))}</div>
              </div>
            </div>

            {/* Venue Cash Breakdown */}
            <div className="rounded-xl border border-zinc-800/80 bg-[#0d0d0f] p-3.5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Venue Cash Balances</div>
                  <div className="mt-1 text-lg font-bold text-white">{formatCurrency(totalCash)}</div>
                </div>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-300">
                  {venueRows.filter((venue) => venue.balance > 0).length} ready
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {venueRows.map((venue) => (
                  <div
                    key={venue.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-[#151518] px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <VenueLogo id={venue.id} label={venue.label} className="h-6 w-6 rounded-md" />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="truncate text-sm font-semibold text-zinc-200">{venue.label}</div>
                          {venue.walletAddress && (
                            <button
                              type="button"
                              onClick={() => copyVenueAddress(venue.walletAddress as string)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                              aria-label={`Copy ${venue.label} venue address`}
                              title={`Copy ${venue.label} address ${shortAddress(venue.walletAddress)}`}
                            >
                              {copiedAddress === venue.walletAddress ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        <div className={`text-[10px] font-semibold ${venue.balance > 0 ? 'text-emerald-400' : venue.activation === 'blocked' ? 'text-amber-300' : 'text-zinc-500'}`}>
                          {venue.status}
                        </div>
                        {venue.walletAddress && (
                          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{shortAddress(venue.walletAddress)}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right font-mono text-sm font-bold text-white">
                      {formatCurrency(venue.balance)}
                      {venue.activation !== 'ready' && (
                        <button
                          type="button"
                          onClick={() => setActivationVenue(venue)}
                          className="mt-1.5 flex min-h-8 items-center justify-center rounded-md border border-[#ccff00]/25 bg-[#ccff00]/10 px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#ccff00] transition-colors hover:bg-[#ccff00]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                        >
                          Details
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {activationRequiredVenues.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActivationVenue(activationRequiredVenues[0])}
                  className="mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#ccff00]/25 bg-[#ccff00]/10 px-3 text-xs font-bold text-[#ccff00] transition-colors hover:bg-[#ccff00]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Review pending venues
                </button>
              )}
            </div>
          </div>

          <div className="p-5 pt-0 mt-auto">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFundingModal('deposit')}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-lotus-500/10 hover:bg-lotus-500/20 border border-lotus-500/30 text-lotus-400 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500"
              >
                <ArrowDownToLine className="w-4 h-4" /> Deposit
              </button>
              <button
                type="button"
                onClick={() => setFundingModal('withdraw')}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-zinc-300 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500"
              >
                <ArrowUpFromLine className="w-4 h-4" /> Withdraw
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Performance */}
        <div className="rounded-xl border border-zinc-800 bg-[#121214] p-5 flex flex-col relative overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div className="flex items-center gap-2.5 font-semibold text-zinc-100">
              <BarChart2 className="w-4 h-4 text-zinc-400" />
              Performance
            </div>
            <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50">
              {(['1D', '7D', '30D', '90D', 'ALL'] as PerformanceRange[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPerformanceRange(v)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${performanceRange === v ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-6 relative z-10">
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Cost Basis</div>
              <div className="text-lg font-bold text-white">{formatMaybeCurrency(data.summary?.totalCostBasis, '$0.00')}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Unrealized PNL</div>
              <div className={`text-lg font-bold ${(unrealizedPnl ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-red-400'}`}>
                {formatMaybeSignedCurrency(data.summary?.totalUnrealizedPnl)}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Total ROI</div>
              <div className={`text-lg font-bold ${(totalRoi ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-red-400'}`}>
                {totalRoi === null ? 'Unavailable' : `${totalRoi >= 0 ? '+' : ''}${totalRoi.toFixed(2)}%`}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Marked Positions</div>
              <div className="text-lg font-bold text-white">{data.summary ? `${data.summary.markedPositionCount}/${data.summary.positionCount}` : '0/0'}</div>
            </div>
          </div>
          
          {/* Calendar Row */}
          <div className="flex items-center justify-between mb-4 relative z-10">
             <div className="flex items-center gap-3">
               <Calendar className="w-5 h-5 text-zinc-500" />
               <div>
                 <div className="text-sm font-bold text-white">MTM Snapshot</div>
                 <div className="text-[11px] text-zinc-500">
                   {data.timeseries?.historyAvailable ? 'Backend portfolio time-series' : 'Current backend snapshot only'}
                 </div>
               </div>
             </div>
             <button type="button" disabled className="w-6 h-6 rounded-md bg-zinc-800/80 flex items-center justify-center text-zinc-500 cursor-not-allowed">
               <ChevronRight className="w-4 h-4" />
             </button>
          </div>

          <div className="h-px bg-zinc-800/50 w-full mb-6 relative z-10" />

          {/* Chart Area */}
          <div className="relative min-h-[220px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceSeries} margin={{ top: 10, right: 8, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="portfolioPnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="4 4" opacity={0.6} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 11, fontWeight: 600 }}
                  dy={8}
                />
                <YAxis
                  dataKey="totalValue"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'monospace' }}
                  tickFormatter={(value) => formatCurrency(Number(value), true)}
                  width={54}
                />
                <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ stroke: '#71717a', strokeDasharray: '4 4' }}
                  content={<PerformanceTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="totalValue"
                  stroke="#22c55e"
                  strokeWidth={3}
                  fill="url(#portfolioPnlGradient)"
                  activeDot={{ r: 5, fill: '#22c55e', stroke: '#18181b', strokeWidth: 2 }}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            {!data.timeseries?.historyAvailable && (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                Historical PnL is not drawn until backend persisted snapshots are available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel - Positions */}
      <div className="bg-[#121214] border border-zinc-800 rounded-xl overflow-hidden p-1">
        
        {/* Tabs Bar */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-1">
            <button 
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'positions' ? 'bg-lotus-500 text-black' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              onClick={() => setActiveTab('positions')}
            >
              Current Positions
            </button>
            <button 
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'orders' ? 'bg-lotus-500 text-black' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              onClick={() => setActiveTab('orders')}
            >
              Open Orders
            </button>
            <button 
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'history' ? 'bg-lotus-500 text-black' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              onClick={() => setActiveTab('history')}
            >
              Trade History
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search" 
              className="bg-[#18181b] border border-zinc-800 text-zinc-200 text-sm rounded-lg pl-9 pr-4 py-2 w-[240px] focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-[13px] font-semibold">
                <th className="px-6 py-4 font-semibold w-[40%]">{activeTab === 'positions' ? 'Market' : 'Execution'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[10%]">{activeTab === 'positions' ? 'Avg' : 'Status'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[10%]">{activeTab === 'positions' ? 'Current' : 'Settlement'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[12%]">{activeTab === 'positions' ? 'Size' : 'Route'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[12%]">{activeTab === 'positions' ? 'Sellable' : 'Updated'}</th>
                <th className="px-6 py-4 font-semibold text-right w-[16%]">{activeTab === 'positions' ? 'Value' : 'Receipt'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-[15px]">
              {activeTab === 'positions' && positions.map((position) => (
                <tr key={position.positionId} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <VenueLogo id={venueLogoId(position.venue)} label={venueLabel(position.venue)} className="h-11 w-11 rounded-lg border border-zinc-700/50" />
                      <div className="min-w-0">
                        <div className="truncate font-bold text-zinc-200 mb-1 leading-tight text-[15px]">{position.marketId}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-zinc-400 font-medium">{venueLabel(position.venue)}</span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#22c55e]/10 text-[#22c55e]">{position.outcomeId}</span>
                          {position.markFreshness === 'unavailable' && <span className="text-[11px] font-semibold text-amber-300">Mark unavailable</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{position.averageEntryPrice ? `${(position.averageEntryPrice * 100).toFixed(1)}c` : '-'}</td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{position.markPrice === null ? '-' : `${(position.markPrice * 100).toFixed(1)}c`}</td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{position.verifiedSize}</td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{position.sellableSize}</td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex flex-col items-end leading-tight gap-0.5">
                      <div className="font-bold text-white text-[15px] font-mono">{formatMaybeCurrency(position.markValue, 'No mark')}</div>
                      <div className={`text-[12px] font-bold font-mono ${(parseMoney(position.unrealizedPnl) ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-red-400'}`}>
                        {position.markFreshness === 'live' ? formatMaybeSignedCurrency(position.unrealizedPnl) : position.markBlocker ?? 'Unavailable'}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {activeTab !== 'positions' && (activeTab === 'orders' ? data.openOrders : data.history).map((execution) => (
                <tr key={execution.executionId} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-6 py-5">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-bold text-zinc-200">{execution.executionId}</div>
                      <div className="mt-1 text-[12px] font-medium text-zinc-500">{execution.route?.marketId ?? 'Backend execution'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{execution.userStatus ?? execution.status ?? 'Unknown'}</td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{execution.settlementStatus ?? 'Pending'}</td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{execution.route?.venuePath?.map(venueLabel).join(' / ') || '-'}</td>
                  <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">
                    {execution.updatedAt || execution.submittedAt ? new Date(execution.updatedAt ?? execution.submittedAt ?? '').toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button type="button" disabled className="min-h-8 rounded-lg border border-zinc-800 bg-[#18181b] px-3 text-xs font-semibold text-zinc-500 cursor-not-allowed">
                      Receipt
                    </button>
                  </td>
                </tr>
              ))}
              {activeTab === 'positions' && positions.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-zinc-500">No verified positions yet. Positions appear only after backend fill evidence is verified.</td></tr>
              )}
              {activeTab === 'orders' && data.openOrders.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-zinc-500">No open orders. Submitted and partial backend executions will appear here.</td></tr>
              )}
              {activeTab === 'history' && data.history.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-zinc-500">No trade history yet. Backend-confirmed executions will appear here.</td></tr>
              )}
            </tbody>
          </table>
          {false && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-[13px] font-semibold">
                <th className="px-6 py-4 font-semibold w-[40%]">Market</th>
                <th className="px-6 py-4 font-semibold text-center w-[10%]">Avg</th>
                <th className="px-6 py-4 font-semibold text-center w-[10%]">Current</th>
                <th className="px-6 py-4 font-semibold text-center w-[12%]">Bet</th>
                <th className="px-6 py-4 font-semibold text-center w-[12%]">To Win</th>
                <th className="px-6 py-4 font-semibold text-right w-[16%]">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-[15px]">
              <tr className="hover:bg-zinc-900/30 transition-colors">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center shrink-0">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    </div>
                    <div>
                      <div className="font-bold text-zinc-200 mb-1 leading-tight text-[15px]">Will Bitcoin reach $200k in 2026?</div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-lotus-500 flex items-center justify-center shrink-0">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-black"><path d="M5 12l5 5L20 7"/></svg>
                        </div>
                        <span className="text-[13px] text-zinc-400 font-medium">850 shares</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#22c55e]/10 text-[#22c55e]">Yes</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">58¢</td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">66¢</td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">$493.00</td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">$850.00</td>
                <td className="px-6 py-5 text-right">
                  <div className="flex gap-4 items-center justify-end">
                    <div className="flex flex-col items-end leading-tight gap-0.5">
                      <div className="font-bold text-white text-[15px] font-mono">$561.00</div>
                      <div className="text-[12px] font-bold text-[#22c55e] font-mono">+$68.00 (13.79%)</div>
                    </div>
                    <div className="flex gap-1.5 ml-2">
                      <button className="px-4 py-1.5 bg-lotus-500/10 hover:bg-lotus-500/20 border border-lotus-500/30 rounded-lg text-lotus-400 font-semibold text-sm transition-colors">
                        Sell
                      </button>
                      <button className="w-8 h-8 flex items-center justify-center bg-[#18181b] hover:bg-zinc-800 border border-zinc-700/80 rounded-lg text-zinc-400 transition-colors">
                        <Share className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
              {/* Additional Mock Row to fill out the table a bit */}
              <tr className="hover:bg-zinc-900/30 transition-colors">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center shrink-0">
                       <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                    </div>
                    <div>
                      <div className="font-bold text-zinc-200 mb-1 leading-tight text-[15px]">Ethereum ETFs Approved by Q2?</div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </div>
                        <span className="text-[13px] text-zinc-400 font-medium">1,200 shares</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-500">No</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">42¢</td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">38¢</td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">$504.00</td>
                <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">$1200.00</td>
                <td className="px-6 py-5 text-right">
                  <div className="flex gap-4 items-center justify-end">
                    <div className="flex flex-col items-end leading-tight gap-0.5">
                      <div className="font-bold text-white text-[15px] font-mono">$456.00</div>
                      <div className="text-[12px] font-bold text-red-400 font-mono">-$48.00 (-9.52%)</div>
                    </div>
                    <div className="flex gap-1.5 ml-2">
                      <button className="px-4 py-1.5 bg-lotus-500/10 hover:bg-lotus-500/20 border border-lotus-500/30 rounded-lg text-lotus-400 font-semibold text-sm transition-colors">
                        Sell
                      </button>
                      <button className="w-8 h-8 flex items-center justify-center bg-[#18181b] hover:bg-zinc-800 border border-zinc-700/80 rounded-lg text-zinc-400 transition-colors">
                        <Share className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          )}
        </div>
        {!activeTab && (
           <div className="p-8 text-center text-zinc-500">No data available</div>
        )}
      </div>

      {fundingModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={fundingModal === 'deposit' ? 'Deposit funds' : 'Withdraw funds'}
          className="fixed left-0 top-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-black/60 px-4 py-6 backdrop-blur-md"
        >
          <button
            type="button"
            aria-label="Close funding modal"
            onClick={() => setFundingModal(null)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative z-10 w-full max-w-[400px]">
            <FundingDeposit initialMode={fundingModal} modal onClose={() => setFundingModal(null)} />
          </div>
        </div>,
        document.body
      )}

      {activationVenue && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${activationVenue.label} activation`}
          className="fixed inset-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-black/45 px-4 py-6 backdrop-blur-[6px]"
        >
          <button
            type="button"
            aria-label="Close activation modal"
            onClick={() => setActivationVenue(null)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative z-10 w-full max-w-[360px] rounded-2xl border border-zinc-800 bg-[#18181b] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <VenueLogo id={activationVenue.id} label={activationVenue.label} className="h-9 w-9 rounded-lg" />
                <div>
                  <h2 className="text-base font-bold text-white">{activationVenue.label} readiness</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">{activationVenue.status}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close activation modal"
                onClick={() => setActivationVenue(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-black/25 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#ccff00]" />
                <p className="text-sm leading-relaxed text-zinc-300">
                  Lotus only treats funds as tradeable after backend readiness confirms this venue is ready. This panel shows backend activation evidence only; it does not bypass venue setup.
                </p>
              </div>
              {activationVenue.blockers.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-7 text-xs text-amber-200">
                  {activationVenue.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActivationVenue(null)}
                className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivationVenue(null);
                  setFundingModal('deposit');
                }}
                className="min-h-10 rounded-lg border border-[#ccff00]/40 bg-[#ccff00] text-sm font-black text-black transition-colors hover:bg-[#d7ff33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181b]"
              >
                Open funding
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
