import React, { useEffect, useMemo, useState } from 'react';
import { LotusLogo } from '@/components/icons/lotus-icons';
import { VenueLogo } from '@/components/icons/asset-logo';
import { InfraTradingTerminal, type TerminalMarketSelection } from '@/design/mockups/InfraTradingTerminal';
import { PortfolioMockupV2 } from '@/design/mockups/PortfolioMockupV2';
import type { AuthSession } from '@/features/auth/types';
import { listMarkets, type MarketCatalogMarket } from '@/features/markets/api/market-api';
import { getNotifications, markNotificationRead, type UserNotification } from '@/features/notifications/api/notification-api';
import { getLiveCandidates, type LiveCandidatesResponse, type TradeRouteCandidate } from '@/features/trading/api/execution-api';
import { ApiClientError } from '@/lib/api/http-client';
import { 
  Search, Bell, Home, BarChart2, ArrowRightLeft, 
  Zap, PieChart, Activity, Settings, ChevronDown, ChevronUp,
  ShieldCheck, AlertTriangle, Clock, ChevronRight,
  Flame, Globe, Cpu, MessageSquare, ChevronsLeft, ChevronsRight,
  Square, CheckSquare, Star, Sparkles, Trophy, Database, Filter, Sun, Moon, Vault, Volleyball, Landmark, Terminal,
  LayoutGrid, List, Bookmark, Radio, CheckCircle2, Wallet
} from 'lucide-react';

const Badge = ({ children, variant = 'default', className = '' }: any) => {
  const variants: any = {
    default: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700',
    success: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
    warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    danger: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
    lotus: 'bg-[#ccff00]/20 dark:bg-[#ccff00]/10 text-zinc-900 dark:text-[#ccff00] border border-[#ccff00]/50 dark:border-[#ccff00]/30',
    dark: 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export type LotusAppPage = 'home' | 'markets' | 'terminal' | 'portfolio';

type DashboardOutcomeRow = {
  id: string;
  name: string;
  prob: string;
  liveStatus?: 'live' | 'unavailable' | 'not_requested';
};

type DashboardMarketRow = Pick<TerminalMarketSelection, 'title' | 'category' | 'icon' | 'volume' | 'venueCount' | 'routeType'> & {
  id: string;
  marketId: string;
  eventId?: string;
  venues: string[];
  marketType: 'binary' | 'multi';
  marketClass: string;
  status: MarketCatalogMarket['status'];
  outcomes: DashboardOutcomeRow[];
  imageUrl: string | null;
  iconUrl: string | null;
  priceLabel: string;
  changeLabel: string;
  savings: string;
  spread: string;
  fallbackLabel: string;
  closesBy: string;
  quoteRequired: boolean;
  prob: number | null;
  change: string | null;
  txnBuy: number;
  txnSell: number;
  badges: string[];
};

type DashboardOutcomeQuote = {
  outcomeId: string;
  price: number | null;
  priceLabel: string;
  generatedAt: string | null;
  bestCandidate: TradeRouteCandidate | null;
  candidates: TradeRouteCandidate[];
  blocked: LiveCandidatesResponse['blocked'];
  blocker: string | null;
};

type DashboardMarketQuote = {
  marketId: string;
  outcomes: Record<string, DashboardOutcomeQuote>;
};

const categoryIconFallback: Record<string, string> = {
  sports: 'L',
  politics: 'L',
  crypto: 'L',
  esports: 'L',
  finance: 'L',
};

const routeTypeLabel = (market: MarketCatalogMarket): string => {
  if (market.routeability.hasCrossVenue) return market.venueCount >= 3 ? 'Tri' : 'Pair';
  return 'Single';
};

const formatTitleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getSafeMediaUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const formatMarketDate = (value: string | null | undefined): string => {
  if (!value) return 'TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'TBD';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const normalizeVenueId = (venue: string): string => venue.toLowerCase().replace(/[\s._-]+/g, '_');

const normalizeOutcomeId = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '_');

const formatProbabilityPrice = (price: number | null | undefined): string => {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 'Quote';
  const cents = price <= 1 ? price * 100 : price;
  if (cents < 1) return '<1¢';
  return `${cents >= 10 ? cents.toFixed(0) : cents.toFixed(1)}¢`;
};

const formatAvailableSize = (candidate: TradeRouteCandidate | null): string => {
  if (!candidate) return 'Backend catalog';
  const size = Number(candidate.availableSize);
  if (!Number.isFinite(size) || size <= 0) return 'Top book';
  if (size >= 1000) return `${(size / 1000).toFixed(size >= 10000 ? 0 : 1)}k top`;
  return `${size.toFixed(size >= 10 ? 0 : 2)} top`;
};

const formatSpreadBps = (candidate: TradeRouteCandidate | null): string => {
  if (!candidate || typeof candidate.spreadBps !== 'number' || !Number.isFinite(candidate.spreadBps)) return 'Top-of-book';
  return `${(candidate.spreadBps / 100).toFixed(2)}%`;
};

const chooseBestCandidate = (candidates: TradeRouteCandidate[]): TradeRouteCandidate | null => (
  [...candidates]
    .filter((candidate) => Number.isFinite(candidate.price))
    .sort((left, right) => left.price - right.price)[0] ?? null
);

const getReadableBlocker = (blocked: LiveCandidatesResponse['blocked']): string | null => {
  const reason = blocked.find((item) => item.reason)?.reason;
  return reason ? reason.replace(/[_-]+/g, ' ').toLowerCase() : null;
};

const mapCatalogMarketToDashboardRow = (market: MarketCatalogMarket): DashboardMarketRow => {
  const venues = Array.from(new Set((market.venues.length ? market.venues : market.venueMarkets.map((item) => item.venue)).map(normalizeVenueId)));
  const routeType = routeTypeLabel(market);
  const marketId = market.canonicalMarketIds[0] ?? market.canonicalEventId;
  const marketClass = formatTitleCase(market.marketClass || 'Market');
  const category = formatTitleCase(market.category || 'Market');
  const outcomeByLabel = new Map<string, DashboardOutcomeRow>();
  for (const venueMarket of market.venueMarkets) {
    for (const outcome of venueMarket.outcomes) {
      const label = outcome.label?.trim();
      if (!label || outcomeByLabel.has(label.toLowerCase())) continue;
      outcomeByLabel.set(label.toLowerCase(), {
        id: outcome.id || normalizeOutcomeId(label),
        name: label,
        prob: 'Quote',
        liveStatus: 'not_requested',
      });
    }
  }
  const outcomeRows = Array.from(outcomeByLabel.values())
    .sort((left, right) => {
      const order = ['YES', 'NO'];
      const leftIndex = order.indexOf(normalizeOutcomeId(left.name));
      const rightIndex = order.indexOf(normalizeOutcomeId(right.name));
      if (leftIndex === -1 && rightIndex === -1) return 0;
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    })
    .slice(0, 4);

  return {
    id: marketId,
    marketId,
    eventId: market.eventId ?? market.canonicalEventId,
    title: market.title,
    category: `${category} - ${marketClass}`,
    icon: categoryIconFallback[market.category.toLowerCase()] ?? 'L',
    volume: 'Backend catalog',
    venueCount: market.venueCount,
    routeType,
    venues,
    marketType: market.outcomeCount > 2 ? 'multi' : 'binary',
    marketClass,
    status: market.status,
    outcomes: outcomeRows.length > 0
      ? outcomeRows
      : [{ id: 'OUTCOMES', name: 'Outcomes load in terminal', prob: 'Quote', liveStatus: 'not_requested' }],
    imageUrl: getSafeMediaUrl(market.imageUrl),
    iconUrl: getSafeMediaUrl(market.iconUrl),
    priceLabel: 'Quote',
    changeLabel: 'Quote required',
    savings: 'Quote required',
    spread: 'Quote required',
    fallbackLabel: routeType === 'Single' ? 'Single venue' : 'Route preview',
    closesBy: formatMarketDate(market.expiresAt ?? market.resolvesAt),
    quoteRequired: true,
    prob: null,
    change: null,
    txnBuy: 0,
    txnSell: 0,
    badges: venues,
  };
};

const blockedFromError = (error: unknown): LiveCandidatesResponse['blocked'] => {
  if (!(error instanceof ApiClientError) || !error.payload || typeof error.payload !== 'object') return [];
  const blocked = (error.payload as { blocked?: unknown }).blocked;
  if (!Array.isArray(blocked)) return [];
  return blocked
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const venue = typeof record.venue === 'string' ? record.venue : 'UNKNOWN';
      const reason = typeof record.reason === 'string' ? record.reason : 'QUOTE_UNAVAILABLE';
      return {
        venue,
        reason,
        ...(typeof record.venueMarketId === 'string' ? { venueMarketId: record.venueMarketId } : {}),
        ...(typeof record.venueOutcomeId === 'string' ? { venueOutcomeId: record.venueOutcomeId } : {}),
      };
    })
    .filter((item): item is LiveCandidatesResponse['blocked'][number] => item !== null);
};

