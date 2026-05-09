import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Lock, ShieldAlert, ShieldCheck, Info,
  Clock, BarChart2, Layers, Share2, Bookmark, Search, Maximize2, Activity, Zap, Ghost,
  Home, Terminal, PieChart, Volleyball, Settings
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { VenueLogo } from '@/components/icons/asset-logo';
import { LotusLogo } from '@/components/icons/lotus-icons';
import type { AuthSession } from '@/features/auth/types';
import {
  getCanonicalResolutionRisk,
  getMarketOutcomes,
  getVenueMarketResolutionRisk,
  type MarketCatalogVenueMarket,
  type MarketOutcome,
  type ResolutionRiskAssessment,
  type ResolutionRiskProfile,
} from '@/features/markets/api/market-api';
import {
  getExecutionHistory,
  getLiveCandidates,
  getOpenOrders,
  getPositions,
  type ExecutionPosition,
  type ExecutionStatus,
  type OpenOrdersResponse,
  type TradeRouteCandidate,
} from '@/features/trading/api/execution-api';

export type TerminalMarketSelection = {
  id?: string;
  marketId?: string;
  eventId?: string;
  canonicalEventId?: string;
  title: string;
  category: string;
  icon: string;
  volume: string;
  venueCount: number;
  routeType: string;
  venues?: string[];
  venueMarkets?: MarketCatalogVenueMarket[];
  marketType?: 'binary' | 'multi';
  outcomes?: Array<{ id: string; name: string; prob: string }>;
  imageUrl?: string | null;
  iconUrl?: string | null;
};

const canonicalEventMarkets = [
  {
    name: 'Will the Cleveland Cavaliers win the Eastern Conference?',
    category: 'Sports',
    volume: '$35.6M',
    change: '+4.5c',
    yes: '26c',
    no: '74c',
    route: 'Pair route',
    icon: '🏆',
    marketType: 'binary' as const,
  },
  {
    name: 'Will the Boston Celtics win the Eastern Conference?',
    category: 'Sports',
    volume: '$12.4M',
    change: '+2.1c',
    yes: '12c',
    no: '88c',
    route: 'Tri route',
    icon: '🏀',
    marketType: 'binary' as const,
  },
  {
    name: 'Will the New York Knicks win the Eastern Conference?',
    category: 'Sports',
    volume: '$8.2M',
    change: '+1.2c',
    yes: '14c',
    no: '86c',
    route: 'Fallback ready',
    icon: '🗽',
    marketType: 'binary' as const,
  },
  {
    name: 'Who will win the 2026 FIFA World Cup?',
    category: 'Sports',
    volume: '$11.7M',
    change: '+1.2c',
    yes: '16c',
    no: '84c',
    route: 'Single venue',
    icon: '⚽',
    marketType: 'multi' as const,
  },
];

type TerminalBottomTab = 'Outcomes' | 'Positions' | 'Open Orders' | 'Trade History' | 'Rules & Risk';

type TerminalOutcomeRow = {
  id: string;
  name: string;
  vol: string;
  platforms: number;
  prob: string;
  yesPrice: string;
  noPrice: string;
  active: boolean;
  venues: string[];
  status: 'live' | 'unavailable' | 'pending' | 'auth_required';
  blocker: string | null;
};

type TerminalRiskState = {
  loading: boolean;
  error: string | null;
  assessments: ResolutionRiskAssessment[];
  profiles: ResolutionRiskProfile[];
};

type TerminalOpenOrder = OpenOrdersResponse['items'][number];

const isUuid = (value: string | null | undefined): value is string =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const normalizeVenueId = (venue: string): string => venue.toLowerCase().replace(/[\s._-]+/g, '_');

const formatVenueLabel = (venue: string): string =>
  venue.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatProbabilityPrice = (price: number | null | undefined): string => {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 'Quote';
  const cents = price <= 1 ? price * 100 : price;
  if (cents < 1) return '<1¢';
  return `${cents >= 10 ? cents.toFixed(0) : cents.toFixed(1)}¢`;
};

const formatProbabilityPercent = (price: number | null | undefined): string => {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 'Quote';
  const percent = price <= 1 ? price * 100 : price;
  if (percent < 1) return '<1%';
  return `${percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)}%`;
};