const toOutcomeQuote = (
  outcomeId: string,
  response: LiveCandidatesResponse | null,
  error?: unknown
): DashboardOutcomeQuote => {
  const candidates = response?.candidates ?? [];
  const blocked = response?.blocked ?? blockedFromError(error);
  const bestCandidate = chooseBestCandidate(candidates);
  return {
    outcomeId,
    price: bestCandidate?.price ?? null,
    priceLabel: formatProbabilityPrice(bestCandidate?.price),
    generatedAt: response?.generatedAt ?? null,
    bestCandidate,
    candidates,
    blocked,
    blocker: getReadableBlocker(blocked),
  };
};

const applyLiveQuoteToMarket = (market: DashboardMarketRow, quote: DashboardMarketQuote | undefined): DashboardMarketRow => {
  if (!quote) return market;
  const quotedOutcomes = market.outcomes.map((outcome) => {
    const liveQuote = quote.outcomes[outcome.id] ?? quote.outcomes[normalizeOutcomeId(outcome.name)];
    if (!liveQuote) return outcome;
    return {
      ...outcome,
      prob: liveQuote.price !== null ? liveQuote.priceLabel : 'Unavailable',
      liveStatus: liveQuote.price !== null ? 'live' as const : 'unavailable' as const,
    };
  });
  const liveQuotes = quotedOutcomes
    .map((outcome) => quote.outcomes[outcome.id] ?? quote.outcomes[normalizeOutcomeId(outcome.name)])
    .filter((item): item is DashboardOutcomeQuote => Boolean(item?.bestCandidate));
  const firstLiveQuote = liveQuotes[0] ?? null;
  if (!firstLiveQuote) {
    const unavailable = quotedOutcomes.some((outcome) => outcome.liveStatus === 'unavailable');
    return {
      ...market,
      outcomes: quotedOutcomes,
      changeLabel: unavailable ? 'Live unavailable' : market.changeLabel,
      fallbackLabel: unavailable ? 'Backend blocker' : market.fallbackLabel,
      quoteRequired: true,
    };
  }
  return {
    ...market,
    outcomes: quotedOutcomes,
    priceLabel: firstLiveQuote.priceLabel,
    changeLabel: 'Live top-of-book',
    savings: 'Quote in terminal',
    spread: formatSpreadBps(firstLiveQuote.bestCandidate),
    fallbackLabel: firstLiveQuote.bestCandidate?.venue ?? market.fallbackLabel,
    volume: formatAvailableSize(firstLiveQuote.bestCandidate),
    quoteRequired: false,
  };
};

const toSafeErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};

const formatRelativeTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const mapNotificationForDashboard = (notification: UserNotification) => {
  switch (notification.severity) {
    case 'success':
      return { Icon: CheckCircle2, tone: 'text-emerald-500', ring: 'bg-emerald-500/10 border-emerald-500/20', meta: notification.targetKind ?? notification.type };
    case 'warning':
      return { Icon: AlertTriangle, tone: 'text-amber-400', ring: 'bg-amber-500/10 border-amber-500/20', meta: notification.targetKind ?? notification.type };
    case 'error':
      return { Icon: AlertTriangle, tone: 'text-red-400', ring: 'bg-red-500/10 border-red-500/20', meta: notification.targetKind ?? notification.type };
    default:
      return { Icon: Clock, tone: 'text-sky-400', ring: 'bg-sky-500/10 border-sky-500/20', meta: notification.targetKind ?? notification.type };
  }
};

export const DashboardV2Mockup = ({
  activePage = 'home',
  onNavigate,
  session,
}: {
  activePage?: LotusAppPage;
  onNavigate?: (page: LotusAppPage) => void;
  session?: AuthSession | null;
}) => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [marketViewMode, setMarketViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTerminalMarket, setSelectedTerminalMarket] = useState<TerminalMarketSelection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [marketRows, setMarketRows] = useState<DashboardMarketRow[]>([]);
  const [marketQuotes, setMarketQuotes] = useState<Record<string, DashboardMarketQuote>>({});
  const [marketCount, setMarketCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationItems, setNotificationItems] = useState<UserNotification[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Sports': true,
    'Politics': true,
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const pageTitle = activePage === 'markets' ? 'Markets' : 'Top Opportunities';
  const effectiveMarketViewMode = activePage === 'markets' ? 'list' : marketViewMode;
  const isMarketSurface = activePage === 'home' || activePage === 'markets';
  const baseDisplayedMarkets = activePage === 'home' ? marketRows.slice(0, 6) : marketRows;
  const displayedMarkets = baseDisplayedMarkets.map((market) => applyLiveQuoteToMarket(market, marketQuotes[market.id]));
  const marketSummary = useMemo(() => {
    const quotedRows = marketRows.map((market) => applyLiveQuoteToMarket(market, marketQuotes[market.id]));
    const crossVenue = quotedRows.filter((market) => market.routeType !== 'Single').length;
    const routePreviewRequired = quotedRows.filter((market) => market.quoteRequired).length;
    return {
      routeable: marketCount || marketRows.length,
      crossVenue,
      routePreviewRequired,
    };
  }, [marketCount, marketRows, marketQuotes]);
  const inferTerminalMarketType = (title: string): 'binary' | 'multi' => (
    title.includes('Winner') || title.includes('Champion') || title.includes('Region') || title.includes('Season')
      ? 'multi'
      : 'binary'
  );
  const openMarketInTerminal = (market: Pick<TerminalMarketSelection, 'title' | 'category' | 'icon' | 'volume' | 'venueCount' | 'routeType'> & Partial<TerminalMarketSelection>) => {
    setSelectedTerminalMarket({
      ...market,
      marketType: market.marketType ?? inferTerminalMarketType(market.title),
    });
    onNavigate?.('terminal');
  };

  useEffect(() => {
    if (!isMarketSurface) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMarketsLoading(true);
      setMarketsError(null);
      listMarkets({
        search: searchQuery.trim() || undefined,
        limit: activePage === 'markets' ? 80 : 18,
      })
        .then((response) => {
          if (cancelled) return;
          setMarketRows(response.markets.map(mapCatalogMarketToDashboardRow));
          setMarketCount(response.count);
        })
        .catch((error) => {
          if (cancelled) return;
          setMarketsError(toSafeErrorMessage(error, 'Market catalog is unavailable right now.'));
          setMarketRows([]);
          setMarketCount(0);
        })
        .finally(() => {
          if (!cancelled) setMarketsLoading(false);
        });
    }, searchQuery.trim() ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activePage, isMarketSurface, searchQuery]);

  useEffect(() => {
    if (!isMarketSurface || !session?.userJwt || marketRows.length === 0) {
      setMarketQuotes({});
      return;
    }

    let cancelled = false;
    const marketsToQuote = marketRows
      .slice(0, activePage === 'markets' ? 12 : 6)
      .map((market) => ({
        market,
        outcomes: market.outcomes
          .filter((outcome) => ['YES', 'NO'].includes(normalizeOutcomeId(outcome.name)))
          .slice(0, 2),
      }))
      .filter((item) => item.outcomes.length > 0);

    if (marketsToQuote.length === 0) {
      setMarketQuotes({});
      return;
    }

    const loadQuotes = async () => {
      const entries = await Promise.all(marketsToQuote.map(async ({ market, outcomes }) => {
        const outcomeEntries = await Promise.all(outcomes.map(async (outcome) => {
          try {
            const response = await getLiveCandidates(session.userJwt, {
              side: 'buy',
              marketId: market.marketId,
              outcomeId: outcome.id,
              amount: '1',
            });
            return [outcome.id, toOutcomeQuote(outcome.id, response)] as const;
          } catch (error) {
            return [outcome.id, toOutcomeQuote(outcome.id, null, error)] as const;
          }
        }));
        return [market.id, { marketId: market.marketId, outcomes: Object.fromEntries(outcomeEntries) }] as const;
      }));

      if (cancelled) return;
      setMarketQuotes((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    };

    loadQuotes();
    const interval = window.setInterval(loadQuotes, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activePage, isMarketSurface, marketRows, session?.userJwt]);

  useEffect(() => {
    if (!session?.userJwt) return;
    let cancelled = false;
    setNotificationsLoading(true);
    setNotificationsError(null);
    getNotifications(session.userJwt, { limit: 8 })
      .then((response) => {
        if (!cancelled) setNotificationItems(response.items);
      })
      .catch((error) => {
        if (!cancelled) setNotificationsError(toSafeErrorMessage(error, 'Notifications are unavailable right now.'));
      })
      .finally(() => {
        if (!cancelled) setNotificationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.userJwt]);

  const handleReadNotification = (notification: UserNotification) => {
    if (!session?.userJwt || notification.readAt) return;
    setNotificationItems((items) =>
      items.map((item) => item.notificationId === notification.notificationId ? { ...item, readAt: new Date().toISOString() } : item)
    );
    markNotificationRead(session.userJwt, notification.notificationId).catch(() => {
      setNotificationItems((items) =>
        items.map((item) => item.notificationId === notification.notificationId ? { ...item, readAt: null } : item)
      );
    });
  };

  const unreadNotificationCount = notificationItems.filter(item => item.readAt === null).length;

  return (
    <div className={`${isDarkMode ? 'dark' : ''} w-full h-full`}>
      <div className="flex h-screen w-full bg-[#F7F8FA] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
        {/* Sidebar */}
      <aside className="w-12 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col items-center gap-6 z-50 shrink-0 pb-14 pt-4">
        <div className="w-7 h-7 flex items-center justify-center">
          <LotusLogo className="w-7 h-7 text-[#ccff00]" />
        </div>
        <nav className="flex flex-col gap-5 w-full items-center">
          <NavItem icon={<Home className="w-4 h-4" />} active={activePage === 'home'} label="Home" onClick={() => onNavigate?.('home')} />
          <NavItem icon={<BarChart2 className="w-4 h-4" />} active={activePage === 'markets'} label="Markets" onClick={() => onNavigate?.('markets')} />
          <NavItem icon={<Terminal className="w-4 h-4" />} active={activePage === 'terminal'} label="Terminal" onClick={() => onNavigate?.('terminal')} />
          <NavItem icon={<Volleyball className="w-4 h-4" />} label="Matchroom" />
          <NavItem icon={<PieChart className="w-4 h-4" />} active={activePage === 'portfolio'} label="Portfolio" onClick={() => onNavigate?.('portfolio')} />
        </nav>
        <div className="mt-auto flex flex-col gap-5 w-full items-center">
          <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-4 w-full max-w-sm">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search markets, events, or venues..." 
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full bg-zinc-100/80 dark:bg-zinc-800/80 border border-transparent rounded-full pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:bg-white dark:focus:bg-zinc-900 focus:border-zinc-300 dark:focus:border-zinc-700 focus:ring-4 focus:ring-zinc-100 dark:focus:ring-zinc-800 transition-all text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 pr-72">
            <div className="flex items-center gap-3">
              <div className="relative">
                <button 
                  type="button"
                  aria-label="Open notifications"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotificationCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900"></span>
                  )}
                  
                  {/* Tooltip */}
                  {!showNotifications && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 bg-zinc-800 dark:bg-zinc-700 text-white text-[11px] font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                      Notifications
                    </div>
                  )}
                </button>

                {/* Popover */}
                {showNotifications && (
                  <div className="absolute top-full right-0 mt-3 w-[21rem] bg-white dark:bg-[#1a1a1c] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200 block">
                    <div className="flex items-center justify-between p-3.5 border-b border-zinc-200 dark:border-zinc-800/80">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Notifications</h3>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-500">Execution, orders, and funding readiness</p>
                      </div>
                      <span className="rounded-full bg-[#ccff00]/15 px-2 py-0.5 text-[10px] font-bold text-[#7a9900] dark:text-[#ccff00]">
                        {unreadNotificationCount} new
                      </span>
                    </div>
                    <div className="max-h-[22rem] overflow-y-auto p-2 bg-zinc-50/80 dark:bg-transparent custom-scrollbar">
                      {notificationsLoading && (
                        <div className="space-y-2 p-1">
                          {[0, 1, 2].map((item) => (
                            <div key={item} className="h-20 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70 animate-pulse" />
                          ))}
                        </div>
                      )}
                      {!notificationsLoading && notificationsError && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                          {notificationsError}
                        </div>
                      )}
                      {!notificationsLoading && !notificationsError && notificationItems.length === 0 && (
                        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                          No notifications yet. Execution, funding, and readiness updates will appear here once the backend creates them.
                        </div>
                      )}
                      {!notificationsLoading && !notificationsError && notificationItems.map(item => {
                        const display = mapNotificationForDashboard(item);
                        const Icon = display.Icon;
                        return (
                          <button
                            key={item.notificationId}
                            type="button"
                            onClick={() => handleReadNotification(item)}
                            className="group/notice flex w-full items-start gap-3 rounded-lg border border-transparent p-2.5 text-left transition-colors hover:border-zinc-200 hover:bg-white dark:hover:border-zinc-700 dark:hover:bg-zinc-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                          >
                            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${display.ring}`}>
                              <Icon className={`h-4 w-4 ${display.tone}`} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100">{item.title}</span>
                                <span className="shrink-0 text-[10px] font-mono text-zinc-400">{formatRelativeTime(item.createdAt)}</span>
                              </span>
                              <span className="mt-1 block text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                                {item.body}
                              </span>
                              <span className="mt-2 inline-flex rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
                                {display.meta}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 xl:p-5 custom-scrollbar flex gap-4">
          {isMarketSurface ? (
          <>
          
          {/* Left Column: Filters & Intelligence */}
          <div className={`shrink-0 flex flex-col gap-5 hidden xl:flex transition-all duration-300 ${isFilterCollapsed ? 'w-11 border-transparent' : 'w-56 pr-4 border-zinc-200 dark:border-zinc-800'} border-r`}>
            {isFilterCollapsed ? (
              <button 
                onClick={() => setIsFilterCollapsed(false)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-colors"
                title="Expand Filters"
              >
                <Filter className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-52">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Filter by</h3>
                  <button 
                    onClick={() => setIsFilterCollapsed(true)}
                    className="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Collapse Filters"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                </div>
              
              <div className="space-y-4">
                {/* Route Quality */}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between p-3 bg-zinc-50/50 dark:bg-zinc-800/50">
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Route Quality</h4>
                  </div>
                  <div className="p-3 pt-0 space-y-1.5 flex flex-col text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="w-4 h-4 rounded border border-[#ccff00] bg-[#ccff00]/10 flex items-center justify-center text-[#99cc00]">✓</div>
                      <span className="group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">Best Opportunities</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400 dark:group-hover:border-zinc-500 bg-white dark:bg-zinc-900 flex items-center justify-center transition-colors"></div>
                      <span className="group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">Best Routes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400 dark:group-hover:border-zinc-500 bg-white dark:bg-zinc-900 flex items-center justify-center transition-colors"></div>
                      <span className="group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">Review Required</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400 dark:group-hover:border-zinc-500 bg-white dark:bg-zinc-900 flex items-center justify-center transition-colors"></div>
                      <span className="group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">Fallback Available</span>
                    </label>
                  </div>
                </div>

                {/* Route Type */}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between p-3 cursor-pointer bg-zinc-50/50 dark:bg-zinc-800/50" onClick={() => toggleCategory('RouteType')}>
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Route Type</h4>
                    {expandedCategories['RouteType'] !== false ? <ChevronUp className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />}
                  </div>
                  {expandedCategories['RouteType'] !== false && (
                    <div className="p-3 pt-0 flex flex-wrap gap-2">
                       <button className="px-3 py-1.5 border border-[#ccff00]/50 bg-[#ccff00]/10 text-zinc-900 dark:text-zinc-100 rounded-lg text-xs font-medium shadow-sm transition-all">Pair</button>
                       <button className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg text-xs font-medium shadow-sm transition-all">Single</button>
                       <button className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg text-xs font-medium shadow-sm transition-all">Tri</button>
                    </div>
                  )}
                </div>

                {/* Confidence */}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between p-3 cursor-pointer bg-zinc-50/50 dark:bg-zinc-800/50" onClick={() => toggleCategory('Confidence')}>
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Confidence</h4>
                    {expandedCategories['Confidence'] !== false ? <ChevronUp className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />}
                  </div>
                  {expandedCategories['Confidence'] !== false && (
                    <div className="p-3 pt-0 flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400 dark:group-hover:border-zinc-500 bg-white dark:bg-zinc-900 flex items-center justify-center transition-colors"></div>
                        <span className="text-xs group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">Exact Match</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400 dark:group-hover:border-zinc-500 bg-white dark:bg-zinc-900 flex items-center justify-center transition-colors"></div>
                        <span className="text-xs group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">Semantic Match</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400 dark:group-hover:border-zinc-500 bg-white dark:bg-zinc-900 flex items-center justify-center transition-colors"></div>
                        <span className="text-xs group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">Under Review</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Categories */}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between p-3 bg-zinc-50/50 dark:bg-zinc-800/50">
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Categories</h4>
                  </div>
                  
                  <div className="p-3 pt-0 space-y-4">
                      {/* Sports */}
                      <div>
                        <div className="flex items-center justify-between mb-2 cursor-pointer group" onClick={() => toggleCategory('Sports')}>
                          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                            {expandedCategories['Sports'] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span className="text-sm font-medium">Sports</span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer group/label" onClick={(e) => e.stopPropagation()}>
                            <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover/label:border-zinc-400 dark:group-hover/label:border-zinc-500 flex items-center justify-center bg-white dark:bg-zinc-900 transition-colors"></div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover/label:text-zinc-700 dark:group-hover/label:text-zinc-300 transition-colors">Select all</span>
                          </label>
                        </div>
                        
                        {expandedCategories['Sports'] && (
                          <div className="flex flex-wrap gap-2 pl-5">
                            {['American Football', 'Basketball', 'Baseball', 'Combat Sports', 'Golf', 'Motor Sports', 'Cricket', 'Rugby', 'Soccer', 'Tennis', 'Hockey'].map((cat) => (
                              <button key={cat} className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all">
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Politics */}
                      <div>
                        <div className="flex items-center justify-between mb-2 cursor-pointer group" onClick={() => toggleCategory('Politics')}>
                          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                            {expandedCategories['Politics'] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span className="text-sm font-medium">Politics</span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer group/label" onClick={(e) => e.stopPropagation()}>
                            <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700 group-hover/label:border-zinc-400 dark:group-hover/label:border-zinc-500 flex items-center justify-center bg-white dark:bg-zinc-900 transition-colors"></div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover/label:text-zinc-700 dark:group-hover/label:text-zinc-300 transition-colors">Select all</span>
                          </label>
                        </div>
                        
                        {expandedCategories['Politics'] && (
                          <div className="flex flex-wrap gap-2 pl-5">
                            {['Conflicts', 'Economic Policy', 'Elections', 'Geopolitics', 'Immigration', 'Government Policy', 'World', 'US Politics', 'Military Affairs', 'World Politics', 'Diplomatic Relations'].map((cat) => (
                              <button key={cat} className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all">
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Business */}
                      <div>
                        <div className="flex items-center justify-between mb-2 cursor-pointer group" onClick={() => toggleCategory('Business')}>
                          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span className="text-sm font-medium">Business</span>
                            <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">2</span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer group/label" onClick={(e) => e.stopPropagation()}>
                            <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 group-hover/label:border-zinc-400 dark:group-hover/label:border-zinc-500 flex items-center justify-center bg-white dark:bg-zinc-900 transition-colors"></div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover/label:text-zinc-700 dark:group-hover/label:text-zinc-300 transition-colors">Select all</span>
                          </label>
                        </div>
                      </div>
                      
                      {/* Cryptocurrency */}
                      <div>
                        <div className="flex items-center justify-between mb-2 cursor-pointer group" onClick={() => toggleCategory('Cryptocurrency')}>
                          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span className="text-sm font-medium">Cryptocurrency</span>
                            <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">4</span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer group/label" onClick={(e) => e.stopPropagation()}>
                            <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 group-hover/label:border-zinc-400 dark:group-hover/label:border-zinc-500 flex items-center justify-center bg-white dark:bg-zinc-900 transition-colors"></div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover/label:text-zinc-700 dark:group-hover/label:text-zinc-300 transition-colors">Select all</span>
                          </label>
                        </div>
                      </div>

                      {/* Health service */}
                      <div>
                        <div className="flex items-center justify-between mb-2 cursor-pointer group" onClick={() => toggleCategory('Health service')}>
                          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span className="text-sm font-medium">Health service</span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer group/label" onClick={(e) => e.stopPropagation()}>
                            <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 group-hover/label:border-zinc-400 dark:group-hover/label:border-zinc-500 flex items-center justify-center bg-white dark:bg-zinc-900 transition-colors"></div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover/label:text-zinc-700 dark:group-hover/label:text-zinc-300 transition-colors">Select all</span>
                          </label>
                        </div>
                      </div>

                      {/* Technology */}
                      <div>
                        <div className="flex items-center justify-between mb-2 cursor-pointer group" onClick={() => toggleCategory('Technology')}>
                          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span className="text-sm font-medium">Technology</span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer group/label" onClick={(e) => e.stopPropagation()}>
                            <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 group-hover/label:border-zinc-400 dark:group-hover/label:border-zinc-500 flex items-center justify-center bg-white dark:bg-zinc-900 transition-colors"></div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover/label:text-zinc-700 dark:group-hover/label:text-zinc-300 transition-colors">Select all</span>
                          </label>
                        </div>
                      </div>
                    </div>
                </div>

                <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800"></div>

                {/* Sortby */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Sortby</span>
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 bg-white dark:bg-zinc-900">
                    Volume <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                  </div>
                </div>

                {/* Lookback period */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Lookback period</span>
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 bg-white dark:bg-zinc-900">
                    30m <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                  </div>
                </div>

                <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800"></div>

                {/* Volume */}
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between p-3 cursor-pointer bg-zinc-50/50 dark:bg-zinc-800/50" onClick={() => toggleCategory('Volume')}>
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Volume</h4>
                    {expandedCategories['Volume'] !== false ? <ChevronUp className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />}
                  </div>
                  {expandedCategories['Volume'] !== false && (
                    <div className="p-3 pt-0 flex flex-wrap gap-2">
                      <button className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all">
                        &gt; $10k
                      </button>
                      <button className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all">
                        &gt; $50k
                      </button>
                      <button className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all">
                        &gt; $100k
                      </button>
                      <button className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all">
                        &gt; $250k
                      </button>
                      <button className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all">
                        Custom
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Center Column: Main Feed */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            
            {/* Quick Filters */}
            <div className="flex items-center flex-wrap gap-3 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Grid view"
                  onClick={() => setMarketViewMode('grid')}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] ${marketViewMode === 'grid' ? 'border-[#ccff00]/45 bg-[#ccff00]/10 text-[#ccff00]' : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  onClick={() => setMarketViewMode('list')}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] ${marketViewMode === 'list' ? 'border-[#ccff00]/45 bg-[#ccff00]/10 text-[#ccff00]' : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
              <button className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm transition-all hover:border-[#ccff00]/40 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-[#ccff00]/40">
                <Bookmark className="h-4 w-4 text-zinc-500 dark:text-zinc-400" /> Watchlist
              </button>
              <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-white p-0.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <button className="h-8 rounded-lg bg-[#ccff00] px-4 text-sm font-bold text-black shadow-[0_0_18px_rgba(204,255,0,0.18)]">
                  Events
                </button>
                <button className="h-8 rounded-lg px-4 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                  Markets
                </button>
              </div>
              <button className="flex h-10 items-center rounded-full bg-[#ccff00] px-4 text-sm font-bold text-black shadow-[0_0_18px_rgba(204,255,0,0.16)]">
                All
              </button>
              <button className="relative flex h-10 items-center gap-2 rounded-full border border-[#ccff00]/45 bg-[#ccff00]/10 px-4 text-sm font-semibold text-[#ccff00] transition hover:bg-[#ccff00]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]">
                <span className="absolute -top-2.5 right-1 rounded bg-[#ccff00] px-1.5 py-0.5 text-[9px] font-black leading-none text-black">SOON</span>
                <Radio className="h-4 w-4" /> Live Crypto
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-zinc-900 dark:bg-zinc-100 border border-zinc-900 dark:border-zinc-100 rounded-lg text-sm font-medium text-white dark:text-zinc-900 shadow-sm transition-all whitespace-nowrap">
                <Flame className="w-4 h-4 text-orange-500" /> Trending
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-[#ccff00]/10 border border-[#ccff00]/30 rounded-lg text-sm font-medium text-zinc-900 dark:text-[#ccff00] hover:bg-[#ccff00]/20 transition-all whitespace-nowrap">
                <ArrowRightLeft className="w-4 h-4 text-[#99cc00]" /> Best Routes
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all whitespace-nowrap">
                <Trophy className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> Sports
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all whitespace-nowrap">
                <Database className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> Crypto
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all whitespace-nowrap">
                <Landmark className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> Politics
              </button>
            </div>

            {/* Hero Market */}
            <div className="relative hidden w-full rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex-col md:flex-row">
              {/* Background abstract pattern */}
              <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
              
              <div className="flex-1 p-8 lg:p-10 flex flex-col justify-center relative z-10">
                <div className="flex items-center gap-3 mb-5">
                  <Badge variant="dark" className="px-2.5 py-1">Politics</Badge>
                  <Badge variant="success" className="px-2.5 py-1 bg-emerald-50/80 dark:bg-emerald-900/30 backdrop-blur-sm"><ShieldCheck className="w-3 h-3 mr-1.5"/> Canonical Match</Badge>
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 ml-2"><Clock className="w-3.5 h-3.5"/> Resolves Nov 5, 2028</span>
                </div>
                
                <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4 leading-[1.15] tracking-tight">
                  Will Gavin Newsom be the US 2028 Democratic Nominee?
                </h1>
                
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-xl leading-relaxed font-medium">
                  Lotus canonical event aggregating underlying contracts across Polymarket and Limitless.
                  Smart routing enabled with private LP liquidity available for size &gt;$50k.
                </p>

                {/* Mini Chart Placeholder */}
                <div className="h-24 w-full max-w-xl mb-8 relative">
                  <div className="absolute inset-0 flex items-end justify-between px-1 pb-1">
                    <div className="w-full h-full flex items-end gap-1">
                      {[40, 42, 45, 43, 48, 52, 50, 55, 53, 58, 56, 60, 58, 62, 65, 63, 68, 65, 70, 68, 72, 70, 75, 73, 78, 76, 80, 78, 82, 80, 85, 83, 88, 85, 90, 88, 92, 90, 95, 93, 98, 95, 100].map((h, i) => (
                        <div key={i} className="flex-1 bg-emerald-500/10 rounded-t-sm relative group">
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-emerald-500/40 rounded-t-sm transition-all group-hover:bg-emerald-500" 
                            style={{ height: `${h}%` }}
                          ></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 text-[10px] font-mono text-zinc-400 dark:text-zinc-500">7D VOL: $4.2M</div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                  <button className="flex items-center justify-between w-full px-5 py-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl hover:border-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all group shadow-[0_4px_14px_0_rgba(16,185,129,0.1)]">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">Yes</span>
                    <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300 text-lg">48.2¢</span>
                  </button>
                  <button className="flex items-center justify-between w-full px-5 py-3.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl hover:border-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 transition-all group shadow-[0_4px_14px_0_rgba(239,68,68,0.1)]">
                    <span className="font-bold text-red-700 dark:text-red-400 text-lg">No</span>
                    <span className="font-mono font-bold text-red-800 dark:text-red-300 text-lg">51.8¢</span>
                  </button>
                </div>
              </div>
              
              {/* Right side graphic/data */}
              <div className="w-full md:w-80 bg-[#FAFAFA] dark:bg-zinc-800/50 border-l border-zinc-100 dark:border-zinc-800 p-8 flex flex-col justify-center relative z-10">
                <h4 className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-5">Execution Intelligence</h4>
                
                <div className="space-y-4">
                  <div className="bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/80 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Best Route</span>
                      <Badge variant="lotus" className="bg-[#ccff00]/10 dark:bg-[#ccff00]/20 border-[#ccff00]/30 dark:border-[#ccff00]/40 text-zinc-800 dark:text-zinc-200">Smart Split</Badge>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <VenueLogo id="polymarket" label="Polymarket" className="h-4 w-4 rounded" />
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Polymarket</span>
                        </div>
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">65%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 flex items-center justify-center text-[8px] font-bold text-purple-600 dark:text-purple-400">R</div>
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">RFQ (Private)</span>
                        </div>
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">35%</span>
                      </div>
                      
                      <div className="mt-1 pt-2 border-t border-zinc-100 dark:border-zinc-700 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Est. Savings</span>
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">+$42.50</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/80 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Liquidity Depth</span>
                      <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">$2.4M</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 w-[75%] rounded-full"></div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/80 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Order Book Depth</span>
                      <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">Spread: 3.6¢</span>
                    </div>
                    
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-purple-500 dark:text-purple-400">22.8¢</span>
                        <div className="flex-1 mx-3 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden flex justify-end">
                          <div className="h-full bg-purple-400/50 dark:bg-purple-500/50 w-[40%] rounded-full"></div>
                        </div>
                        <span className="text-zinc-500 dark:text-zinc-400">$12.4K</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-purple-500 dark:text-purple-400">23.0¢</span>
                        <div className="flex-1 mx-3 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden flex justify-end">
                          <div className="h-full bg-purple-400/50 dark:bg-purple-500/50 w-[65%] rounded-full"></div>
                        </div>
                        <span className="text-zinc-500 dark:text-zinc-400">$45.1K</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-blue-500 dark:text-blue-400">48.2¢</span>
                        <div className="flex-1 mx-3 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400/50 dark:bg-blue-500/50 w-[85%] rounded-full"></div>
                        </div>
                        <span className="text-zinc-500 dark:text-zinc-400">$82.5K</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-blue-500 dark:text-blue-400">48.0¢</span>
                        <div className="flex-1 mx-3 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400/50 dark:bg-blue-500/50 w-[30%] rounded-full"></div>
                        </div>
                        <span className="text-zinc-500 dark:text-zinc-400">$8.2K</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/80 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Resolution Risk</span>
                      <Badge variant="success" className="px-2">Low</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Markets List */}
            <div>
              <div className="flex items-center justify-between mb-5 relative z-10">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{pageTitle}</h3>
                <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-lg">
                  <button className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm transition-all shadow-zinc-200/50 dark:shadow-none">24H</button>
                  <button className="px-3 py-1.5 text-[11px] font-bold rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">7D</button>
                  <button className="px-3 py-1.5 text-[11px] font-bold rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">30D</button>
                  <button className="px-3 py-1.5 text-[11px] font-bold rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">ALL</button>
                </div>
              </div>
              
              {effectiveMarketViewMode === 'grid' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                {marketsLoading && displayedMarkets.length === 0 && [0, 1, 2, 3, 4, 5].map((item) => (
                  <MarketCardSkeleton key={item} />
                ))}
                {!marketsLoading && marketsError && (
                  <MarketGridMessage title="Markets unavailable" body={marketsError} />
                )}
                {!marketsLoading && !marketsError && displayedMarkets.length === 0 && (
                  <MarketGridMessage title="No markets found" body="Try another search. Lotus only shows backend-approved market metadata here." />
                )}
                {displayedMarkets.map((market) => (
                  <MarketCard
                    key={market.id}
                    {...market}
                    onOpenTerminal={openMarketInTerminal}
                  />
                ))}
                {false && <>
                <MarketCard
                  title="NBA Eastern Conference Champion"
                  category="Sports · Winner market"
                  venueCount={5}
                  routeType="Pair"
                  savings="$240.50"
                  spread="0.4¢"
                  fallback={true}
                  icon="🏆"
                  prob={26}
                  volume="$35.6M"
                  txnBuy={14205}
                  txnSell={8402}
                  badges={['polymarket', 'predict', 'limitless']}
                  change="4.5"
                  changeTrend="up"
                  onOpenTerminal={openMarketInTerminal}
                  outcomes={[
                    { name: 'Cleveland Cavaliers', prob: '26' },
                    { name: 'Detroit Pistons', prob: '15' },
                    { name: 'New York Knicks', prob: '14' },
                    { name: 'Philadelphia 76ers', prob: '4' },
                  ]}
                />
                <MarketCard
                  title="2026 NBA Champion"
                  category="Sports · Winner market"
                  venueCount={7}
                  routeType="Tri"
                  savings="$89.20"
                  spread="0.5¢"
                  fallback={true}
                  icon="🏆"
                  prob={51}
                  volume="$12.4M"
                  txnBuy={2301}
                  txnSell={1982}
                  badges={['polymarket', 'predict', 'opinion', 'limitless']}
                  change="2.1"
                  changeTrend="up"
                  onOpenTerminal={openMarketInTerminal}
                  outcomes={[
                    { name: 'Boston Celtics', prob: '12' },
                    { name: 'San Antonio Spurs', prob: '11' },
                    { name: 'Denver Nuggets', prob: '9' },
                    { name: 'Cleveland Cavaliers', prob: '5' },
                  ]}
                />
                <MarketCard
                  title="2026 FIFA World Cup Winner"
                  category="Sports · Winner market"
                  venueCount={4}
                  routeType="Single"
                  savings="$12.00"
                  spread="0.2¢"
                  fallback={false}
                  icon="⚽"
                  prob={16}
                  volume="$11.7M"
                  txnBuy={890}
                  txnSell={430}
                  badges={['polymarket', 'predict', 'opinion']}
                  change="1.2"
                  changeTrend="up"
                  onOpenTerminal={openMarketInTerminal}
                  outcomes={[
                    { name: 'France', prob: '16' },
                    { name: 'England', prob: '11' },
                    { name: 'Argentina', prob: '9' },
                    { name: 'Brazil', prob: '9' },
                  ]}
                />
                <MarketCard
                  title="LPL 2026 Season Winner"
                  category="Esports · Winner market"
                  venueCount={3}
                  routeType="Pair"
                  savings="$44.00"
                  spread="0.6¢"
                  fallback={true}
                  icon="🎮"
                  prob={55}
                  volume="$8.2M"
                  txnBuy={3512}
                  txnSell={2100}
                  badges={['polymarket', 'opinion', 'predict']}
                  change="3.5"
                  changeTrend="up"
                  onOpenTerminal={openMarketInTerminal}
                  outcomes={[
                    { name: 'Top Esports', prob: '15' },
                    { name: "Anyone's Legend", prob: '14' },
                    { name: 'JD Gaming', prob: '12' },
                    { name: 'Invictus Gaming', prob: '4' },
                  ]}
                />
                <MarketCard
                  title="Bank of Japan Decision in April?"
                  category="Finance · Binary"
                  venueCount={8}
                  routeType="Tri"
                  savings="$315.00"
                  spread="0.1¢"
                  fallback={true}
                  icon="🏦"
                  prob={97}
                  volume="$6.0M"
                  txnBuy={42010}
                  txnSell={12040}
                  badges={['polymarket', 'opinion', 'predict', 'limitless', 'myriad']}
                  change="1.8"
                  changeTrend="up"
                  onOpenTerminal={openMarketInTerminal}
                  outcomes={[
                    { name: 'Bank of Japan increases interest rates b...', prob: '2' },
                    { name: 'Bank of Japan increases interest rates b...', prob: '1' },
                    { name: 'Bank of Japan decreases interest rates a...', prob: '0' },
                  ]}
                />
                <MarketCard
                  title="Worlds 2026 Winning Region"
                  category="Esports · Winner market"
                  venueCount={6}
                  routeType="Pair"
                  savings="$58.20"
                  spread="0.7¢"
                  fallback={true}
                  icon="🌍"
                  prob={70}
                  volume="$5.9M"
                  txnBuy={1205}
                  txnSell={840}
                  badges={['polymarket', 'predict']}
                  change="2.8"
                  changeTrend="up"
                  onOpenTerminal={openMarketInTerminal}
                  outcomes={[
                    { name: 'team from LPL (China)', prob: '25' },
                    { name: 'team from LEC (Europe / EMEA)', prob: '10' },
                    { name: 'team from LCS (North America)', prob: '2' },
                    { name: 'team from CBLOL (Brazil)', prob: '1' },
                  ]}
                />
                </>}
              </div>
              ) : (
                <LotusMarketList
                  markets={displayedMarkets}
                  loading={marketsLoading}
                  error={marketsError}
                  onOpenMarket={openMarketInTerminal}
                />
              )}
            </div>

          </div>

          {/* Right Column: Portfolio & Activity */}
          <div className="w-64 shrink-0 flex flex-col gap-5 hidden 2xl:flex">
            {/* Today with Lotus */}
            <div className="bg-white dark:bg-[#121214] border border-[#ccff00]/30 rounded-2xl p-4 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#ccff00]/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-4">
                <LotusLogo className="w-4 h-4 text-[#99cc00]" /> Today with Lotus
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Routeable Opportunities</span>
                  <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{marketSummary.routeable}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Cross-Venue Markets</span>
                  <span className="text-xs font-mono font-bold text-[#99cc00]">{marketSummary.crossVenue}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Quote Required</span>
                  <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{marketSummary.routePreviewRequired}</span>
                </div>
              </div>
            </div>

            {/* Portfolio Summary */}
            <div className="bg-zinc-900 dark:bg-zinc-800 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden border border-transparent dark:border-zinc-700">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#ccff00]/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              
              <h3 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Portfolio</h3>
              <div className="flex items-end gap-2 mb-5">
                <span className="text-2xl font-bold tracking-tight">Backend-led</span>
                <span className="text-xs font-medium text-[#ccff00] mb-1">MTM</span>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">Available Cash</span>
                  <span className="text-xs font-mono font-medium">Open portfolio</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">Active Positions</span>
                  <span className="text-xs font-mono font-medium">Verified only</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recent Activity</h3>
              </div>
              
              <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-zinc-200 dark:before:bg-zinc-700">
                <ActivityItem 
                  type="route"
                  title="Market catalog synced"
                  market={`${marketSummary.routeable} backend-approved markets loaded`}
                  time={marketsLoading ? 'Loading' : 'Live'}
                  price=""
                />
                <ActivityItem 
                  type="route"
                  title="Route preview required"
                  market="Savings and spreads appear after backend quote evidence"
                  time="Safe"
                  price=""
                />
                <ActivityItem 
                  type="buy"
                  title="Open terminal"
                  market="Market clicks carry canonical IDs into the terminal"
                  time="Ready"
                  price=""
                />
              </div>
            </div>
          </div>
          </>
          ) : activePage === 'terminal' ? (
            <div className="min-w-0 flex-1">
              <InfraTradingTerminal embedded darkMode={isDarkMode} selectedMarket={selectedTerminalMarket} />
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <PortfolioMockupV2 />
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
};

const PositionCard = ({ title, outcome, shares, avgPrice, currentPrice, pnl, pnlPercent, isPositive }: any) => (
  <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer group">
    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-3 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">{title}</h4>
    
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Badge variant={isPositive ? 'success' : 'danger'} className="px-2">{outcome}</Badge>
        <span className="text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400">{shares} shares</span>
      </div>
      <div className="text-right">
        <div className={`text-xs font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{pnl}</div>
        <div className={`text-[10px] font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>{pnlPercent}</div>
      </div>
    </div>
    
    <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 font-medium pt-3 border-t border-zinc-100 dark:border-zinc-800">
      <span>Avg: <span className="font-mono text-zinc-900 dark:text-zinc-100">{avgPrice}</span></span>
      <span>Cur: <span className="font-mono text-zinc-900 dark:text-zinc-100">{currentPrice}</span></span>
    </div>
  </div>
);

const ActivityItem = ({ type, title, market, time, price }: any) => {
  const getIcon = () => {
    switch (type) {
      case 'buy': return <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border-2 border-white dark:border-zinc-900 flex items-center justify-center relative z-10"><ChevronRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /></div>;
      case 'sell': return <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 border-2 border-white dark:border-zinc-900 flex items-center justify-center relative z-10"><ChevronRight className="w-3 h-3 text-red-600 dark:text-red-400 rotate-180" /></div>;
      case 'route': return <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 border-2 border-white dark:border-zinc-900 flex items-center justify-center relative z-10"><ArrowRightLeft className="w-3 h-3 text-blue-600 dark:text-blue-400" /></div>;
      default: return <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center relative z-10"><Activity className="w-3 h-3 text-zinc-600 dark:text-zinc-400" /></div>;
    }
  };

  return (
    <div className="flex gap-3 relative">
      <div className="shrink-0 mt-0.5">{getIcon()}</div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between mb-0.5">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{title}</h4>
          {price && title !== 'Open terminal' && <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{price}</span>}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 pr-4">{market}</p>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap">{time}</span>
        </div>
      </div>
    </div>
  );
};

const marketListRows = [
  {
    title: 'NBA Eastern Conference Champion',
    category: 'Sports',
    routeType: 'Pair',
    venueCount: 5,
    venues: ['polymarket', 'predict', 'limitless'],
    icon: '🏆',
    prob: 26,
    change: '+4.5¢',
    strengthYes: 26,
    strengthNo: 74,
    volume: '$35.6M',
    txnBuy: 14205,
    txnSell: 8402,
    expires: 'Jun 13, 2026',
    spread: '0.4¢',
  },
  {
    title: '2026 NBA Champion',
    category: 'Sports',
    routeType: 'Tri',
    venueCount: 7,
    venues: ['polymarket', 'opinion', 'predict', 'limitless'],
    icon: '🏆',
    prob: 51,
    change: '+2.1¢',
    strengthYes: 51,
    strengthNo: 49,
    volume: '$12.4M',
    txnBuy: 2301,
    txnSell: 1982,
    expires: 'Jun 13, 2026',
    spread: '0.5¢',
  },
  {
    title: '2026 FIFA World Cup Winner',
    category: 'Sports',
    routeType: 'Single',
    venueCount: 4,
    venues: ['polymarket', 'predict', 'opinion'],
    icon: '⚽',
    prob: 16,
    change: '+1.2¢',
    strengthYes: 16,
    strengthNo: 84,
    volume: '$11.7M',
    txnBuy: 890,
    txnSell: 430,
    expires: 'Jul 20, 2026',
    spread: '0.2¢',
  },
  {
    title: 'LPL 2026 Season Winner',
    category: 'Esports',
    routeType: 'Pair',
    venueCount: 3,
    venues: ['polymarket', 'opinion', 'predict'],
    icon: '🎮',
    prob: 55,
    change: '+3.5¢',
    strengthYes: 55,
    strengthNo: 45,
    volume: '$8.2M',
    txnBuy: 3512,
    txnSell: 2100,
    expires: 'TBD',
    spread: '0.6¢',
  },
  {
    title: 'Bank of Japan Decision in April?',
    category: 'Finance',
    routeType: 'Tri',
    venueCount: 8,
    venues: ['polymarket', 'opinion', 'predict', 'limitless', 'myriad'],
    icon: '🏦',
    prob: 97,
    change: '+1.8¢',
    strengthYes: 97,
    strengthNo: 3,
    volume: '$6.0M',
    txnBuy: 42010,
    txnSell: 12040,
    expires: 'Apr 30, 2026',
    spread: '0.1¢',
  },
  {
    title: 'Worlds 2026 Winning Region',
    category: 'Esports',
    routeType: 'Pair',
    venueCount: 6,
    venues: ['polymarket', 'predict'],
    icon: '🌍',
    prob: 70,
    change: '+2.8¢',
    strengthYes: 70,
    strengthNo: 30,
    volume: '$5.9M',
    txnBuy: 1205,
    txnSell: 840,
    expires: 'Nov 8, 2026',
    spread: '0.7¢',
  },
];

const venueLabels: Record<string, string> = {
  polymarket: 'Polymarket',
  predict: 'Predict.fun',
  limitless: 'Limitless',
  opinion: 'Opinion',
  myriad: 'Myriad',
};

const VenueChip = ({ id, size = 'sm' }: { id: string; size?: 'xs' | 'sm' }) => {
  const label = venueLabels[id] ?? id;
  const dimensions = size === 'xs' ? 'h-4 w-4 rounded' : 'h-6 w-6 rounded-md';

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center border border-zinc-700/70 bg-zinc-900/80 p-0.5 shadow-sm ${dimensions}`}
    >
      <VenueLogo id={id} label={label} className="h-full w-full rounded-[inherit] object-cover" />
    </span>
  );
};

const MarketMediaThumb = ({
  title,
  icon,
  imageUrl,
  iconUrl,
  className = 'h-11 w-11 text-xl',
}: {
  title: string;
  icon: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  className?: string;
}) => {
  const mediaUrl = imageUrl ?? iconUrl;
  const [imageFailed, setImageFailed] = useState(false);
  const showMedia = mediaUrl && !imageFailed;

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 ${className}`}>
      {showMedia ? (
        <img
          src={mediaUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{icon}</span>
      )}
      <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ccff00] text-[9px] font-black text-black">L</span>
      <span className="sr-only">{title}</span>
    </span>
  );
};

const MarketCardSkeleton = () => (
  <div className="min-h-[260px] rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#121214]">
    <div className="flex gap-3">
      <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      </div>
    </div>
    <div className="mt-5 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
    <div className="mt-5 space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-4 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      ))}
    </div>
  </div>
);

const MarketGridMessage = ({ title, body }: { title: string; body: string }) => (
  <div className="col-span-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#121214]">
    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</div>
    <p className="mt-2 max-w-xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">{body}</p>
  </div>
);

const listMarketMeta = [
  { noPrice: '74¢', move: '+1.6%', closesBy: '36d 4h', sparkline: [36, 34, 39, 38, 41, 37, 35, 33, 36, 32, 31, 34] },
  { noPrice: '49¢', move: '+0.8%', closesBy: '36d 4h', sparkline: [45, 44, 46, 48, 47, 49, 51, 52, 50, 51, 52, 51] },
  { noPrice: '84¢', move: '0%', closesBy: '72d 3h', sparkline: [21, 20, 19, 18, 16, 17, 16, 15, 16, 15, 16, 16] },
  { noPrice: '45¢', move: '+1.9%', closesBy: '236d', sparkline: [44, 45, 43, 48, 46, 51, 49, 52, 50, 54, 53, 55] },
  { noPrice: '3¢', move: '-0.6%', closesBy: '21d 3h', sparkline: [98, 98, 97, 99, 98, 97, 98, 97, 96, 97, 97, 97] },
  { noPrice: '30¢', move: '+2.4%', closesBy: '184d', sparkline: [61, 60, 63, 65, 64, 66, 67, 66, 68, 69, 68, 70] },
];

const Sparkline = ({ points, positive }: { points: number[]; positive: boolean }) => {
  const width = 96;
  const height = 36;
  if (points.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-24 overflow-visible" aria-hidden="true">
        <path d={`M0,${height / 2} L${width},${height / 2}`} fill="none" stroke="#71717a" strokeDasharray="3 4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / range) * (height - 6) - 3;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-24 overflow-visible" aria-hidden="true">
      <path d={path} fill="none" stroke={positive ? '#10b981' : '#f43f5e'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={positive ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)'} />
    </svg>
  );
};

const LotusMarketList = ({
  markets,
  loading,
  error,
  onOpenMarket,
}: {
  markets: DashboardMarketRow[];
  loading: boolean;
  error: string | null;
  onOpenMarket?: (market: Pick<TerminalMarketSelection, 'title' | 'category' | 'icon' | 'volume' | 'venueCount' | 'routeType'> & Partial<TerminalMarketSelection>) => void;
}) => (
  <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#101012] shadow-sm">
    <div className="grid grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 border-b border-zinc-800 bg-zinc-900/80 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">
      <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-[#ccff00]" /> Market</div>
      <div>Last 7 Days</div>
      <div>Yes Price</div>
      <div>24h</div>
      <div>Volume 24h</div>
      <div>Closes By</div>
      <div>Spread</div>
      <div className="text-right">Trade</div>
    </div>
    <div className="divide-y divide-zinc-800">
      {loading && markets.length === 0 && [0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="grid grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 px-5 py-3.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((cell) => (
            <div key={cell} className="h-8 rounded bg-zinc-900 animate-pulse" />
          ))}
        </div>
      ))}
      {!loading && error && (
        <div className="px-5 py-6 text-sm font-medium text-amber-300">{error}</div>
      )}
      {!loading && !error && markets.length === 0 && (
        <div className="px-5 py-6 text-sm font-medium text-zinc-400">No backend-approved markets found for this search.</div>
      )}
      {markets.map((market) => (
        <div key={market.id} className="group grid grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#ccff00]/[0.035]">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70" aria-label={`Expand ${market.title}`}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70" aria-label={`Watch ${market.title}`} disabled>
              <Bookmark className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onOpenMarket?.(market)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012]"
              aria-label={`Open ${market.title} in terminal`}
            >
              <MarketMediaThumb title={market.title} icon={market.icon} imageUrl={market.imageUrl} iconUrl={market.iconUrl} className="h-11 w-11 text-xl" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-zinc-100 transition-colors group-hover:text-[#ccff00]">{market.title}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span>{market.category}</span>
                  <span>-</span>
                  <span>{market.routeType} route</span>
                  <span>-</span>
                  <span>{market.venueCount} venues</span>
                  <span className="flex items-center gap-1">
                    {market.venues.map((venue) => (
                      <VenueChip key={venue} id={venue} size="xs" />
                    ))}
                  </span>
                </span>
              </span>
            </button>
          </div>
          <Sparkline points={[]} positive={false} />
          <div className="font-mono">
            <div className="text-sm font-bold text-zinc-100">{market.priceLabel}</div>
            <div className="mt-1 text-[10px] font-semibold text-zinc-500">{market.changeLabel}</div>
          </div>
          <div className="font-mono text-xs font-bold text-zinc-500">Quote</div>
          <div>
            <div className="font-mono text-sm font-semibold text-zinc-100">{market.volume}</div>
            <div className="mt-1 font-mono text-[10px] text-zinc-500">
              <span className="text-emerald-500">Quote required</span>
            </div>
          </div>
          <div className="font-mono text-xs font-bold text-zinc-400">{market.closesBy}</div>
          <div className="font-mono text-sm font-semibold text-zinc-100">
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1">{market.spread}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onOpenMarket?.(market)} className="h-8 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70">Yes</button>
            <button type="button" onClick={() => onOpenMarket?.(market)} className="h-8 rounded-lg border border-red-500/60 bg-red-500/10 px-3 text-xs font-bold text-red-300 transition hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70">No</button>
          </div>
        </div>
      ))}
      {false && <>
      {marketListRows.map((market, index) => {
        const meta = listMarketMeta[index] ?? listMarketMeta[0];
        const positiveMove = !meta.move.startsWith('-');
        return (
          <div key={market.title} className="group grid grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#ccff00]/[0.035]">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70" aria-label={`Expand ${market.title}`}>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70" aria-label={`Watch ${market.title}`}>
                <Bookmark className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onOpenMarket?.(market)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012]"
                aria-label={`Open ${market.title} in terminal`}
              >
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-xl">
                  {market.icon}
                  <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ccff00] text-[9px] font-black text-black">L</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-100 transition-colors group-hover:text-[#ccff00]">{market.title}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span>{market.category}</span>
                  <span>•</span>
                  <span>{market.routeType} route</span>
                  <span>•</span>
                  <span>{market.venueCount} venues</span>
                  <span className="flex items-center gap-1">
                    {market.venues.map((venue) => (
                      <VenueChip key={venue} id={venue} size="xs" />
                    ))}
                  </span>
                  </span>
                </span>
              </button>
            </div>
            <Sparkline points={meta.sparkline} positive={positiveMove} />
            <div className="font-mono">
              <div className="text-sm font-bold text-zinc-100">{market.prob}¢</div>
              <div className="mt-1 text-[10px] font-semibold text-emerald-500">{market.change}</div>
            </div>
            <div className={`font-mono text-xs font-bold ${meta.move.startsWith('-') ? 'text-red-400' : meta.move === '0%' ? 'text-zinc-500' : 'text-emerald-400'}`}>
              {meta.move}
            </div>
            <div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{market.volume}</div>
              <div className="mt-1 font-mono text-[10px] text-zinc-500">
                <span className="text-emerald-500">{market.txnBuy.toLocaleString()} buys</span>
                <span className="mx-1">/</span>
                <span className="text-red-400">{market.txnSell.toLocaleString()} sells</span>
              </div>
            </div>
            <div className="font-mono text-xs font-bold text-zinc-400">{meta.closesBy}</div>
            <div className="font-mono text-sm font-semibold text-zinc-100">
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1">{market.spread}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button className="h-8 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20">Yes {market.prob}¢</button>
              <button className="h-8 rounded-lg border border-red-500/60 bg-red-500/10 px-3 text-xs font-bold text-red-300 transition hover:bg-red-500/20">No {meta.noPrice}</button>
            </div>
          </div>
        );
      })}
      </>}
    </div>
  </div>
);

const MarketListTable = () => (
  <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#101012]">
    <div className="grid grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 border-b border-zinc-200 bg-zinc-50/70 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-500">
      <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-[#ccff00]" /> Market</div>
      <div>Last 7 Days</div>
      <div>Yes Price</div>
      <div>24h</div>
      <div>Volume 24h</div>
      <div>Closes By</div>
      <div>Spread</div>
      <div className="text-right">Trade</div>
    </div>
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {marketListRows.map((market) => (
        <div key={market.title} className="group grid grid-cols-[minmax(340px,1.55fr)_120px_150px_112px_118px_112px_104px_104px] items-center gap-4 px-5 py-4 transition-colors hover:bg-[#ccff00]/[0.025] dark:hover:bg-[#ccff00]/[0.035]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-2xl dark:border-zinc-700 dark:bg-zinc-800">
              {market.icon}
              <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ccff00] text-[9px] font-black text-black">L</span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{market.title}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Star className="h-3.5 w-3.5 text-zinc-500" />
                <span>{market.category}</span>
                <span>•</span>
                <span>{market.venueCount} venues scanned</span>
                <span>•</span>
                <span>{market.expires}</span>
              </div>
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#ccff00]/30 bg-[#ccff00]/10 px-2.5 py-1 text-xs font-bold text-[#ccff00]">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {market.routeType}
            </div>
            <div className="mt-1 text-[10px] font-semibold text-emerald-500">{market.change} vs single</div>
          </div>
          <div className="flex items-center gap-1.5">
            {market.venues.map((venue) => (
              <VenueChip key={venue} id={venue} />
            ))}
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{market.prob}¢</div>
            <div className="mt-1 text-[10px] font-semibold text-zinc-500">best ask</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold">
              <span className="text-emerald-500">{market.strengthYes}%</span>
              <span className="text-zinc-500"> / </span>
              <span className="text-red-400">{market.strengthNo}%</span>
            </div>
            <div className="flex h-1 w-28 overflow-hidden rounded-full bg-zinc-800">
              <div className="bg-emerald-500" style={{ width: `${market.strengthYes}%` }} />
              <div className="bg-red-500" style={{ width: `${market.strengthNo}%` }} />
            </div>
          </div>
          <div>
            <div className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{market.volume}</div>
            <div className="mt-1 font-mono text-[10px] text-zinc-500">
              <span className="text-emerald-500">{market.txnBuy.toLocaleString()} buys</span>
              <span className="mx-1">/</span>
              <span className="text-red-400">{market.txnSell.toLocaleString()} sells</span>
            </div>
          </div>
          <div className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-900">{market.spread}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button className="h-8 w-8 rounded-lg bg-emerald-500 text-xs font-bold text-white transition hover:bg-emerald-400">Y</button>
            <button className="h-8 w-8 rounded-lg bg-red-500 text-xs font-bold text-white transition hover:bg-red-400">N</button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const NavItem = ({
  icon,
  active,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  active?: boolean;
  label?: string;
  onClick?: () => void;
}) => (
  <div className="relative group/nav z-50">
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`p-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] ${active ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-md' : 'text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
    >
      {icon}
    </button>
    {label && (
      <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-bold rounded-lg opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all whitespace-nowrap shadow-sm z-50 pointer-events-none">
        {label}
        <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-y-[4px] border-y-transparent border-r-[4px] border-r-zinc-900 dark:border-r-zinc-100"></div>
      </div>
    )}
  </div>
);

const MarketCard = ({ id, marketId, eventId, title, category, venueCount, routeType, savings, spread, fallback, fallbackLabel, icon, imageUrl, iconUrl, priceLabel, changeLabel, prob, change, volume, txnBuy, txnSell, badges = [], outcomes, marketType, onOpenTerminal }: any) => {
  const allVenues = [
    { id: 'polymarket', label: 'Polymarket' },
    { id: 'predict', label: 'Predict.fun' },
    { id: 'limitless', label: 'Limitless' },
    { id: 'opinion', label: 'Opinion' },
    { id: 'myriad', label: 'Myriad' }
  ];

  const displayPrice = priceLabel ?? (prob !== null && prob !== undefined ? `${prob}Â¢` : 'Quote');
  const displayChange = changeLabel ?? (change ? `+${change}Â¢ vs single venue` : 'Quote required');
  const buyCount = typeof txnBuy === 'number' ? txnBuy : 0;
  const sellCount = typeof txnSell === 'number' ? txnSell : 0;
  const totalCount = buyCount + sellCount;
  const fallbackText = fallbackLabel ?? (fallback ? 'Yes' : 'No');
  const terminalPayload = { id, marketId, eventId, title, category, icon, volume, venueCount, routeType, marketType, outcomes, imageUrl, iconUrl };

  return (
    <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex min-h-[260px] flex-col justify-between gap-3 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all group">
      
      {/* Header */}
      <div className="flex justify-between items-start">
        <button
          type="button"
          onClick={() => onOpenTerminal?.(terminalPayload)}
          className="flex min-w-0 flex-1 gap-3 items-start rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#121214]"
          aria-label={`Open ${title} in terminal`}
        >
          <MarketMediaThumb title={title} icon={icon} imageUrl={imageUrl} iconUrl={iconUrl} className="h-10 w-10 text-xl shadow-sm" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight mb-1 line-clamp-2 pr-2 transition-colors group-hover:text-[#5c7300] dark:group-hover:text-[#ccff00]">{title}</span>
            <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-2.5">
              {category} · {venueCount} venues scanned
            </span>
            <span className="flex gap-1.5 mb-3">
              {allVenues.map(v => {
                const isActive = badges.includes(v.id);
                return (
                  <span
                    key={v.id} 
                    title={v.label}
                    aria-label={v.label}
                    className={`flex h-5 w-5 items-center justify-center rounded border border-zinc-700/70 bg-zinc-900/80 p-0.5 shadow-sm transition ${isActive ? 'opacity-100' : 'opacity-25 grayscale'}`}
                  >
                    <VenueLogo id={v.id} label={v.label} className="h-full w-full rounded-[inherit] object-cover" />
                  </span>
                );
              })}
            </span>
          </span>
        </button>
        <div className="text-right shrink-0 ml-2">
          <div className="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100 leading-none mb-1">{displayPrice}</div>
          <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">{displayChange}</div>
        </div>
        <div className="hidden">
          <div className="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100 leading-none mb-1">{prob}¢</div>
          <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            +{change}¢ vs single venue
          </div>
        </div>
      </div>

      {/* Lotus Route Strip */}
      {routeType && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#ccff00]/5 border border-[#ccff00]/20 rounded-lg text-[10px] font-medium">
          <div className="flex items-center gap-3">
             <span className="text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Route:</span> {routeType}</span>
             <span className="text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Savings:</span> <span className="text-[#99cc00] font-bold">{savings}</span></span>
             {spread && <span className="text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Spread:</span> {spread}</span>}
          </div>
          <span className="text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Fallback:</span> {fallbackText}</span>
        </div>
      )}

      <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800/60 my-0.5"></div>

      {/* Outcomes */}
      {outcomes && outcomes.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {outcomes.map((outcome: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className="font-semibold text-zinc-600 dark:text-zinc-400 truncate pr-2 flex-1 text-xs">{outcome.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 w-12 text-right text-xs">{outcome.prob}{/^\d+(\.\d+)?$/.test(String(outcome.prob)) ? '%' : ''}</span>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => onOpenTerminal?.(terminalPayload)} className="w-9 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] transition-colors rounded font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70">Yes</button>
                  <button type="button" onClick={() => onOpenTerminal?.(terminalPayload)} className="w-9 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] transition-colors rounded font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70">No</button>
                </div>
              </div>
            </div>
          ))}
          
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400 py-1 mt-1 cursor-pointer hover:text-zinc-300 transition-colors">
            <span>Show more outcomes</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Footer / Buy Sell Txns */}
      <div className="pt-2 flex flex-col gap-2">
        <div className="flex items-center gap-3 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 pb-1">
          <span>Vol <span className="text-zinc-700 dark:text-zinc-300 font-mono">{volume}</span></span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {totalCount > 0 ? (
            <>
              <span className="text-emerald-600 dark:text-emerald-500/90">{buyCount.toLocaleString()} Buys</span>
              <span>-</span>
              <span className="text-red-600 dark:text-red-500/90">{sellCount.toLocaleString()} Sells</span>
            </>
          ) : (
            <span className="text-zinc-500">{priceLabel === 'Quote' ? 'Live quote required for order flow' : 'Backend live top-of-book'}</span>
          )}
        </div>
        <div className="hidden">
          <span className="text-emerald-600 dark:text-emerald-500/90">{txnBuy.toLocaleString()} Buys</span>
          <span>·</span>
          <span className="text-red-600 dark:text-red-500/90">{txnSell.toLocaleString()} Sells</span>
        </div>
        <div className="flex items-center gap-1.5 w-full">
          <div className="flex-1 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
            {totalCount > 0 ? (
              <>
                <div className="h-full bg-emerald-500" style={{ width: `${(buyCount / totalCount) * 100}%` }}></div>
                <div className="h-full bg-red-500" style={{ width: `${(sellCount / totalCount) * 100}%` }}></div>
              </>
            ) : (
              <div className="h-full w-full bg-zinc-300 dark:bg-zinc-700"></div>
            )}
          </div>
        </div>
        <div className="hidden">
          <div className="flex-1 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${(txnBuy / (txnBuy + txnSell)) * 100}%` }}></div>
            <div className="h-full bg-red-500" style={{ width: `${(txnSell / (txnBuy + txnSell)) * 100}%` }}></div>
          </div>
        </div>
      </div>

    </div>
  );
};