const parsePositiveNumber = (value: string | number | null | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatCompactMetric = (value: string | number | null | undefined): string | null => {
  const parsed = parsePositiveNumber(value);
  if (parsed === null) return null;
  if (parsed >= 1_000_000_000) return `${(parsed / 1_000_000_000).toFixed(parsed >= 10_000_000_000 ? 0 : 1)}B`;
  if (parsed >= 1_000_000) return `${(parsed / 1_000_000).toFixed(parsed >= 10_000_000 ? 0 : 1)}M`;
  if (parsed >= 1_000) return `${(parsed / 1_000).toFixed(parsed >= 10_000 ? 0 : 1)}K`;
  return parsed.toFixed(parsed >= 10 ? 0 : 2);
};

const formatMoneyMetric = (value: string | number | null | undefined): string | null => {
  const metric = formatCompactMetric(value);
  return metric ? `$${metric}` : null;
};

const bestCandidate = (candidates: TradeRouteCandidate[]): TradeRouteCandidate | null =>
  [...candidates].filter((candidate) => Number.isFinite(candidate.price)).sort((left, right) => left.price - right.price)[0] ?? null;

const averageCandidatePrice = (candidates: TradeRouteCandidate[]): number | null => {
  const valid = candidates.filter((candidate) => Number.isFinite(candidate.price) && candidate.price > 0);
  if (valid.length === 0) return null;
  const weightedSize = valid.reduce((sum, candidate) => sum + (parsePositiveNumber(candidate.availableSize) ?? 0), 0);
  if (weightedSize > 0) {
    return valid.reduce((sum, candidate) => sum + (parsePositiveNumber(candidate.availableSize) ?? 0) * candidate.price, 0) / weightedSize;
  }
  return valid.reduce((sum, candidate) => sum + candidate.price, 0) / valid.length;
};

const executionMarketId = (market: TerminalMarketSelection): string | null => market.marketId ?? market.id ?? null;

const matchesTerminalMarket = (status: ExecutionStatus, marketId: string | null): boolean => {
  if (!marketId) return true;
  const routeMarketId = status.route?.marketId;
  if (!routeMarketId) return false;
  return routeMarketId === marketId || routeMarketId?.startsWith(`${marketId}:`) === true || marketId.startsWith(`${routeMarketId}:`);
};

const matchesPositionMarket = (position: ExecutionPosition, marketId: string | null, outcomeId: string | null): boolean => {
  const marketMatches = !marketId || position.marketId === marketId || position.marketId.startsWith(`${marketId}:`) || marketId.startsWith(`${position.marketId}:`);
  const outcomeMatches = !outcomeId || position.outcomeId === outcomeId;
  return marketMatches && outcomeMatches;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const riskTone = (assessment: ResolutionRiskAssessment | null) => {
  if (!assessment) return { icon: Info, color: 'text-zinc-400', bg: 'bg-zinc-500/10', title: 'Backend risk pending' };
  if (assessment.equivalenceClass === 'SAFE_EQUIVALENT') return { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', title: 'Canonical compatibility' };
  if (assessment.equivalenceClass === 'CAUTION') return { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', title: 'Pool with caution' };
  return { icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10', title: 'Execution isolation required' };
};

const initialOutcomeRows = (market: TerminalMarketSelection): TerminalOutcomeRow[] => {
  const rows = market.outcomes ?? [];
  return rows.map((outcome, index) => ({
    id: outcome.id,
    name: outcome.name,
    vol: market.volume,
    platforms: market.venueCount,
    prob: outcome.prob,
    yesPrice: outcome.prob,
    noPrice: 'Quote',
    active: index === 0,
    venues: market.venues ?? [],
    status: 'pending',
    blocker: null,
  }));
};

const emptyCopy = (title: string, body: string) => (
  <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/30 px-6 text-center">
    <div className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">{title}</div>
    <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-500">{body}</p>
  </div>
);

const CanonicalChart = ({ marketType }: { marketType: 'binary' | 'multi' }) => {
  const [activeTab, setActiveTab] = useState('1W');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  type ChartPoint = {
    date: string;
    canonical?: number;
    poly?: number;
    limitless?: number;
    predict?: number;
    mbappe?: number;
    other?: number;
    kane?: number;
    martinelli?: number;
  };

  const dataMulti: ChartPoint[] = [
    { date: 'May 01', canonical: 26.2, poly: 26.0, limitless: 26.5, predict: 26.9 },
    { date: 'May 02', canonical: 26.2, poly: 26.0, limitless: 26.5, predict: 26.9 },
    { date: 'May 03', canonical: 26.2, poly: 26.0, limitless: 26.5, predict: 26.9 },
    { date: 'May 03 12:00', canonical: 58.5, poly: 58.0, limitless: 59.0, predict: 58.3 }, // Jump
    { date: 'May 04', canonical: 58.5, poly: 58.0, limitless: 59.0, predict: 58.3 },
    { date: 'May 05', canonical: 59.0, poly: 58.5, limitless: 59.5, predict: 58.8 },
    { date: 'May 06', canonical: 59.0, poly: 58.5, limitless: 59.5, predict: 58.8 },
    { date: 'May 06 12:00', canonical: 99.4, poly: 99.0, limitless: 99.5, predict: 99.2 }, // Jump to 100
    { date: 'May 07', canonical: 99.4, poly: 99.0, limitless: 99.5, predict: 99.2 },
  ];

  const dataBinary: ChartPoint[] = [
    { date: 'May 01', mbappe: 1.0, other: 1.6, kane: 49.0, martinelli: 0.8 },
    { date: 'May 02', mbappe: 1.0, other: 1.6, kane: 49.0, martinelli: 0.8 },
    { date: 'May 03', mbappe: 1.0, other: 1.6, kane: 49.0, martinelli: 0.8 },
    { date: 'May 03 12:00', mbappe: 58.5, other: 1.6, kane: 41.5, martinelli: 0.4 }, 
    { date: 'May 04', mbappe: 58.5, other: 1.6, kane: 41.5, martinelli: 0.4 },
    { date: 'May 05', mbappe: 59.0, other: 1.5, kane: 41.0, martinelli: 0.4 },
    { date: 'May 06', mbappe: 59.0, other: 1.5, kane: 41.0, martinelli: 0.4 },
    { date: 'May 06 12:00', mbappe: 99.45, other: 1.55, kane: 0.54, martinelli: 0.44 }, 
    { date: 'May 07', mbappe: 99.45, other: 1.55, kane: 0.54, martinelli: 0.44 },
  ];

  const data: ChartPoint[] = marketType === 'multi' ? dataMulti : dataBinary;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      if (marketType === 'multi') {
        const canonicalEntry = payload.find((p: any) => p.dataKey === 'canonical');
        const otherEntries = payload.filter((p: any) => p.dataKey !== 'canonical').sort((a: any, b: any) => b.value - a.value);

        return (
          <div className="bg-[#18181b]/95 border border-zinc-800 rounded-lg p-3 shadow-2xl z-50 min-w-[200px]">
            <div className="text-zinc-400 text-[11px] mb-3 font-sans">
              {label}, 26 03:00 AM
            </div>
            <div className="flex flex-col gap-2">
               {canonicalEntry && (
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-1 gap-4">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium">
                      <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(204,255,0,0.5)]" style={{ backgroundColor: canonicalEntry.color }}></div>
                      <span className="font-bold text-white text-[15px]">{canonicalEntry.value}¢</span>
                      <span className="text-white ml-0.5 font-bold">{canonicalEntry.name}</span>
                    </div>
                    <span className="bg-[#ccff00]/10 text-[#ccff00] px-1.5 py-0.5 rounded font-sans uppercase tracking-widest text-[9px] font-bold">Unified</span>
                  </div>
               )}
              {otherEntries.map((entry: any, index: number) => (
                <div key={index} className="flex items-center gap-1.5 text-[13px] font-medium opacity-90">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                  <span className="font-bold text-white">{entry.value}¢</span>
                  <span className="text-zinc-300 ml-0.5">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      } else {
        return (
          <div className="bg-[#18181b]/95 border border-zinc-800 rounded-lg p-3 shadow-2xl z-50 min-w-[200px]">
            <div className="text-zinc-400 text-[11px] mb-3 font-sans">
              {label}, 26 03:00 AM
            </div>
            <div className="flex flex-col gap-2">
              {[...payload].sort((a: any, b: any) => b.value - a.value).map((entry: any, index: number) => (
                <div key={index} className="flex items-center gap-1.5 text-[13px] font-medium">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                  <span className="font-bold text-white">{entry.value}%</span>
                  <span className="text-white ml-0.5">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
    }
    return null;
  };

  const tabs = ['1H', '6H', '1D', '1W', '1M', 'ALL'];

  return (
    <div className="relative w-full h-full flex flex-col pt-2 pb-2 bg-[#0c0c0c] rounded-xl overflow-hidden">
      {/* Probability Header */}
      <div className="flex items-center gap-2 px-4 pt-2">
        <Activity className="w-4 h-4 text-white" />
        <span className="text-white font-bold text-sm">Probability</span>
      </div>
      <div className="w-full bg-zinc-800 h-px mt-2" />
      <div className="w-24 bg-white h-0.5" /> {/* Underline for Probability */}

      {/* Tabs Row */}
      <div className="flex items-center justify-between px-4 mt-3">
        <div className="flex items-center rounded-md bg-transparent space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-sm font-bold transition-colors ${
                activeTab === tab
                  ? 'text-white border border-white bg-transparent rounded shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 mt-4 text-[13px]">
        {marketType === 'multi' ? (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#ccff00] shadow-[0_0_8px_rgba(204,255,0,0.5)]"></div>
              <span className="text-white font-bold">Canonical 26.2¢</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#3B82F6]"></div>
              <span className="text-white font-bold">Polymarket 26.0¢</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
              <span className="text-white font-bold">Limitless 26.5¢</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#8B5CF6]"></div>
              <span className="text-white font-bold">Predict 26.9¢</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#3B82F6]"></div>
              <span className="text-white font-bold">Kylian Mbappe 99.45%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#EF4444]"></div>
              <span className="text-white font-bold">Other 1.55%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
              <span className="text-white font-bold">Harry Kane 0.54%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#8B5CF6]"></div>
              <span className="text-white font-bold">Gabriel Martinelli 0.44%</span>
            </div>
          </>
        )}
        <div className="text-zinc-400 font-bold ml-2 cursor-pointer hover:text-white transition-colors">
          ••• More
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full mt-6 pr-4 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#71717A', fontSize: 11 }}
              dy={10}
              tickFormatter={(val) => val.includes(':') ? '' : val}
            />
            <YAxis 
              orientation="right" 
              axisLine={false}
              tickLine={false} 
              tick={{ fill: '#71717A', fontSize: 11 }}
              dx={10}
              tickFormatter={(val) => marketType === 'multi' ? `${val}¢` : `${val}%`}
              ticks={[0, 25, 50, 75, 100]}
              domain={[0, 100]}
            />
            {/* Dashed Grid lines matching screenshot horizontal lines */}
            {[0, 25, 50, 75, 100].map((val) => (
                <ReferenceLine key={val} y={val} stroke="#27272A" strokeDasharray="3 3" opacity={0.6} />
            ))}
            
            <Tooltip 
               content={<CustomTooltip />} 
               cursor={{ stroke: '#52525B', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            
            {marketType === 'multi' ? (
              <>
                <Line type="linear" dataKey="poly" name="Polymarket" stroke="#3B82F6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} />
                <Line type="linear" dataKey="limitless" name="Limitless" stroke="#10B981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} />
                <Line type="linear" dataKey="predict" name="Predict" stroke="#8B5CF6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} />
                <Line type="linear" dataKey="canonical" name="Canonical" stroke="#ccff00" strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: '#18181b', strokeWidth: 2 }} />
                
                {/* Final Value Dots on the far right */}
                <ReferenceDot x="May 07" y={99.0} r={4} fill="#3B82F6" stroke="#18181b" strokeWidth={2} />
                <ReferenceDot x="May 07" y={99.5} r={4} fill="#10B981" stroke="#18181b" strokeWidth={2} />
                <ReferenceDot x="May 07" y={99.2} r={4} fill="#8B5CF6" stroke="#18181b" strokeWidth={2} />
                <ReferenceDot x="May 07" y={99.4} r={5} fill="#ccff00" stroke="#18181b" strokeWidth={2} />
              </>
            ) : (
              <>
                <Line type="linear" dataKey="kane" name="Harry Kane" stroke="#10B981" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} />
                <Line type="linear" dataKey="other" name="Other" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} />
                <Line type="linear" dataKey="mbappe" name="Kylian Mbappe" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} />
                <Line type="linear" dataKey="martinelli" name="Gabriel Martinelli" stroke="#8B5CF6" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} />
                
                {/* Final Value Dots on the far right */}
                <ReferenceDot x="May 07" y={99.45} r={4} fill="#3B82F6" stroke="#18181b" strokeWidth={2} />
                <ReferenceDot x="May 07" y={1.55} r={4} fill="#EF4444" stroke="#18181b" strokeWidth={2} />
                <ReferenceDot x="May 07" y={0.54} r={4} fill="#10B981" stroke="#18181b" strokeWidth={2} />
                <ReferenceDot x="May 07" y={0.44} r={4} fill="#8B5CF6" stroke="#18181b" strokeWidth={2} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const InfraTradingTerminal = ({
  embedded = false,
  darkMode = true,
  selectedMarket,
  session,
}: {
  embedded?: boolean;
  darkMode?: boolean;
  selectedMarket?: TerminalMarketSelection | null;
  session?: AuthSession | null;
} = {}) => {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'pro'>('limit');
  const [rulesInnerTab, setRulesInnerTab] = useState<'rules' | 'aggregation'>('rules');
  const [orderAction, setOrderAction] = useState<'setup' | 'preview'>('setup');
  const [marketType, setMarketType] = useState<'binary' | 'multi'>('binary');
  const [bottomTab, setBottomTab] = useState<TerminalBottomTab>('Outcomes');
  const [ghostFill, setGhostFill] = useState(false);
  const [fastLane, setFastLane] = useState(false);
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [showAllOutcomes, setShowAllOutcomes] = useState(false);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null);
  const [terminalOutcomes, setTerminalOutcomes] = useState<TerminalOutcomeRow[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(false);
  const [outcomesError, setOutcomesError] = useState<string | null>(null);
  const [positions, setPositions] = useState<ExecutionPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<TerminalOpenOrder[]>([]);
  const [tradeHistory, setTradeHistory] = useState<ExecutionStatus[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [riskState, setRiskState] = useState<TerminalRiskState>({ loading: false, error: null, assessments: [], profiles: [] });
  React.useEffect(() => {
    if (selectedMarket?.marketType) {
      setMarketType(selectedMarket.marketType);
    }
  }, [selectedMarket?.marketType, selectedMarket?.title]);

  const activeEventMarket = marketType === 'binary' ? canonicalEventMarkets[0] : canonicalEventMarkets[3];
  const terminalMarket = useMemo<TerminalMarketSelection>(() => selectedMarket ?? {
    title: marketType === 'binary' ? 'Cleveland / Will the Cleveland Cavaliers win...' : 'World Cup / Who will win the 2026 FIFA World Cup?',
    category: activeEventMarket.category,
    icon: activeEventMarket.icon,
    volume: '$67.9M',
    venueCount: canonicalEventMarkets.length,
    routeType: marketType === 'binary' ? 'Pair' : 'Single',
    marketType,
  }, [activeEventMarket.category, activeEventMarket.icon, marketType, selectedMarket]);
  /*
  const outcomeRows = [
    { name: 'France', vol: '$5.6M Vol.', platforms: 3, prob: '16%', yesPrice: '16.1¢', noPrice: '83.0¢', active: true },
    { name: 'Spain', vol: '$12.5M Vol.', platforms: 3, prob: '16%', yesPrice: '15.8¢', noPrice: '83.0¢', active: false },
    { name: 'England', vol: '$4.5M Vol.', platforms: 3, prob: '11%', yesPrice: '11.1¢', noPrice: '88.5¢', active: false },
    { name: 'Argentina', vol: '$2.7M Vol.', platforms: 3, prob: '9%', yesPrice: '9.0¢', noPrice: '90.5¢', active: false },
    { name: 'Brazil', vol: '$2.4M Vol.', platforms: 3, prob: '8%', yesPrice: '8.3¢', noPrice: '90.8¢', active: false },
    { name: 'Germany', vol: '$1.9M Vol.', platforms: 3, prob: '7%', yesPrice: '7.8¢', noPrice: '91.9¢', active: false },
    { name: 'Portugal', vol: '$1.5M Vol.', platforms: 2, prob: '6%', yesPrice: '6.2¢', noPrice: '93.1¢', active: false },
    { name: 'Netherlands', vol: '$1.2M Vol.', platforms: 2, prob: '5%', yesPrice: '5.4¢', noPrice: '94.0¢', active: false },
  ];
  const visibleOutcomeRows = showAllOutcomes ? outcomeRows : outcomeRows.slice(0, 5);
  const positionVenueRows = [
    {
      venue: 'Polymarket',
      logo: 'poly',
      shares: '620',
      avgEntry: '26.0¢',
      mark: '26.8¢',
      pnl: '+$4.96',
      pnlTone: 'text-emerald-400',
      fill: '62%',
    },
    {
      venue: 'Limitless',
      logo: 'limitless',
      shares: '210',
      avgEntry: '26.5¢',
      mark: '26.8¢',
      pnl: '+$0.63',
      pnlTone: 'text-emerald-400',
      fill: '21%',
    },
    {
      venue: 'Predict.fun',
      logo: 'predict',
      shares: '170',
      avgEntry: '26.9¢',
      mark: '26.8¢',
      pnl: '-$0.17',
      pnlTone: 'text-red-400',
      fill: '17%',
    },
  ];
  */
  const terminalMarketId = executionMarketId(terminalMarket);
  const terminalCanonicalEventId = selectedMarket?.canonicalEventId ?? selectedMarket?.eventId ?? null;
  const selectedVenueMarkets = selectedMarket?.venueMarkets ?? [];
  const token = session?.userJwt ?? null;
  const marketVenueList = useMemo(() => {
    const venues = terminalMarket.venues?.length
      ? terminalMarket.venues
      : selectedVenueMarkets.map((venueMarket) => venueMarket.venue);
    return [...new Set(venues.filter(Boolean))];
  }, [selectedVenueMarkets, terminalMarket.venues]);
  const visibleOutcomeRows = showAllOutcomes ? terminalOutcomes : terminalOutcomes.slice(0, 5);
  const selectedOutcome = terminalOutcomes.find((outcome) => outcome.id === selectedOutcomeId) ?? terminalOutcomes[0] ?? null;
  const accountEmptyCopy = !token ? 'Log in to load your Lotus execution records for this market.' : 'No backend records for this market yet.';
  const totalVerifiedSize = positions.reduce((sum, position) => sum + (parsePositiveNumber(position.verifiedSize) ?? 0), 0);
  const totalCostBasis = positions.reduce((sum, position) => sum + (parsePositiveNumber(position.verifiedSize) ?? 0) * position.averageEntryPrice, 0);
  const averageEntry = totalVerifiedSize > 0 ? totalCostBasis / totalVerifiedSize : null;
  const positionVenueRows = positions.map((position) => ({
    venue: formatVenueLabel(position.venue),
    logo: normalizeVenueId(position.venue),
    shares: formatCompactMetric(position.verifiedSize) ?? position.verifiedSize,
    avgEntry: formatProbabilityPrice(position.averageEntryPrice),
    mark: 'Live MTM in portfolio',
    pnl: position.status,
    pnlTone: position.status === 'VERIFIED' ? 'text-emerald-400' : 'text-amber-400',
    fill: formatCompactMetric(position.sellableSize) ? `${formatCompactMetric(position.sellableSize)} sellable` : 'Verified',
  }));
  const primaryRiskAssessment = riskState.assessments[0] ?? null;
  const primaryRiskTone = riskTone(primaryRiskAssessment);
  const PrimaryRiskIcon = primaryRiskTone.icon;
  const bottomPanelHeight = bottomTab === 'Outcomes'
    ? 'h-[440px] 2xl:h-[500px]'
    : 'h-[620px] 2xl:h-[720px]';
  const venueBadgeClass = 'h-7 w-7 rounded-full border-[2.5px] border-[#121214] bg-zinc-900 shadow-sm';
  const tinyVenueClass = 'h-3.5 w-3.5 rounded-full border border-zinc-800 bg-zinc-950';

  const refreshOutcomes = useCallback(async () => {
    const fallbackRows = initialOutcomeRows(terminalMarket);
    if (!terminalMarketId) {
      setTerminalOutcomes(fallbackRows);
      setSelectedOutcomeId((current) => current ?? fallbackRows[0]?.id ?? null);
      return;
    }

    setOutcomesLoading(true);
    setOutcomesError(null);
    try {
      const outcomeResponse = await getMarketOutcomes(terminalMarketId);
      const baseOutcomes = outcomeResponse.outcomes.length > 0
        ? outcomeResponse.outcomes
        : fallbackRows.map((row) => ({ id: row.id, label: row.name, venues: row.venues }));

      const rows = await Promise.all(baseOutcomes.map(async (outcome: MarketOutcome, index): Promise<TerminalOutcomeRow> => {
        if (!token) {
          return {
            id: outcome.id,
            name: outcome.label,
            vol: `${formatMoneyMetric(terminalMarket.volume) ?? terminalMarket.volume} Vol.`,
            platforms: outcome.venues.length || terminalMarket.venueCount,
            prob: 'Quote',
            yesPrice: 'Quote',
            noPrice: 'Quote',
            active: selectedOutcomeId ? selectedOutcomeId === outcome.id : index === 0,
            venues: outcome.venues.length ? outcome.venues : marketVenueList,
            status: 'auth_required',
            blocker: 'Login required for live route quote',
          };
        }

        try {
          const candidateResponse = await getLiveCandidates(token, {
            side: 'buy',
            marketId: terminalMarketId,
            outcomeId: outcome.id,
            amount: '1',
            venues: marketVenueList.length ? marketVenueList : undefined,
          });
          const best = bestCandidate(candidateResponse.candidates);
          const average = averageCandidatePrice(candidateResponse.candidates);
          const venues = candidateResponse.candidates.length
            ? candidateResponse.candidates.map((candidate) => candidate.venue)
            : outcome.venues;
          return {
            id: outcome.id,
            name: outcome.label,
            vol: `${formatMoneyMetric(terminalMarket.volume) ?? terminalMarket.volume} Vol.`,
            platforms: venues.length || terminalMarket.venueCount,
            prob: formatProbabilityPercent(average),
            yesPrice: formatProbabilityPrice(best?.price ?? average),
            noPrice: terminalMarket.marketType === 'binary' && average ? formatProbabilityPrice(1 - average) : 'Quote',
            active: selectedOutcomeId ? selectedOutcomeId === outcome.id : index === 0,
            venues,
            status: candidateResponse.candidates.length ? 'live' : 'unavailable',
            blocker: candidateResponse.blocked[0]?.reason ?? null,
          };
        } catch (error) {
          return {
            id: outcome.id,
            name: outcome.label,
            vol: `${formatMoneyMetric(terminalMarket.volume) ?? terminalMarket.volume} Vol.`,
            platforms: outcome.venues.length || terminalMarket.venueCount,
            prob: 'Quote',
            yesPrice: 'Quote',
            noPrice: 'Quote',
            active: selectedOutcomeId ? selectedOutcomeId === outcome.id : index === 0,
            venues: outcome.venues.length ? outcome.venues : marketVenueList,
            status: 'unavailable',
            blocker: error instanceof Error ? error.message : 'Live quote unavailable',
          };
        }
      }));

      setTerminalOutcomes(rows);
      setSelectedOutcomeId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
    } catch (error) {
      setTerminalOutcomes(fallbackRows);
      setSelectedOutcomeId((current) => current ?? fallbackRows[0]?.id ?? null);
      setOutcomesError(error instanceof Error ? error.message : 'Unable to load market outcomes');
    } finally {
      setOutcomesLoading(false);
    }
  }, [marketVenueList, selectedOutcomeId, terminalMarket, terminalMarketId, token]);

  React.useEffect(() => {
    setShowAllOutcomes(false);
    setSelectedOutcomeId(null);
  }, [terminalMarketId]);

  React.useEffect(() => {
    void refreshOutcomes();
    const interval = window.setInterval(() => {
      void refreshOutcomes();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshOutcomes]);

  const refreshAccountData = useCallback(async () => {
    if (!token) {
      setPositions([]);
      setOpenOrders([]);
      setTradeHistory([]);
      setAccountError(null);
      return;
    }
    if (bottomTab !== 'Positions' && bottomTab !== 'Open Orders' && bottomTab !== 'Trade History') {
      setAccountLoading(false);
      setAccountError(null);
      return;
    }
    setAccountLoading(true);
    setAccountError(null);
    try {
      if (bottomTab === 'Positions') {
        const positionsResponse = await getPositions(token, { limit: 100 });
        setPositions(positionsResponse.positions.filter((position) => matchesPositionMarket(position, terminalMarketId, null)));
      }
      if (bottomTab === 'Open Orders') {
        const openOrdersResponse = await getOpenOrders(token, { limit: 50 });
        setOpenOrders(openOrdersResponse.items.filter((order) => matchesTerminalMarket(order, terminalMarketId)));
      }
      if (bottomTab === 'Trade History') {
        const historyResponse = await getExecutionHistory(token, { limit: 50 });
        setTradeHistory(historyResponse.items.filter((item) => matchesTerminalMarket(item, terminalMarketId)));
      }
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Unable to load execution records');
    } finally {
      setAccountLoading(false);
    }
  }, [bottomTab, terminalMarketId, token]);

  React.useEffect(() => {
    void refreshAccountData();
    const interval = window.setInterval(() => {
      void refreshAccountData();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [refreshAccountData]);

  React.useEffect(() => {
    let cancelled = false;

    const loadRisk = async () => {
      if (!terminalCanonicalEventId && selectedVenueMarkets.length === 0) {
        setRiskState({ loading: false, error: null, assessments: [], profiles: [] });
        return;
      }

      setRiskState((current) => ({ ...current, loading: true, error: null }));
      try {
        const canonicalPromise = terminalCanonicalEventId && isUuid(terminalCanonicalEventId)
          ? getCanonicalResolutionRisk(terminalCanonicalEventId)
          : Promise.resolve(null);
        const profilePromises = selectedVenueMarkets
          .filter((venueMarket) => venueMarket.venue && venueMarket.venueMarketId)
          .slice(0, 6)
          .map((venueMarket) => getVenueMarketResolutionRisk(venueMarket.venue, venueMarket.venueMarketId));
        const [canonicalResult, ...profileResults] = await Promise.allSettled([canonicalPromise, ...profilePromises]);
        if (cancelled) return;

        const assessments: ResolutionRiskAssessment[] = [];
        const profiles: ResolutionRiskProfile[] = [];
        if (canonicalResult.status === 'fulfilled' && canonicalResult.value) {
          assessments.push(...canonicalResult.value.assessments);
        }
        for (const result of profileResults) {
          if (result.status === 'fulfilled') {
            profiles.push(result.value.profile);
            assessments.push(...result.value.assessments);
          }
        }
        setRiskState({ loading: false, error: null, assessments, profiles });
      } catch (error) {
        if (!cancelled) {
          setRiskState({ loading: false, error: error instanceof Error ? error.message : 'Unable to load resolution risk', assessments: [], profiles: [] });
        }
      }
    };

    void loadRisk();
    return () => {
      cancelled = true;
    };
  }, [selectedVenueMarkets, terminalCanonicalEventId]);

  return (
    <div className={`lotus-terminal lotus-terminal-viewport ${darkMode ? 'lotus-terminal-dark' : 'lotus-terminal-light'} ${embedded ? 'h-[calc(100vh-6.5rem)]' : 'h-[calc(100vh-4rem)] -mx-4 -my-8 lg:-mx-12 lg:-my-12'} bg-[#09090b] text-white font-sans overflow-y-auto overflow-x-hidden custom-scrollbar`}>
      <div className="lotus-terminal-stage flex min-h-full w-full bg-[#09090b] text-white p-2 2xl:p-3 gap-2 2xl:gap-3 items-start">
      
      {/* Focus Rail */}
      {!embedded && <div className="w-16 bg-[#121214] border border-zinc-800 rounded-xl flex flex-col items-center py-4 gap-6 shrink-0 z-10">
          <div className="w-8 h-8 flex items-center justify-center">
              <LotusLogo className="w-8 h-8 text-[#ccff00]" />
          </div>
          <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-900 flex items-center justify-center cursor-pointer shadow-sm">
              <Home className="w-5 h-5"/>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
              <Search className="w-5 h-5"/>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
              <BarChart2 className="w-5 h-5"/>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
              <Terminal className="w-5 h-5"/>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
              <Volleyball className="w-5 h-5"/>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
              <PieChart className="w-5 h-5"/>
          </div>
          
          <div className="mt-auto flex flex-col gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
                  <Bookmark className="w-5 h-5"/>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
                  <Info className="w-5 h-5"/>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/80 cursor-pointer transition-colors">
                  <Settings className="w-5 h-5"/>
              </div>
          </div>
      </div>}

      {/* Middle Panel Container: Chart & Tabs */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
         {/* Top Header Row */}
         <div className="bg-[#121214] border border-zinc-800 rounded-xl p-3 2xl:p-4 flex items-center justify-between gap-3 shrink-0">
            <div className="flex min-w-0 flex-1 items-center gap-2 2xl:gap-4">
                <div className="relative z-30">
                    <button
                      type="button"
                      onClick={() => setShowMarketSelector((open) => !open)}
                      aria-expanded={showMarketSelector}
                      className="group flex h-11 2xl:h-12 w-[clamp(280px,30vw,520px)] items-center gap-3 rounded-xl border border-zinc-800 bg-[#0c0c0e] px-3 text-left transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-base">
                        {activeEventMarket.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm 2xl:text-base font-semibold tracking-tight text-zinc-100">
                          {terminalMarket.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-500">
                          Canonical event / {terminalMarket.venueCount} linked markets / {terminalMarket.volume} volume
                        </span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform group-hover:text-zinc-300 ${showMarketSelector ? 'rotate-180' : ''}`} />
                    </button>

                    {showMarketSelector && (
                      <div className="lotus-terminal-event-menu absolute left-0 top-full z-50 mt-3 w-[480px] overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl shadow-black/40">
                        <div className="border-b border-zinc-800 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ccff00]">Lotus canonical event</div>
                              <h3 className="mt-1 text-lg font-semibold leading-tight text-zinc-100">
                                Cleveland / NBA Eastern Conference Champion
                              </h3>
                              <p className="mt-1 text-xs text-zinc-500">
                                Pick the canonical market you want to trade under this event.
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label="Pin event"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-[#ccff00]/40 hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                            >
                              <Bookmark className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-xl border border-zinc-800 bg-[#121214] p-3">
                              <div className="text-zinc-500">All markets</div>
                              <div className="mt-1 font-mono text-sm font-bold text-zinc-100">$67.9M</div>
                            </div>
                            <div className="rounded-xl border border-[#ccff00]/25 bg-[#ccff00]/10 p-3">
                              <div className="text-zinc-500">Best route</div>
                              <div className="mt-1 font-mono text-sm font-bold text-[#ccff00]">Pair</div>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-[#121214] p-3">
                              <div className="text-zinc-500">Venues</div>
                              <div className="mt-1 font-mono text-sm font-bold text-zinc-100">3 linked</div>
                            </div>
                          </div>
                        </div>
                        <div className="max-h-[420px] overflow-y-auto p-2 custom-scrollbar">
                          {canonicalEventMarkets.map((market) => (
                            <button
                              key={market.name}
                              type="button"
                              onClick={() => {
                                setMarketType(market.marketType);
                                setShowMarketSelector(false);
                              }}
                              className={`group w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${
                                market.marketType === marketType
                                  ? 'border-[#ccff00]/35 bg-[#ccff00]/10'
                                  : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/70'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-lg">
                                  {market.icon}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-zinc-100">{market.name}</span>
                                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                    <span>{market.category}</span>
                                    <span>/</span>
                                    <span className="text-emerald-400">{market.change}</span>
                                    <span>/</span>
                                    <span>{market.volume} volume</span>
                                    <span className="rounded-md border border-[#ccff00]/25 bg-[#ccff00]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ccff00]">
                                      {market.route}
                                    </span>
                                  </span>
                                </span>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition-colors group-hover:border-zinc-700 group-hover:text-zinc-300">
                                  <BarChart2 className="h-4 w-4" />
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 pl-14">
                                <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-xs font-bold text-emerald-400">
                                  Yes {market.yes}
                                </span>
                                <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-xs font-bold text-red-400">
                                  No {market.no}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
                <div className="hidden xl:flex items-center px-2.5 py-1 rounded-md bg-[#ccff00]/10 border border-[#ccff00]/20 text-[#99cc00] text-[10px] font-bold uppercase tracking-widest ml-1 2xl:ml-2">
                    {terminalMarket.routeType} ROUTE / {Math.max(1, Math.min(terminalMarket.venueCount, 3))} VENUES
                </div>
                <div className="flex bg-zinc-900 border border-zinc-800 rounded-md p-1 ml-1 2xl:ml-2">
                    <button onClick={() => setMarketType('binary')} className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${marketType === 'binary' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Binary</button>
                    <button onClick={() => setMarketType('multi')} className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${marketType === 'multi' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Multi</button>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-3 2xl:gap-6 text-sm">
                <div className="flex items-center gap-2 text-emerald-400 font-mono font-medium bg-emerald-500/10 px-2.5 2xl:px-3 py-1.5 rounded-md border border-emerald-500/20">
                    <Clock className="w-3.5 h-3.5" /> 50d 1h 50m
                </div>
                <div className="hidden 2xl:block text-zinc-300 font-medium">Jun 13, 2026</div>
                <div className="text-white font-mono font-bold text-base">$1.5M</div>
                
                <div className="flex items-center gap-3 2xl:gap-4 border-l border-zinc-800 pl-3 2xl:pl-6 text-zinc-400">
                    <Bookmark className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
                    <Share2 className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
                    <Info className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
                </div>
            </div>
         </div>
         
         {/* Chart & Order Book Grid */}
         <div className="h-[540px] 2xl:h-[620px] bg-[#121214] border border-zinc-800 rounded-xl flex overflow-hidden relative shrink-0">
            
            {/* Main Chart Section */}
            <div className="flex-1 flex flex-col relative border-r border-zinc-800 p-4 min-w-0">
               <CanonicalChart marketType={marketType} />
            </div>

            {/* Order Book Panel (Right side of middle container) */}
            <div className="w-[clamp(400px,24vw,520px)] bg-[#121214] flex flex-col text-[10px] font-mono shrink-0">
               <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
                   <div className="flex items-center gap-3">
                       <ChevronLeft className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-white" />
                       <span className="w-4 h-4 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-[8px] font-bold">$</span>
                       <div className="relative group">
                           <Info className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-white" />
                           <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:flex flex-col w-[260px] bg-zinc-900 border border-zinc-700/50 rounded-lg p-3 shadow-xl z-50 pointer-events-none">
                               <div className="text-zinc-200 text-[11px] font-sans pb-2 border-b border-zinc-800 mb-2">
                                   <div className="flex justify-between items-center">
                                       <span className="font-semibold text-white">Spread: 0.00¢</span>
                                       <span className="text-[10px] text-zinc-500">(Combined effective spread)</span>
                                   </div>
                               </div>
                               <div className="flex justify-between text-[11px] font-sans mb-1 text-zinc-300">
                                   <span>Best Bid: <span className="text-emerald-400 font-mono font-bold">25.5¢</span></span>
                                   <span>Best Ask: <span className="text-pink-400 font-mono font-bold">25.5¢</span></span>
                               </div>
                               <div className="text-[11px] font-sans text-zinc-400">
                                   Total Depth at Spread: <span className="font-mono text-zinc-300 font-bold">$12.4M</span>
                               </div>
                               
                               {/* Triangle pointer */}
                               <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-2 h-2 -mb-1 bg-zinc-900 border-t border-l border-zinc-700/50 rotate-45"></div>
                           </div>
                       </div>
                   </div>
                   <select className="bg-zinc-950 border border-zinc-700/50 rounded-md px-2 py-1.5 text-xs text-white outline-none cursor-pointer">
                       <option>All Venues</option>
                       <option>Polymarket</option>
                       <option>Limitless</option>
                   </select>
               </div>
               <div className="flex justify-between px-4 py-2 bg-zinc-950/20 text-zinc-500 font-sans text-[10px] font-bold tracking-wider uppercase border-b border-zinc-800">
                   <span className="w-12">Price</span>
                   <span className="w-16">Venue</span>
                   <span className="w-20 text-right">Size</span>
                   <span className="w-24 text-right">Cum. USD</span>
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                   {/* Asks (Sells) */}
                   {[...Array(10)].map((_, i) => {
                       const isConsumedAsks = i >= 8; // Highlight last 2 asks (closest to spread)
                       const venue = i % 2 === 0 ? 'Predict' : 'Poly';
                       return (
                           <div key={'ask'+i} className={`flex justify-between px-4 py-0.5 hover:bg-zinc-800/50 cursor-pointer ${i === 9 ? 'mb-1' : ''} ${isConsumedAsks ? 'bg-[#E52B50]/5' : ''}`}>
                               <span className="w-12 text-pink-500 font-bold">{(30.6 - i*0.5).toFixed(1)}c</span>
                               <span className="w-16 flex items-center gap-1.5 text-zinc-500 uppercase text-[9px] font-bold tracking-wider">
                                   <VenueLogo id={venue} label={venue} className={tinyVenueClass} />
                                   {venue}
                               </span>
                               <span className="w-20 text-right text-zinc-200">{(Math.random() * 5000 + 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
                               <span className="w-24 text-right text-white font-bold">{(Math.random() * 20000 + 10000).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
                           </div>
                       );
                   })}
                   
                   <div className="flex justify-between px-4 py-1 bg-zinc-950 text-[10px] text-zinc-500 border-y border-zinc-800 font-sans tracking-wide">
                       <span className="font-bold">Spread</span>
                       <span className="font-mono">0.00c</span>
                   </div>

                   {/* Bids (Buys) */}
                   {[...Array(10)].map((_, i) => {
                       const isConsumedBids = i <= 2; // Highlight first 3 bids (closest to spread)
                       const venue = i % 2 !== 0 ? 'Limitless' : 'Poly';
                       return (
                           <div key={'bid'+i} className={`flex justify-between px-4 py-0.5 hover:bg-zinc-800/50 cursor-pointer ${i === 0 ? 'mt-1' : ''} ${isConsumedBids ? 'bg-[#ccff00]/5' : ''}`}>
                               <span className="w-12 text-emerald-400 font-bold">{(26.0 - i*0.5).toFixed(1)}c</span>
                               <span className="w-16 flex items-center gap-1.5 text-zinc-500 uppercase text-[9px] font-bold tracking-wider">
                                   <VenueLogo id={venue} label={venue} className={tinyVenueClass} />
                                   {venue}
                               </span>
                               <span className="w-20 text-right text-zinc-200">{(Math.random() * 5000 + 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
                               <span className="w-24 text-right text-white font-bold">{(Math.random() * 8000 + 1000).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
                           </div>
                       );
                   })}
               </div>
            </div>
         </div>

         {/* Bottom Data Table Section */}
         <div className={`${bottomPanelHeight} bg-[#121214] border border-zinc-800 rounded-xl overflow-hidden shrink-0 flex flex-col relative z-20`}>
             <div className="flex justify-between items-center bg-zinc-950/40 pr-4">
                 <div className="flex border-b border-zinc-800 pl-4 overflow-x-auto no-scrollbar flex-1">
                     {(['Outcomes', 'Positions', 'Open Orders', 'Trade History', 'Rules & Risk'] as TerminalBottomTab[]).map(t => (
                         <button key={t} onClick={() => setBottomTab(t)} className={`px-5 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${bottomTab === t ? 'border-zinc-100 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>
                             {t}
                         </button>
                     ))}
                 </div>
                 {bottomTab === 'Outcomes' && (
                     <div className="flex items-center gap-2 border-b border-transparent pb-1">
                          <span className="text-zinc-400 text-[11px] font-bold uppercase tracking-wider">Vol Filter</span>
                          <div className="w-8 h-4 bg-zinc-700 rounded-full flex items-center p-0.5 cursor-pointer">
                              <div className="w-3 h-3 bg-white rounded-full shadow-sm"></div>
                          </div>
                     </div>
                 )}
             </div>
             <div className="flex-1 overflow-y-auto w-full custom-scrollbar bg-[#121214] p-4">
                {bottomTab === 'Outcomes' && (
                    <div className="flex w-full flex-col gap-2">
                         {outcomesLoading && (
                           <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold text-zinc-400">
                             Refreshing live outcome quotes...
                           </div>
                         )}
                         {outcomesError && (
                           <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200">
                             {outcomesError}
                           </div>
                         )}
                         {visibleOutcomeRows.length === 0 && emptyCopy('No outcomes loaded', 'The backend has not returned outcomes for this market yet.')}
                         {visibleOutcomeRows.map((m) => {
                           const venues = m.venues.length ? m.venues : marketVenueList;
                           return (
                            <div
                              key={m.id}
                              onClick={() => setSelectedOutcomeId(m.id)}
                              className={`px-5 py-2.5 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${m.active ? 'border border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border border-transparent hover:border-zinc-800 hover:bg-zinc-900/30 bg-transparent'}`}
                            >
                                 <div className="flex items-center gap-5">
                                     <div className="flex items-center [&>div:first-child]:hidden">
                                         <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center border-[2.5px] border-[#121214] text-white text-[11px] font-bold z-30 relative shadow-sm">L</div>
                                         {venues.slice(0, 4).map((venue, index) => (
                                           <VenueLogo
                                             key={`${m.id}-${venue}`}
                                             id={normalizeVenueId(venue)}
                                             label={formatVenueLabel(venue)}
                                             className={`${venueBadgeClass} relative ${index === 0 ? 'z-30' : index === 1 ? 'z-20 -ml-2.5' : 'z-10 -ml-2.5'}`}
                                           />
                                         ))}
                                     </div>
                                     <div>
                                         <div className="text-zinc-100 font-bold text-base tracking-wide leading-tight">{m.name}</div>
                                         <div className="text-zinc-500 text-xs mt-0.5 font-medium">
                                           {m.vol} <span className="mx-1">-</span> {m.platforms} venues
                                           {m.blocker && <span className="ml-2 text-amber-300">{m.blocker}</span>}
                                         </div>
                                     </div>
                                 </div>
                                 <div className="flex items-center gap-6">
                                     <div className="text-white font-black text-xl w-14 text-right tracking-tight">{m.prob}</div>
                                     <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedOutcomeId(m.id);
                                              setSide('buy');
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A3A34] text-[#4ade80] text-xs font-bold hover:bg-[#204941] transition-colors"
                                          >
                                               <VenueLogo id={normalizeVenueId(venues[0] ?? 'lotus')} label={formatVenueLabel(venues[0] ?? 'Lotus')} className="h-3.5 w-3.5 rounded-full" /> Yes {m.yesPrice}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedOutcomeId(m.id);
                                              setSide('sell');
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3F1D24] text-[#f87171] text-xs font-bold hover:bg-[#52252f] transition-colors"
                                          >
                                               <VenueLogo id={normalizeVenueId(venues[1] ?? venues[0] ?? 'lotus')} label={formatVenueLabel(venues[1] ?? venues[0] ?? 'Lotus')} className="h-3.5 w-3.5 rounded-full" /> No {m.noPrice}
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Open ${m.name} outcome details`}
                                            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                          >
                                            <ChevronDown className="w-4 h-4" />
                                          </button>
                                     </div>
                                 </div>
                             </div>
                           );
                         })}
                        {terminalOutcomes.length > 5 && (
                          <div className="flex justify-center pt-1">
                              <button
                                type="button"
                                onClick={() => setShowAllOutcomes((value) => !value)}
                                className="flex h-9 items-center gap-2 rounded-full border border-zinc-800 px-4 text-xs font-semibold text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                aria-expanded={showAllOutcomes}
                              >
                                 {showAllOutcomes ? 'Show fewer outcomes' : 'Show all outcomes'}
                                 <ChevronDown className={`w-4 h-4 transition-transform ${showAllOutcomes ? 'rotate-180' : ''}`} />
                               </button>
                           </div>
                        )}
                    </div>
                )}
                {false && bottomTab === 'Outcomes' && (
                    <div className="flex w-full flex-col gap-2">
                         {visibleOutcomeRows.map((m) => (
                            <div key={m.name} className={`px-5 py-2.5 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${m.active ? 'border border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border border-transparent hover:border-zinc-800 hover:bg-zinc-900/30 bg-transparent'}`}>
                                 <div className="flex items-center gap-5">
                                     <div className="flex items-center [&>div:first-child]:hidden">
                                         <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center border-[2.5px] border-[#121214] text-white text-[11px] font-bold z-30 relative shadow-sm">⧖</div>
                                         <VenueLogo id="polymarket" label="Polymarket" className={`${venueBadgeClass} z-30 relative`} />
                                         <VenueLogo id="limitless" label="Limitless" className={`${venueBadgeClass} z-20 relative -ml-2.5`} />
                                         <VenueLogo id="predict" label="Predict.fun" className={`${venueBadgeClass} z-10 relative -ml-2.5`} />
                                     </div>
                                     <div>
                                         <div className="text-zinc-100 font-bold text-base tracking-wide leading-tight">{m.name}</div>
                                         <div className="text-zinc-500 text-xs mt-0.5 font-medium">{m.vol} <span className="mx-1">•</span> {m.platforms} platforms</div>
                                     </div>
                                 </div>
                                 <div className="flex items-center gap-6">
                                     <div className="text-white font-black text-xl w-14 text-right tracking-tight">{m.prob}</div>
                                     <div className="flex items-center gap-2">
                                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A3A34] text-[#4ade80] text-xs font-bold hover:bg-[#204941] transition-colors">
                                               <VenueLogo id="polymarket" label="Polymarket" className="h-3.5 w-3.5 rounded-full" /> Yes {m.yesPrice}
                                          </button>
                                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3F1D24] text-[#f87171] text-xs font-bold hover:bg-[#52252f] transition-colors">
                                               <VenueLogo id="limitless" label="Limitless" className="h-3.5 w-3.5 rounded-full" /> No {m.noPrice}
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Open ${m.name} outcome details`}
                                            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                          >
                                            <ChevronDown className="w-4 h-4" />
                                          </button>
                                     </div>
                                 </div>
                             </div>
                         ))}
                        <div className="flex justify-center pt-1">
                            <button
                              type="button"
                              onClick={() => setShowAllOutcomes((value) => !value)}
                              className="flex h-9 items-center gap-2 rounded-full border border-zinc-800 px-4 text-xs font-semibold text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                              aria-expanded={showAllOutcomes}
                            >
                               {showAllOutcomes ? 'Show fewer outcomes' : 'Show all outcomes'}
                               <ChevronDown className={`w-4 h-4 transition-transform ${showAllOutcomes ? 'rotate-180' : ''}`} />
                             </button>
                         </div>
                    </div>
                )}
                {bottomTab === 'Rules & Risk' && (
                    <div className="w-full h-full flex flex-col min-h-0">
                        <div className="flex flex-1 min-h-0">
                            <div className="flex w-full flex-col min-h-0 bg-zinc-950/30 border border-zinc-800/60 rounded-xl p-5">
                                <h3 className="text-zinc-100 font-semibold mb-4 tracking-widest text-[#ccff00] text-xs uppercase flex items-center gap-2">
                                    RESOLUTION RULES
                                </h3>
                                <div className="flex items-center gap-6 border-b border-zinc-800 mb-5">
                                    <button
                                        onClick={() => setRulesInnerTab('rules')}
                                        className={`pb-2.5 text-sm font-medium transition-colors ${rulesInnerTab === 'rules' ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-400 border-b-2 border-transparent hover:text-zinc-200'}`}
                                    >
                                        Platform Rules
                                    </button>
                                    <button
                                        onClick={() => setRulesInnerTab('aggregation')}
                                        className={`pb-2.5 text-sm font-medium transition-colors ${rulesInnerTab === 'aggregation' ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-400 border-b-2 border-transparent hover:text-zinc-200'}`}
                                    >
                                        Aggregation Justification
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(360px,460px)] gap-5">
                                        <div className="space-y-6 min-w-0">
                                            {riskState.loading && <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold text-zinc-400">Loading backend resolution risk...</div>}
                                            {riskState.error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200">{riskState.error}</div>}
                                            {rulesInnerTab === 'rules' && (
                                                riskState.profiles.length > 0 ? (
                                                    riskState.profiles.map((profile) => (
                                                        <div key={profile.id} className="space-y-3">
                                                            <div className="w-max bg-zinc-800 text-white flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold tracking-widest shadow-sm">
                                                                <VenueLogo id={normalizeVenueId(profile.venue)} label={formatVenueLabel(profile.venue)} className="h-3.5 w-3.5 rounded-full" />
                                                                {formatVenueLabel(profile.venue)}
                                                            </div>
                                                            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed max-w-xl font-medium">
                                                                <p>{profile.primaryResolutionText || profile.supplementalRulesText || 'Backend has not returned public resolution text for this venue market.'}</p>
                                                                {profile.oracleName && <p className="text-zinc-400">Resolution source: {profile.oracleName}</p>}
                                                                {(profile.disputeWindowHours || profile.settlementLagHours) && (
                                                                  <p className="text-zinc-500">
                                                                    Dispute window {profile.disputeWindowHours ?? 'n/a'}h - settlement lag {profile.settlementLagHours ?? 'n/a'}h
                                                                  </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    emptyCopy('No rules returned', 'The backend has not returned venue resolution profiles for this selected market.')
                                                )
                                            )}
                                            {rulesInnerTab === 'aggregation' && (
                                                riskState.assessments.length > 0 ? (
                                                    <div className="space-y-4 text-sm text-zinc-300 leading-relaxed max-w-xl">
                                                        {riskState.assessments.map((assessment, index) => (
                                                          <div key={`${assessment.label}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                                                            <div className="flex items-center justify-between gap-3">
                                                              <div className="font-bold text-zinc-100">{assessment.label}</div>
                                                              <div className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">{assessment.recommendedAction}</div>
                                                            </div>
                                                            <div className="mt-3 space-y-2 text-xs text-zinc-400">
                                                              {assessment.shortReasons.length > 0
                                                                ? assessment.shortReasons.map((reason) => <p key={reason}>{reason}</p>)
                                                                : <p>Backend did not return explanatory reasons for this assessment.</p>}
                                                            </div>
                                                          </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    emptyCopy('No aggregation assessment', 'The backend has not returned a canonical pooling assessment for this market.')
                                                )
                                            )}
                                        </div>

                                        <div className="space-y-3 min-w-0">
                                            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-2">
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                Compatibility
                                            </h3>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <div className={`mt-0.5 ${primaryRiskTone.bg} p-1.5 rounded ${primaryRiskTone.color}`}>
                                                        <PrimaryRiskIcon className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-zinc-200">{primaryRiskTone.title}</div>
                                                        <ul className="text-xs text-zinc-400 mt-2 space-y-2">
                                                            {primaryRiskAssessment ? (
                                                              <>
                                                                <li className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${primaryRiskAssessment.equivalenceClass === 'SAFE_EQUIVALENT' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>{primaryRiskAssessment.recommendedAction}</li>
                                                                <li className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-zinc-500"></div>Risk {primaryRiskAssessment.riskScore} - confidence {primaryRiskAssessment.confidenceScore}</li>
                                                                {primaryRiskAssessment.shortReasons.slice(0, 3).map((reason) => (
                                                                  <li key={reason} className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-zinc-500"></div>{reason}</li>
                                                                ))}
                                                              </>
                                                            ) : (
                                                              <li className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-zinc-500"></div>No backend compatibility decision returned yet</li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-zinc-800/80" />
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 bg-amber-500/10 p-1.5 rounded text-amber-400">
                                                        <AlertTriangle className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-zinc-200">Resolution Flags</div>
                                                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                                          {riskState.profiles.some((profile) => profile.hasAmbiguousTimeBoundary || profile.hasAmbiguousJurisdictionBoundary || profile.hasAmbiguousSourceReference)
                                                            ? 'Backend flagged at least one ambiguous venue boundary. Follow the compatibility recommendation before pooling.'
                                                            : 'No ambiguous time, jurisdiction, or source boundaries returned by the backend profiles.'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 bg-blue-500/10 p-1.5 rounded text-blue-400">
                                                        <Activity className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-zinc-200">Market Context</div>
                                                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{terminalMarket.title} - {marketVenueList.length || terminalMarket.venueCount} venues scanned.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {false && bottomTab === 'Rules & Risk' && (
                    <div className="w-full h-full flex flex-col min-h-0">
                        <div className="flex flex-1 min-h-0">
                            {/* Rules Area */}
                            <div className="flex w-full flex-col min-h-0 bg-zinc-950/30 border border-zinc-800/60 rounded-xl p-5">
                                <h3 className="text-zinc-100 font-semibold mb-4 tracking-widest text-[#ccff00] text-xs uppercase flex items-center gap-2">
                                    RESOLUTION RULES
                                </h3>
                                <div className="flex items-center gap-6 border-b border-zinc-800 mb-5">
                                    <button
                                        onClick={() => setRulesInnerTab('rules')}
                                        className={`pb-2.5 text-sm font-medium transition-colors ${rulesInnerTab === 'rules' ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-400 border-b-2 border-transparent hover:text-zinc-200'}`}
                                    >
                                        Platform Rules
                                    </button>
                                    <button
                                        onClick={() => setRulesInnerTab('aggregation')}
                                        className={`pb-2.5 text-sm font-medium transition-colors ${rulesInnerTab === 'aggregation' ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-400 border-b-2 border-transparent hover:text-zinc-200'}`}
                                    >
                                        Aggregation Justification
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(360px,460px)] gap-5">
                                        <div className="space-y-6 min-w-0">
                                            {rulesInnerTab === 'rules' && (
                                                <>
                                                    <div className="space-y-3">
                                                        <div className="w-max bg-indigo-500 text-white flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold tracking-widest shadow-sm">
                                                            <VenueLogo id="polymarket" label="Polymarket" className="h-3.5 w-3.5 rounded-full" />
                                                            Polymarket
                                                        </div>
                                                        <div className="space-y-3 text-xs text-zinc-300 leading-relaxed max-w-xl font-medium">
                                                            <p>This market will resolve to "Yes" if the Cleveland Cavaliers win the 2025-2026 NBA Eastern Conference Finals. Otherwise, this market will resolve to "No".</p>
                                                            <p>This market will resolve to "No" if it becomes impossible for this team to win the 2025-26 NBA Eastern Conference Finals based on the rules of the NBA.</p>
                                                            <p>If the 2025-26 NBA Eastern Conference Finals winner is not announced by June 30, 2026, this market will resolve to "Other".</p>
                                                            <p className="text-zinc-400">The resolution source for this market will be information from the NBA.</p>
                                                        </div>
                                                    </div>
                                                    <div className="h-px bg-zinc-800" />
                                                    <div className="space-y-3">
                                                        <div className="w-max bg-[#00D180] text-black flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold tracking-widest shadow-sm">
                                                            <VenueLogo id="limitless" label="Limitless" className="h-3.5 w-3.5 rounded-full" />
                                                            Limitless
                                                        </div>
                                                        <div className="space-y-3 text-xs text-zinc-300 leading-relaxed max-w-xl font-medium">
                                                            <p>If Cleveland wins the 2026 Pro Basketball Eastern Conference Championship, then the market resolves to Yes.</p>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                            {rulesInnerTab === 'aggregation' && (
                                                <div className="space-y-4 text-sm text-zinc-300 leading-relaxed max-w-xl">
                                                    <p>Core identity matches: both markets ask who will win the 2025-26 NBA Eastern Conference Finals (same subject and same core proposition — tournament winner).</p>
                                                    <p>Participant-name differences (e.g. Cleveland vs Cleveland Cavaliers) do not change the event identity. Resolution/end date differences are deadlines, not identity dates, so they do not prevent a match. Therefore this candidate refers to the same real-world event.</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-3 min-w-0">
                                            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-2">
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                Compatibility
                                            </h3>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 bg-emerald-500/10 p-1.5 rounded text-emerald-400">
                                                        <ShieldCheck className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-zinc-200">Canonical Compatibility</div>
                                                        <ul className="text-xs text-zinc-400 mt-2 space-y-2">
                                                            <li className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>Exact-compatible across 3 venues</li>
                                                            <li className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>Semantically compatible wording</li>
                                                            <li className="flex items-center gap-1.5"><VenueLogo id="predict" label="Predict.fun" className="h-3.5 w-3.5 rounded-full" />Review required for Predict</li>
                                                        </ul>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-zinc-800/80" />
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 bg-amber-500/10 p-1.5 rounded text-amber-400">
                                                        <AlertTriangle className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-zinc-200">High Resolution Risk Flagged</div>
                                                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">This market relies on a single source of truth. Inaccurate reporting may affect payout.</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5 bg-blue-500/10 p-1.5 rounded text-blue-400">
                                                        <Activity className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-zinc-200">Liquidity Warning</div>
                                                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Order book depth is currently under $50,000 on the bid side.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {bottomTab === 'Positions' && (
                    <div className="flex w-full flex-col gap-2">
                      {accountLoading && <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold text-zinc-400">Refreshing verified positions...</div>}
                      {accountError && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200">{accountError}</div>}
                      {positions.length === 0 && emptyCopy('No positions', accountEmptyCopy)}
                      {positions.map((position) => (
                        <div key={position.positionId} className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-5 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <VenueLogo id={normalizeVenueId(position.venue)} label={formatVenueLabel(position.venue)} className="h-7 w-7 rounded-full" />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-zinc-100">{formatVenueLabel(position.venue)} position</div>
                                <div className="mt-0.5 text-xs font-medium text-zinc-500">{position.outcomeId} - {position.status}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-6 text-right">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Size</div>
                                <div className="font-mono text-sm font-black text-white">{formatCompactMetric(position.verifiedSize) ?? position.verifiedSize}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entry</div>
                                <div className="font-mono text-sm font-black text-white">{formatProbabilityPrice(position.averageEntryPrice)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Sellable</div>
                                <div className="font-mono text-sm font-black text-emerald-400">{formatCompactMetric(position.sellableSize) ?? position.sellableSize}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                )}
                {bottomTab === 'Open Orders' && (
                    <div className="flex w-full flex-col gap-2">
                      {accountLoading && <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold text-zinc-400">Refreshing open orders...</div>}
                      {accountError && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200">{accountError}</div>}
                      {openOrders.length === 0 && emptyCopy('No open orders', accountEmptyCopy)}
                      {openOrders.map((order) => (
                        <div key={order.executionId} className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-5 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-zinc-100">{order.openStatus}</div>
                              <div className="mt-0.5 truncate text-xs font-medium text-zinc-500">{order.executionId}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-6 text-right">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Route</div>
                                <div className="text-xs font-bold text-zinc-200">{order.route?.venuePath?.map(formatVenueLabel).join(' / ') || 'Pending'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Price</div>
                                <div className="font-mono text-sm font-black text-white">{formatProbabilityPrice(order.route?.expectedPrice)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Updated</div>
                                <div className="text-xs font-bold text-zinc-300">{formatDateTime(order.updatedAt ?? order.submittedAt)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                )}
                {bottomTab === 'Trade History' && (
                    <div className="flex w-full flex-col gap-2">
                      {accountLoading && <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold text-zinc-400">Refreshing trade history...</div>}
                      {accountError && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200">{accountError}</div>}
                      {tradeHistory.length === 0 && emptyCopy('No trade history', accountEmptyCopy)}
                      {tradeHistory.map((execution) => (
                        <div key={execution.executionId} className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-5 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-zinc-100">{execution.userStatus ?? execution.status ?? 'Submitted'}</div>
                              <div className="mt-0.5 truncate text-xs font-medium text-zinc-500">{execution.executionId}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-6 text-right">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Route</div>
                                <div className="text-xs font-bold text-zinc-200">{execution.route?.venuePath?.map(formatVenueLabel).join(' / ') || 'Pending'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Settlement</div>
                                <div className="text-xs font-bold text-zinc-300">{execution.settlementStatus ?? 'Pending'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Updated</div>
                                <div className="text-xs font-bold text-zinc-300">{formatDateTime(execution.updatedAt ?? execution.submittedAt)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                )}
                {false && bottomTab !== 'Outcomes' && bottomTab !== 'Rules & Risk' && (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-widest relative">
                       {/* Subtle Background Pattern */}
                       <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#3f3f46 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                       <span className="relative z-10 bg-[#121214] px-4">{bottomTab} module initializing...</span>
                    </div>
                )}
             </div>
         </div>
      </div>

      {/* Right Panel: Trade Ticket & Account */}
      <div className="w-[clamp(380px,21vw,460px)] flex flex-col gap-2 2xl:gap-3 shrink-0 overflow-y-auto custom-scrollbar">
         {/* Trade Block */}
         <div className="bg-[#121214] border border-zinc-800 rounded-xl flex flex-col shrink-0 min-h-0 transition-all duration-300">
             <div className="flex justify-between items-center p-3 border-b border-zinc-800/80">
                 <div className="flex gap-4 items-center pl-2">
                     <button onClick={() => setSide('buy')} className={`pb-1 text-sm font-bold transition-colors ${side === 'buy' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Buy</button>
                     <button onClick={() => setSide('sell')} className={`pb-1 text-sm font-bold transition-colors ${side === 'sell' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Sell</button>
                 </div>
                 <button onClick={() => setOrderType(orderType === 'market' ? 'limit' : 'market')} className="text-zinc-300 text-xs font-semibold flex items-center gap-1 hover:text-white pr-2">
                     {orderType === 'market' ? 'Market' : 'Limit'} <ChevronDown className="w-3.5 h-3.5" />
                 </button>
             </div>

             {side === 'buy' ? (
                 <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300">
                     <div className="grid grid-cols-2 gap-3">
                         <button className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg">
                             YES {selectedOutcome?.yesPrice ?? 'Quote'}
                         </button>
                         <button className="bg-transparent border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors text-lg">
                             NO {selectedOutcome?.noPrice ?? 'Quote'}
                         </button>
                     </div>

                     <div className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-3 relative group focus-within:border-zinc-700 transition-colors">
                         <div className="text-[10px] text-zinc-500 font-medium mb-1.5">Contracts</div>
                         <div className="flex items-center justify-between">
                             <input type="text" className="bg-transparent border-none text-white text-2xl font-bold font-mono outline-none w-full" placeholder="0" defaultValue="1000" />
                             <div className="text-[10px] text-zinc-500 whitespace-nowrap">Min. Order 0.01 USDC</div>
                         </div>
                     </div>

                     <div className="flex flex-col gap-2">
                         <div className="flex justify-end gap-1.5">
                             <button className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-xs font-semibold transition-colors">25%</button>
                             <button className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-xs font-semibold transition-colors">50%</button>
                             <button className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-xs font-semibold transition-colors">MAX</button>
                         </div>
                         <div className="text-right text-[11px] text-zinc-500">
                             Available Balance: <span className="font-bold text-white">0 Contracts</span>
                         </div>
                     </div>

                     <div className="flex flex-col gap-2">
                         <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-emerald-500/20" onClick={() => setOrderAction(orderAction === 'preview' ? 'setup' : 'preview')}>
                             <div className="flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                 <span className="text-[11px] font-bold text-emerald-400 tracking-wide uppercase">Smart Route Active</span>
                             </div>
                             <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">Preview Route <ChevronRight className={`w-3.5 h-3.5 transition-transform ${orderAction === 'preview' ? 'translate-x-1' : ''}`}/></span>
                         </div>
                         
                         {orderAction === 'preview' && (
                             <div className="bg-[#0c0c0e] border border-emerald-500/20 rounded-lg p-3 animate-in slide-in-from-top-2 duration-300 space-y-3 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                                 <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                                     <div className="flex items-center gap-1.5">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-[10px] font-bold text-zinc-300 tracking-wide">Resolution Risk: Safe</span>
                                     </div>
                                     <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest font-mono font-bold">Multi-Lane</span>
                                 </div>
                                 
                                 <div className="flex items-center gap-1 font-mono text-[9px]">
                                     <div className="flex-1 bg-[#121214] border border-zinc-800 rounded p-1.5 text-center flex flex-col justify-center">
                                        <div className="text-zinc-500 w-max mx-auto mb-0.5 text-[8px] tracking-wider uppercase font-sans font-bold">Fill 1</div>
                                        <div className="flex items-center justify-center gap-1 text-blue-400 font-bold tracking-tighter">
                                           <VenueLogo id="poly" label="Polymarket" className="h-3 w-3 rounded-full" /> POLY <span className="text-white ml-0.5 font-medium">60%</span>
                                        </div>
                                        <div className="text-zinc-400 mt-1 pb-0.5 border-b border-zinc-800 border-dashed w-max mx-auto text-[10px]">26.0¢</div>
                                     </div>
                                     <div className="flex items-center justify-center text-zinc-600">
                                         <ChevronRight className="w-3 h-3" />
                                     </div>
                                     <div className="flex-1 bg-[#121214] border border-emerald-500/40 rounded p-1.5 text-center flex flex-col justify-center shadow-[0_0_10px_rgba(16,185,129,0.1)] relative">
                                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full border border-[#121214] animate-pulse"></div>
                                        <div className="text-zinc-500 w-max mx-auto mb-0.5 text-[8px] tracking-wider uppercase font-sans font-bold">Fill 2</div>
                                        <div className="flex items-center justify-center gap-1 text-emerald-400 font-bold tracking-tighter">
                                           <VenueLogo id="limitless" label="Limitless" className="h-3 w-3 rounded-full" /> LIMITLESS <span className="text-white ml-0.5 font-medium">20%</span>
                                        </div>
                                        <div className="text-zinc-400 mt-1 pb-0.5 border-b border-zinc-800 border-dashed w-max mx-auto text-[10px]">26.5¢</div>
                                     </div>
                                     <div className="flex items-center justify-center text-zinc-600">
                                         <ChevronRight className="w-3 h-3" />
                                     </div>
                                     <div className="flex-1 bg-[#121214] border border-purple-500/40 rounded p-1.5 text-center flex flex-col justify-center shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                                        <div className="text-zinc-500 w-max mx-auto mb-0.5 text-[8px] tracking-wider uppercase font-sans font-bold">Fill 3</div>
                                        <div className="flex items-center justify-center gap-1 text-purple-400 font-bold tracking-tighter">
                                           <VenueLogo id="predict" label="Predict.fun" className="h-3 w-3 rounded-full" /> PREDICT <span className="text-white ml-0.5 font-medium">20%</span>
                                        </div>
                                        <div className="text-zinc-400 mt-1 pb-0.5 border-b border-zinc-800 border-dashed w-max mx-auto text-[10px]">26.9¢</div>
                                     </div>
                                 </div>
                                 
                                 <div className="bg-[#ccff00]/10 border border-[#ccff00]/20 rounded p-1.5 text-center flex items-center justify-center gap-1.5">
                                    <span className="text-[#ccff00] font-bold text-[10px]">Lotus Advantage: +$24.50</span>
                                    <span className="text-zinc-400 text-[9px]">(vs. Single Venue)</span>
                                 </div>
                             </div>
                         )}
                     </div>

                     <div className="h-px bg-zinc-800/80 -mx-4 my-0.5"></div>

                     <div className="flex justify-between items-center px-1">
                         <div className="flex flex-col gap-0.5">
                             <div className="flex items-center gap-1 text-[11px] font-bold text-zinc-300">
                                 To Win: <Info className="w-3.5 h-3.5 text-zinc-500" />
                             </div>
                             <div className="text-[10px] font-medium text-zinc-500">Avg. Price: 26.2¢</div>
                         </div>
                         <div className="font-mono text-xl font-black text-emerald-500 flex items-baseline gap-1">
                             1,000 <span className="text-[10px] font-sans font-bold text-emerald-600">USDC</span>
                         </div>
                     </div>

                     <button className="w-full bg-[#ccff00] hover:bg-[#b0dc00] text-black font-bold py-3.5 rounded-lg text-sm transition-colors mt-2 shadow-[0_0_15px_rgba(204,255,0,0.15)]">
                         Place Order
                     </button>
                     
                     {/* Advanced Execution Toggles */}
                     <div className="grid grid-cols-2 gap-2 pt-1">
                         <button onClick={() => setGhostFill(!ghostFill)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[10px] uppercase font-bold transition-all ${ghostFill ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400' : 'bg-[#0c0c0e] border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700'}`}>
                             <Ghost className={`w-3 h-3 ${ghostFill ? 'animate-pulse' : ''}`} /> GHOST FILL
                         </button>
                         <button onClick={() => setFastLane(!fastLane)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[10px] uppercase font-bold transition-all ${fastLane ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' : 'bg-[#0c0c0e] border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700'}`}>
                             <Zap className={`w-3 h-3 ${fastLane ? 'text-amber-400' : ''}`} /> FAST LANE
                         </button>
                     </div>
                 </div>
             ) : (
                 <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300">
                     <div className="grid grid-cols-2 gap-3">
                         <button className="bg-transparent border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors text-lg">
                             YES {selectedOutcome?.yesPrice ?? 'Quote'}
                         </button>
                         <button className="bg-[#E52B50] hover:bg-[#ff3366] text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg">
                             NO {selectedOutcome?.noPrice ?? 'Quote'}
                         </button>
                     </div>
                     
                     <div className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-3 relative group focus-within:border-zinc-700 transition-colors">
                         <div className="text-[10px] text-zinc-500 font-medium mb-1.5 flex justify-between">
                             <span>Amount to Sell</span>
                             <span className="text-[#ccff00] cursor-pointer hover:underline">Sell by Venue</span>
                         </div>
                         <div className="flex items-center justify-between">
                             <input type="text" className="bg-transparent border-none text-white text-2xl font-bold font-mono outline-none w-full" placeholder="0" defaultValue="1,000" />
                             <div className="text-[10px] text-zinc-500 whitespace-nowrap">Contracts</div>
                         </div>
                     </div>

                     <div className="flex justify-end gap-1.5 mt-[-6px]">
                         <button className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-[10px] font-semibold transition-colors">25%</button>
                         <button className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-[10px] font-semibold transition-colors">50%</button>
                         <button className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-[10px] font-semibold transition-colors">100%</button>
                         <button className="px-3 py-1 bg-[#ccff00]/10 border border-[#ccff00]/30 hover:bg-[#ccff00]/20 text-[#ccff00] rounded text-[10px] font-bold transition-colors">SELL ALL</button>
                     </div>
                     
                     {/* Venue customization */}
                     <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded-lg p-3 space-y-3">
                         <div className="flex justify-between text-[10px] text-zinc-400 font-medium pb-2 border-b border-zinc-800/50 uppercase tracking-widest">
                            <span>Customize Venues</span>
                            <span className="text-zinc-600">Max</span>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                             <span className="flex items-center gap-1.5 text-blue-400 font-bold uppercase tracking-wider text-[11px]">
                                <VenueLogo id="poly" label="Polymarket" className="h-3.5 w-3.5 rounded-full" /> Poly
                             </span>
                             <div className="flex gap-2 items-center">
                                <input type="number" className="w-16 bg-[#121214] border border-zinc-800 rounded px-2 py-1 text-right text-white font-mono text-[11px] focus:border-[#ccff00] outline-none" defaultValue="600" />
                                <span className="text-zinc-600 font-mono text-[10px]">/ 600</span>
                             </div>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                             <span className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
                                <VenueLogo id="limitless" label="Limitless" className="h-3.5 w-3.5 rounded-full" /> Limitless
                             </span>
                             <div className="flex gap-2 items-center">
                                <input type="number" className="w-16 bg-[#121214] border border-zinc-800 rounded px-2 py-1 text-right text-white font-mono text-[11px] focus:border-[#ccff00] outline-none" defaultValue="400" />
                                <span className="text-zinc-600 font-mono text-[10px]">/ 5,000</span>
                             </div>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                             <span className="flex items-center gap-1.5 text-purple-400 font-bold uppercase tracking-wider text-[11px]">
                                <VenueLogo id="predict" label="Predict.fun" className="h-3.5 w-3.5 rounded-full" /> Predict
                             </span>
                             <div className="flex gap-2 items-center">
                                <input type="number" className="w-16 bg-[#121214] border border-zinc-800 rounded px-2 py-1 text-right text-zinc-500 font-mono text-[11px] outline-none disabled:opacity-50" placeholder="0" disabled />
                                <span className="text-zinc-600 font-mono text-[10px]">/ 0</span>
                             </div>
                         </div>
                     </div>

                     <div className="flex flex-col gap-2">
                         <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-emerald-500/20" onClick={() => setOrderAction(orderAction === 'preview' ? 'setup' : 'preview')}>
                             <div className="flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                 <span className="text-[11px] font-bold text-emerald-400 tracking-wide uppercase">Smart Route Active</span>
                             </div>
                             <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">Preview Route <ChevronRight className={`w-3.5 h-3.5 transition-transform ${orderAction === 'preview' ? 'translate-x-1' : ''}`}/></span>
                         </div>
                         
                         {orderAction === 'preview' && (
                             <div className="bg-[#0c0c0e] border border-emerald-500/20 rounded-lg p-3 animate-in slide-in-from-top-2 duration-300 space-y-3 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                                 <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                                     <div className="flex items-center gap-1.5">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-[10px] font-bold text-zinc-300 tracking-wide">Resolution Risk: Safe</span>
                                     </div>
                                     <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest font-mono font-bold">Multi-Lane</span>
                                 </div>
                                 
                                 <div className="flex items-center gap-1 font-mono text-[9px]">
                                     <div className="flex-1 bg-[#121214] border border-zinc-800 rounded p-1.5 text-center flex flex-col justify-center">
                                        <div className="text-zinc-500 w-max mx-auto mb-0.5 text-[8px] tracking-wider uppercase font-sans font-bold">Fill 1</div>
                                        <div className="flex items-center justify-center gap-1 text-blue-400 font-bold tracking-tighter">
                                           <VenueLogo id="poly" label="Polymarket" className="h-3 w-3 rounded-full" /> POLY <span className="text-white ml-0.5 font-medium">60%</span>
                                        </div>
                                        <div className="text-zinc-400 mt-1 pb-0.5 border-b border-zinc-800 border-dashed w-max mx-auto text-[10px]">93.5¢</div>
                                     </div>
                                     <div className="flex items-center justify-center text-zinc-600">
                                         <ChevronRight className="w-3 h-3" />
                                     </div>
                                     <div className="flex-1 bg-[#121214] border border-emerald-500/40 rounded p-1.5 text-center flex flex-col justify-center shadow-[0_0_10px_rgba(16,185,129,0.1)] relative">
                                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full border border-[#121214] animate-pulse"></div>
                                        <div className="text-zinc-500 w-max mx-auto mb-0.5 text-[8px] tracking-wider uppercase font-sans font-bold">Fill 2</div>
                                        <div className="flex items-center justify-center gap-1 text-emerald-400 font-bold tracking-tighter">
                                           <VenueLogo id="limitless" label="Limitless" className="h-3 w-3 rounded-full" /> LIMITLESS <span className="text-white ml-0.5 font-medium">40%</span>
                                        </div>
                                        <div className="text-zinc-400 mt-1 pb-0.5 border-b border-zinc-800 border-dashed w-max mx-auto text-[10px]">94.2¢</div>
                                     </div>
                                 </div>
                                 
                                 <div className="bg-[#ccff00]/10 border border-[#ccff00]/20 rounded p-1.5 text-center flex items-center justify-center gap-1.5">
                                    <span className="text-[#ccff00] font-bold text-[10px]">Lotus Advantage: +$18.20</span>
                                    <span className="text-zinc-400 text-[9px]">(vs. Single Venue)</span>
                                 </div>
                             </div>
                         )}
                     </div>

                     <div className="h-px bg-zinc-800/80 -mx-4 my-0.5"></div>

                     <div className="flex justify-between items-center px-1">
                         <div className="flex flex-col gap-0.5">
                             <div className="flex items-center gap-1 text-[11px] font-bold text-zinc-300">
                                 To Receive: <Info className="w-3.5 h-3.5 text-zinc-500" />
                             </div>
                             <div className="text-[10px] font-medium text-zinc-500">Effective Price: 94.2¢</div>
                         </div>
                         <div className="font-mono text-xl font-black text-[#E52B50] flex items-baseline gap-1">
                             942 <span className="text-[10px] font-sans font-bold text-[#E52B50]/70">USDC</span>
                         </div>
                     </div>

                     <button className="w-full bg-[#E52B50] hover:bg-[#ff3366] text-white font-bold py-3.5 rounded-lg text-sm transition-colors mt-2 shadow-[0_0_15px_rgba(229,43,80,0.15)]">
                         Sell Shares
                     </button>
                     
                     {/* Advanced Execution Toggles */}
                     <div className="grid grid-cols-2 gap-2 pt-1">
                         <button onClick={() => setGhostFill(!ghostFill)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[10px] uppercase font-bold transition-all ${ghostFill ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400' : 'bg-[#0c0c0e] border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700'}`}>
                             <Ghost className={`w-3 h-3 ${ghostFill ? 'animate-pulse' : ''}`} /> GHOST FILL
                         </button>
                         <button onClick={() => setFastLane(!fastLane)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[10px] uppercase font-bold transition-all ${fastLane ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' : 'bg-[#0c0c0e] border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700'}`}>
                             <Zap className={`w-3 h-3 ${fastLane ? 'text-amber-400' : ''}`} /> FAST LANE
                         </button>
                     </div>
                 </div>
             )}
         </div>

         <div className="bg-[#121214] border border-zinc-800 rounded-xl p-3 2xl:p-4 flex flex-col gap-3 min-h-[250px] shrink-0">
             <div className="flex items-start justify-between gap-3">
                 <div>
                     <div className="flex items-center gap-2">
                         <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                         <h3 className="text-sm font-black text-white">Open Position</h3>
                     </div>
                     <p className="mt-1 text-[10px] text-zinc-500">Auto-refreshes after verified venue fills</p>
                 </div>
                 <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-300">
                     live
                 </span>
             </div>

             <div className="rounded-xl border border-[#ccff00]/20 bg-[#ccff00]/[0.055] p-3">
                 <div className="flex items-end justify-between gap-3">
                     <div>
                         <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Unified PNL</p>
                         <div className="mt-1 font-mono text-2xl font-black text-emerald-400">{positionVenueRows.length ? 'Portfolio MTM' : 'No position'}</div>
                     </div>
                     <div className="text-right">
                         <p className="text-[10px] font-semibold text-zinc-500">{totalVerifiedSize > 0 ? `${formatCompactMetric(totalVerifiedSize)} verified` : 'Verified fills only'}</p>
                         <p className="mt-1 text-[10px] font-semibold text-zinc-400">Avg {formatProbabilityPrice(averageEntry)} - {selectedOutcome?.name ?? 'Select outcome'}</p>
                     </div>
                 </div>
                 <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-zinc-900">
                     {positionVenueRows.length ? positionVenueRows.slice(0, 4).map((row, index) => (
                       <div key={row.venue} className={`h-full ${index === 0 ? 'bg-blue-500' : index === 1 ? 'bg-[#ccff00]' : index === 2 ? 'bg-purple-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(12, 100 / positionVenueRows.length)}%` }} />
                     )) : <div className="h-full w-full bg-zinc-800" />}
                 </div>
             </div>

             <div className="space-y-2">
                 {positionVenueRows.length === 0 && (
                     <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] px-3 py-3 text-xs font-medium text-zinc-500">
                         {accountEmptyCopy}
                     </div>
                 )}
                 {positionVenueRows.map((row) => (
                     <div key={row.venue} className="rounded-lg border border-zinc-800 bg-[#0c0c0e] px-3 py-2">
                         <div className="flex items-center justify-between gap-3">
                             <div className="flex min-w-0 items-center gap-2">
                                 <VenueLogo id={row.logo} label={row.venue} className="h-5 w-5 rounded-full" />
                                 <div className="min-w-0">
                                     <p className="truncate text-xs font-bold text-zinc-200">{row.venue}</p>
                                     <p className="text-[10px] font-medium text-zinc-500">{row.fill} of route • {row.shares} shares</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className={`font-mono text-sm font-black ${row.pnlTone}`}>{row.pnl}</p>
                                 <p className="text-[10px] text-zinc-500">{row.avgEntry} → {row.mark}</p>
                             </div>
                         </div>
                     </div>
                 ))}
             </div>

             <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2 text-[10px] leading-relaxed text-zinc-500">
                 Positions appear after verified fills. Unified PNL rolls up venue-level PNL across the routed venues.
             </div>
         </div>



      </div>
      </div>

    </div>
  );
};
