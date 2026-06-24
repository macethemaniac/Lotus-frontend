import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTurnkey } from '@turnkey/react-wallet-kit';
import { OAuthProviders } from '@turnkey/sdk-types';
import { LotusLogo } from '@/components/icons/lotus-icons';
import { CryptoLogo, VenueLogo, resolveTopicAssetLogoId } from '@/components/icons/asset-logo';
import { InfraTradingTerminal, type TerminalMarketSelection } from '@/design/mockups/InfraTradingTerminal';
import { PortfolioMockupV2 } from '@/design/mockups/PortfolioMockupV2';
import { FundingDeposit } from '@/design/mockups/FundingDeposit';
import type { AuthSession } from '@/features/auth/types';
import {
  getMarket,
  getMarketBatchQuotes,
  getMarketLivePrices,
  listMarkets,
  type MarketBatchQuoteItem,
  type MarketCatalogMarket,
  type MarketLivePriceItem,
} from '@/features/markets/api/market-api';
import { getNotifications, markNotificationRead, type UserNotification } from '@/features/notifications/api/notification-api';
import { NotificationToast, type NotificationToastTone } from '@/features/notifications/components/notification-toast';
import { getExecutionHistory, getPortfolioSummary, type ExecutionStatus, type LiveCandidatesResponse, type PortfolioSummary, type TradeRouteCandidate } from '@/features/trading/api/execution-api';
import { getFundingHistory, getVenueBalances, type FundingHistoryRow, type VenueBalance } from '@/features/funding/api/funding-api';
import { ApiClientError } from '@/lib/api/http-client';
import { lotusMarketDiagnosticsEnabled } from '@/config/env';
import { 
  Search, Bell, Home, BarChart2, ArrowRightLeft, 
  Zap, PieChart, Activity, Settings, ChevronDown, ChevronUp,
  ShieldCheck, AlertTriangle, Clock, ChevronRight,
  Flame, Globe, Cpu, MessageSquare, ChevronsLeft, ChevronsRight,
  Square, CheckSquare, Star, Sparkles, Trophy, Database, Filter, Vault, Volleyball, Landmark, Terminal,
  LayoutGrid, List, Bookmark, Radio, CheckCircle2, Wallet, X
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

export type LotusAppPage = 'home' | 'markets' | 'terminal' | 'portfolio' | 'settings';

type DashboardOutcomeRow = {
  id: string;
  marketId: string;
  canonicalMarketIds?: string[];
  eventId?: string;
  canonicalEventId: string;
  quoteOutcomeId: string;
  name: string;
  prob: string;
  liveStatus?: 'live' | 'partial' | 'stale' | 'unavailable' | 'not_requested';
  venues?: string[];
  venueMarkets?: MarketCatalogMarket['venueMarkets'];
  marketType?: 'binary' | 'multi';
  marketTitle?: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  priceVenue?: string | null;
};

type DashboardMarketRow = Pick<TerminalMarketSelection, 'title' | 'category' | 'icon' | 'volume' | 'venueCount' | 'routeType'> & {
  id: string;
  marketId: string;
  canonicalMarketIds: string[];
  eventId?: string;
  canonicalEventId: string;
  venues: string[];
  venueMarkets: MarketCatalogMarket['venueMarkets'];
  marketType: 'binary' | 'multi';
  marketClass: string;
  status: MarketCatalogMarket['status'];
  quoteStatus: NonNullable<MarketCatalogMarket['quoteStatus']>;
  quoteReadyVenueCount: number;
  quoteBlockers: string[];
  lastQuoteAt: string | null;
  outcomes: DashboardOutcomeRow[];
  imageUrl: string | null;
  iconUrl: string | null;
  priceLabel: string;
  priceVenue: string | null;
  changeLabel: string;
  savings: string;
  spread: string;
  fallbackLabel: string;
  fallbackMode: 'best_venue' | 'fallback' | 'blocker' | 'pending';
  volumeLabel: string;
  volume24h: string | null;
  liquidity: string | null;
  openInterest: string | null;
  resolvesAt: string | null;
  resolutionDateLabel: string | null;
  closesBy: string;
  closeTimestamp: number | null;
  change24hLabel: string;
  change24hDirection: 'positive' | 'negative' | 'neutral' | 'pending';
  venueDetails: Record<string, {
    closesBy: string;
    change24hLabel: string;
    change24hDirection: 'positive' | 'negative' | 'neutral' | 'pending';
  }>;
  quoteRequired: boolean;
  prob: number | null;
  change: string | null;
  txnBuy: number;
  txnSell: number;
  txnLabel: 'Txns' | 'Vol' | 'Pending';
  badges: string[];
};

type DashboardOutcomeQuote = {
  outcomeId: string;
  status: NonNullable<MarketCatalogMarket['quoteStatus']>;
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
  sellOutcomes?: Record<string, DashboardOutcomeQuote>;
};

type MarketQuickFilter = 'all' | 'watchlist' | 'live_crypto' | 'trending' | 'best_routes' | 'sports' | 'crypto' | 'politics';
type DashboardRouteFilter = 'Single' | 'Pair' | 'Tri' | 'Strict all';
type DashboardSortKey = 'volume' | 'liquidity' | 'closing' | 'buys' | 'sells' | 'best_route';
type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

const HOME_MARKET_INITIAL_LIMIT = 8;
const HOME_MARKET_LOAD_MORE_SIZE = 8;
const HOME_MARKET_SOURCE_PAGE_SIZE = 32;
const MARKET_PAGE_SIZE = 60;
const MARKET_CATALOG_FIRST_CURSOR = '0';
const MARKET_LIVE_PRICE_CHUNK_SIZE = 18;

const watchlistStorageKey = 'lotus.watchlist.marketIds';
const notificationSettingsStorageKey = 'lotus.notification.settings';

const categoryIconFallback: Record<string, string> = {
  sports: 'L',
  politics: 'L',
  crypto: 'L',
  esports: 'L',
  finance: 'L',
};

const routeTypeLabel = (market: MarketCatalogMarket): string => {
  if (market.routeability.hasCrossVenue) {
    if (market.venueCount >= 4) return 'Strict all';
    return market.venueCount >= 3 ? 'Tri' : 'Pair';
  }
  return 'Single';
};

const formatTitleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const assetDisplayName = (value: string): string => {
  const normalized = value.toUpperCase();
  const names: Record<string, string> = {
    BASE: 'Base',
    BNB: 'BNB',
    BTC: 'Bitcoin',
    ETH: 'Ethereum',
    SOL: 'Solana',
    XRP: 'XRP',
  };
  return names[normalized] ?? formatTitleCase(value);
};

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

const formatVenueCloseDate = (expiresAt: string | null | undefined, resolvesAt: string | null | undefined): string =>
  formatMarketDate(expiresAt ?? resolvesAt);

const dateTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeVenueId = (venue: string): string => venue.toLowerCase().replace(/[\s._-]+/g, '_');

const dashboardVenueIconId = (venue: string): string => {
  const normalized = normalizeVenueId(venue);
  if (['predict', 'predict_fun', 'predictfun'].includes(normalized)) return 'predict';
  if (['poly_market', 'polymarket'].includes(normalized)) return 'polymarket';
  return normalized;
};

const normalizeOutcomeId = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '_');

const canonicalQuoteOutcomeId = (label: string): string => {
  const trimmed = label.trim();
  const normalized = normalizeOutcomeId(trimmed);
  if (normalized === 'YES' || normalized === 'NO' || normalized === 'UP' || normalized === 'DOWN') {
    return normalized;
  }
  return trimmed;
};

const extractDatePhrase = (title: string): string | null => {
  const match = title.match(/\b(?:by|before|after|on)\s+(.+?)(?:\?|$)/i);
  return match?.[0]?.replace(/\?$/, '').trim() ?? null;
};

const formatDateCandidate = (value: string): string | null => {
  const normalized = value.replace(/_/g, '-').trim();
  const compact = normalized.match(/\b(20\d{2})[-\s](\d{2})[-\s](\d{2})\b/);
  const candidate = compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : normalized;
  const parsed = new Date(`${candidate}T12:00:00.000Z`);
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return parsed.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const natural = new Date(normalized);
  if (!Number.isNaN(natural.getTime()) && /\b20\d{2}\b/.test(normalized) && /[A-Za-z]/.test(normalized)) {
    return natural.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return null;
};

const formatMonthYearCandidate = (value: string): string | null => {
  const normalized = value.replace(/_/g, '-').trim();
  const compact = normalized.match(/\b(20\d{2})[-\s](\d{2})[-\s](\d{2})\b/);
  const candidate = compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : normalized;
  const parsed = new Date(`${candidate}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const formatPriceCandidate = (value: string): string => {
  const numeric = Number(value.replace(/[$,_\s]/g, ''));
  return Number.isFinite(numeric)
    ? `$${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : value.trim();
};

const extractDateCandidate = (title: string): string | null => {
  const suffixDate = title.match(/:\s*(20\d{2}[-_]\d{2}[-_]\d{2})\s*$/);
  if (suffixDate?.[1]) return formatDateCandidate(suffixDate[1]) ?? suffixDate[1].replace(/_/g, '-');
  const spacedDate = title.match(/\b(20\d{2})\s+(\d{2})\s+(\d{2})\b/);
  if (spacedDate) return formatDateCandidate(`${spacedDate[1]}-${spacedDate[2]}-${spacedDate[3]}`);
  const isoMatch = title.match(/\b(20\d{2}[-_]\d{2}[-_]\d{2})\b/);
  if (isoMatch?.[1]) return formatDateCandidate(isoMatch[1]) ?? isoMatch[1].replace(/_/g, '-');
  const phraseMatch = title.match(/\b(?:by|before|after|on)\s+(.+?)(?:\?|$)/i);
  return phraseMatch?.[1]?.trim() ?? null;
};

const normalizeEventTopicTitle = (market: MarketCatalogMarket): string => {
  if (market.displayTopic?.trim()) return market.displayTopic.trim();
  const rawTitle = (market.eventTitle ?? market.title).trim();
  const title = rawTitle
    .replace(/\s*:\s*\d{4}[-_]\d{2}[-_]\d{2}$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const upper = title.toUpperCase();

  const athMatch = upper.match(/\bATH_BY_DATE\|([A-Z0-9]+)\|/) ?? upper.match(/\bATH BY DATE ([A-Z0-9]+)\b/);
  if (athMatch?.[1]) return `${athMatch[1]} ATH by ____`;

  if (/ETHEREUM|ETH/i.test(title) && /ATH|ALL[-\s]?TIME HIGH/i.test(title)) return 'ETH ATH by ____';
  if (/\bBTC\b|\bBITCOIN\b/i.test(title) && /ATH|ALL[-\s]?TIME HIGH/i.test(title)) return 'BTC ATH by ____';

  const tokenLaunchMatch = upper.match(/\bTOKEN_LAUNCH_BY_DATE\|([A-Z0-9]+)\|/) ?? upper.match(/\bTOKEN LAUNCH BY DATE ([A-Z0-9]+)\b/);
  if (tokenLaunchMatch?.[1]) return `${assetDisplayName(tokenLaunchMatch[1])} to launch a token by ____`;

  const thresholdMatch = upper.match(/\bTHRESHOLD_BY_DATE\|([A-Z0-9]+)\|(20\d{2}[-_]\d{2}[-_]\d{2})\|/) ?? upper.match(/\bTHRESHOLD BY DATE ([A-Z0-9]+) (20\d{2}[-_]\d{2}[-_]\d{2})\b/);
  if (thresholdMatch?.[1] && thresholdMatch[2]) {
    const monthYear = formatMonthYearCandidate(thresholdMatch[2]);
    if (monthYear) return `What price will ${assetDisplayName(thresholdMatch[1])} hit in ${monthYear}?`;
  }

  const firstThresholdMatch = upper.match(/\bFIRST_TO_THRESHOLD_BY_DATE\|([A-Z0-9]+)\|/) ?? upper.match(/\bFIRST TO THRESHOLD BY DATE ([A-Z0-9]+)\b/);
  if (firstThresholdMatch?.[1]) return `${firstThresholdMatch[1]} first to hit ____`;

  const fdvMatch = title.match(/FDV threshold after launch\s+(.+?)\s+one day after launch/i);
  if (fdvMatch?.[1]) return `${formatTitleCase(fdvMatch[1])} FDV one day after launch`;
  const fdvGeneric = title.match(/^(.+?)\s+FDV\s+(?:above|over|threshold).+one day after launch/i);
  if (fdvGeneric?.[1]) return `${formatTitleCase(fdvGeneric[1])} FDV one day after launch`;

  const datedBinary = title.match(/^(.+?)\s+(?:by|before|after|on)\s+.+\??$/i);
  if (datedBinary && /(greenland|netanyahu|out|launch|confirm|hit|above|below|greater|less|all time high)/i.test(title)) {
    return datedBinary[1]!.replace(/\?$/, '').trim();
  }

  return title.replace(/\?$/, '').trim();
};

const deriveCandidateOutcomeLabel = (market: MarketCatalogMarket): string => {
  if (market.displayOutcome?.trim()) return market.displayOutcome.trim();
  const title = market.title.trim();
  if (/:\s*20\d{2}[-_]\d{2}[-_]\d{2}\s*$/.test(title)) {
    const suffixDate = extractDateCandidate(title);
    if (suffixDate) return suffixDate;
  }
  const fdvValue = title.match(/:\s*([$€£]?\s*[\d,.]+\s*[KMBT]?)/i)?.[1];
  if (fdvValue) return fdvValue.replace(/\s+/g, '').toUpperCase();

  const afterLaunchValue = title.match(/\b([$€£]?\s*[\d,.]+\s*[KMBT])\b/i)?.[1];
  if (/FDV|above|threshold/i.test(title) && afterLaunchValue) {
    return afterLaunchValue.replace(/\s+/g, '').toUpperCase();
  }

  const dateCandidate = extractDateCandidate(title);
  if (dateCandidate) return dateCandidate;

  const suffix = title.match(/:\s*(.+)$/)?.[1]?.trim();
  if (suffix && suffix.length <= 48) {
    return formatDateCandidate(suffix) ?? suffix;
  }

  return title.replace(/\?$/, '').trim();
};

const candidateOutcomeKey = (market: MarketCatalogMarket): string => {
  if (market.displayOutcomeKey?.trim()) return market.displayOutcomeKey.trim().toLowerCase();
  const dateCandidate = extractDateCandidate(market.title);
  if (dateCandidate) return `date:${dateCandidate.toLowerCase()}`;
  return `label:${deriveCandidateOutcomeLabel(market).toLowerCase().replace(/\s+/g, '_')}`;
};

const normalizeMarketOutcomeLabel = (marketTitle: string, outcomeLabel: string): string => {
  const normalizedOutcome = outcomeLabel.trim();
  const outcomeKey = normalizeOutcomeId(normalizedOutcome);
  if (outcomeKey === 'YES') return extractDatePhrase(marketTitle) ?? 'Yes';
  if (outcomeKey === 'NO') return 'No';

  const fdvValue = marketTitle.match(/:\s*([$€£]?\s*[\d,.]+\s*[KMBT]?)/i)?.[1];
  if (fdvValue && /^yes$/i.test(normalizedOutcome)) return fdvValue.replace(/\s+/g, '');

  if (/winner|champion|mayor|election|nominee/i.test(marketTitle)) {
    return normalizedOutcome;
  }
  return normalizedOutcome;
};

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

const formatCompactMetric = (value: string | number | null | undefined): string | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (parsed >= 1_000_000_000) return `${(parsed / 1_000_000_000).toFixed(parsed >= 10_000_000_000 ? 0 : 1)}B`;
  if (parsed >= 1_000_000) return `${(parsed / 1_000_000).toFixed(parsed >= 10_000_000 ? 0 : 1)}M`;
  if (parsed >= 1_000) return `${(parsed / 1_000).toFixed(parsed >= 10_000 ? 0 : 1)}K`;
  return parsed.toFixed(parsed >= 10 ? 0 : 2);
};

const formatMoneyMetric = (value: string | number | null | undefined): string | null => {
  const formatted = formatCompactMetric(value);
  return formatted ? `$${formatted}` : null;
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const formatCurrencyValue = (value: string | number | null | undefined): string => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  if (!Number.isFinite(parsed)) return 'Unavailable';
  return parsed.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyNumber = (value: string | number | null | undefined): number => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/[$,\s]/g, ''))
      : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatSignedPercentValue = (value: number): string => {
  if (!Number.isFinite(value)) return '+0.00%';
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
};

type HeaderPortfolioVenueRow = {
  venue: string;
  cash: number;
  positions: number;
};

type DashboardRailActivityItem = {
  type: 'buy' | 'sell' | 'route';
  title: string;
  market: string;
  time: string;
  price: string;
  timestamp: number;
};

const loadWatchlistIds = (): string[] => {
  try {
    const raw = window.localStorage.getItem(watchlistStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const saveWatchlistIds = (ids: string[]) => {
  window.localStorage.setItem(watchlistStorageKey, JSON.stringify(ids));
};

const loadNotificationSettings = (): { toastPosition: ToastPosition; notificationsEnabled: boolean; notificationSound: boolean } => {
  try {
    const raw = window.localStorage.getItem(notificationSettingsStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const positions: ToastPosition[] = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    return {
      toastPosition: positions.includes(parsed.toastPosition) ? parsed.toastPosition : 'bottom-right',
      notificationsEnabled: typeof parsed.notificationsEnabled === 'boolean' ? parsed.notificationsEnabled : true,
      notificationSound: typeof parsed.notificationSound === 'boolean' ? parsed.notificationSound : true,
    };
  } catch {
    return { toastPosition: 'bottom-right', notificationsEnabled: true, notificationSound: true };
  }
};

const saveNotificationSettings = (settings: { toastPosition: ToastPosition; notificationsEnabled: boolean; notificationSound: boolean }) => {
  window.localStorage.setItem(notificationSettingsStorageKey, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('lotus:notification-settings', { detail: settings }));
};

const notificationPopoverClass = (position: ToastPosition): string => {
  const base = 'fixed z-50 w-[21rem] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl animate-in fade-in duration-200 dark:border-zinc-800 dark:bg-[#1a1a1c]';
  if (position === 'top-left') return `${base} left-16 top-16 slide-in-from-top-2`;
  if (position === 'top-center') return `${base} left-1/2 top-16 -translate-x-1/2 slide-in-from-top-2`;
  if (position === 'top-right') return `${base} right-72 top-16 slide-in-from-top-2`;
  if (position === 'bottom-left') return `${base} bottom-14 left-16 slide-in-from-bottom-2`;
  if (position === 'bottom-center') return `${base} bottom-14 left-1/2 -translate-x-1/2 slide-in-from-bottom-2`;
  return `${base} bottom-14 right-72 slide-in-from-bottom-2`;
};

const parseMetricNumber = (value: string | number | null | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatChange24h = (market: Pick<MarketCatalogMarket['venueMarkets'][number], 'change24h' | 'changePercent24h'>): {
  label: string;
  direction: 'positive' | 'negative' | 'neutral' | 'pending';
} => {
  const percent = parseMetricNumber(market.changePercent24h);
  const absolute = parseMetricNumber(market.change24h);
  const raw = market.changePercent24h ?? market.change24h;
  if (raw === null || raw === undefined) return { label: 'Quote', direction: 'pending' };
  const numeric = Number(String(raw).replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(numeric)) return { label: 'Quote', direction: 'pending' };
  const direction = numeric > 0 ? 'positive' : numeric < 0 ? 'negative' : 'neutral';
  if (percent !== null || market.changePercent24h !== null) {
    return { label: `${numeric > 0 ? '+' : ''}${numeric.toFixed(Math.abs(numeric) >= 10 ? 0 : 2)}%`, direction };
  }
  const value = absolute ?? Math.abs(numeric);
  return { label: `${numeric > 0 ? '+' : numeric < 0 ? '-' : ''}${formatProbabilityPrice(value)}`, direction };
};

const formatHeaderVenueLabel = (venue: string): string => {
  const normalized = venue.toUpperCase();
  if (normalized === 'PREDICT_FUN' || normalized === 'PREDICT') return 'Predict.fun';
  if (normalized === 'POLYMARKET') return 'Polymarket';
  if (normalized === 'LIMITLESS') return 'Limitless';
  if (normalized === 'OPINION') return 'Opinion';
  if (normalized === 'MYRIAD') return 'Myriad';
  return venue
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const HeaderPortfolioSummary = ({
  cashTotal,
  positionsTotal,
  pnlPercent,
  rows,
  loading,
}: {
  cashTotal: number;
  positionsTotal: number;
  pnlPercent: number;
  rows: HeaderPortfolioVenueRow[];
  loading: boolean;
}) => {
  const pnlPositive = !Number.isFinite(pnlPercent) || pnlPercent >= 0;
  const hasRows = rows.length > 0;

  return (
    <div className="group relative hidden xl:block">
      <button
        type="button"
        aria-label="Portfolio cash and positions summary"
        className="flex h-10 min-w-[18.5rem] items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white/85 px-4 text-sm shadow-sm backdrop-blur transition-colors hover:border-zinc-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 dark:border-zinc-800 dark:bg-[#101114]/90 dark:hover:border-zinc-700 dark:hover:bg-[#141518]"
      >
        <span className="text-zinc-500 dark:text-zinc-400">Cash</span>
        <span className="font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
          {loading ? 'Syncing' : formatCurrencyValue(cashTotal)}
        </span>
        <span className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        <span className="text-zinc-500 dark:text-zinc-400">Positions</span>
        <span className="font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
          {loading ? 'Syncing' : formatCurrencyValue(positionsTotal)}
        </span>
        <span className={`text-xs font-bold tabular-nums ${pnlPositive ? 'text-[#49e63d]' : 'text-rose-400'}`}>
          {formatSignedPercentValue(pnlPercent)}
        </span>
      </button>

      <div className="pointer-events-none absolute right-0 top-full z-50 mt-3 w-[min(28rem,calc(100vw-2rem))] translate-y-1 rounded-2xl border border-zinc-200 bg-white/95 p-3 opacity-0 shadow-2xl backdrop-blur-xl transition duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-zinc-800 dark:bg-[#101114]/95">
        <div className="grid grid-cols-[minmax(7rem,1fr)_7rem_7rem] items-center gap-4 px-3 pb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
          <span>Venue</span>
          <span className="text-right">Cash</span>
          <span className="text-right">Positions</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {hasRows ? rows.map((row, index) => (
            <div
              key={row.venue}
              className={`grid grid-cols-[minmax(7rem,1fr)_7rem_7rem] items-center gap-4 bg-white px-3 py-3 dark:bg-[#101114] ${index > 0 ? 'border-t border-zinc-200 dark:border-zinc-800' : ''}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
                  <VenueLogo
                    id={dashboardVenueIconId(row.venue)}
                    label={formatHeaderVenueLabel(row.venue)}
                    className="h-full w-full rounded-[inherit] object-cover"
                  />
                </span>
                <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {formatHeaderVenueLabel(row.venue)}
                </span>
              </div>
              <span className="text-right text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatCurrencyValue(row.cash)}
              </span>
              <span className="text-right text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatCurrencyValue(row.positions)}
              </span>
            </div>
          )) : (
            <div className="bg-white px-4 py-5 text-sm text-zinc-500 dark:bg-[#101114] dark:text-zinc-400">
              Portfolio data is syncing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const formatSpreadBps = (candidate: TradeRouteCandidate | null): string => {
  if (!candidate || typeof candidate.spreadBps !== 'number' || !Number.isFinite(candidate.spreadBps)) return 'Live';
  return `${(candidate.spreadBps / 100).toFixed(2)}%`;
};

const chooseBestCandidate = (candidates: TradeRouteCandidate[]): TradeRouteCandidate | null => (
  [...candidates]
    .filter((candidate) => Number.isFinite(candidate.price))
    .sort((left, right) => left.price - right.price)[0] ?? null
);

const candidateSize = (candidate: TradeRouteCandidate): number => {
  const parsed = Number(candidate.availableSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const unifiedAveragePrice = (candidates: TradeRouteCandidate[]): number | null => {
  const valid = candidates.filter((candidate) => Number.isFinite(candidate.price) && candidate.price > 0);
  if (valid.length === 0) return null;
  const totalSize = valid.reduce((sum, candidate) => sum + candidateSize(candidate), 0);
  if (totalSize > 0) {
    return valid.reduce((sum, candidate) => sum + candidate.price * candidateSize(candidate), 0) / totalSize;
  }
  return valid.reduce((sum, candidate) => sum + candidate.price, 0) / valid.length;
};

const sumCandidateSize = (quotes: DashboardOutcomeQuote[]): number =>
  quotes.reduce((sum, quote) => sum + quote.candidates.reduce((candidateSum, candidate) => candidateSum + candidateSize(candidate), 0), 0);

const sumCandidateNotional = (quotes: DashboardOutcomeQuote[]): number =>
  quotes.reduce((sum, quote) => (
    sum + quote.candidates.reduce((candidateSum, candidate) => candidateSum + candidateSize(candidate) * candidate.price, 0)
  ), 0);

const marketCategoryMatches = (market: DashboardMarketRow, category: string): boolean =>
  market.category.toLowerCase().includes(category.toLowerCase());

const categoryForQuickFilter = (filter: MarketQuickFilter): string | undefined => {
  if (filter === 'sports') return 'Sports';
  if (filter === 'crypto' || filter === 'live_crypto') return 'Crypto';
  if (filter === 'politics') return 'Politics';
  return undefined;
};

const routeRank = (routeType: string): number => {
  if (routeType === 'Strict all') return 4;
  if (routeType === 'Tri') return 3;
  if (routeType === 'Pair') return 2;
  return 1;
};

const sortTrendingMarkets = (markets: DashboardMarketRow[]): DashboardMarketRow[] =>
  [...markets].sort((left, right) => {
    const rightActivity = right.txnBuy + right.txnSell;
    const leftActivity = left.txnBuy + left.txnSell;
    if (rightActivity !== leftActivity) return rightActivity - leftActivity;
    if (right.venueCount !== left.venueCount) return right.venueCount - left.venueCount;
    return routeRank(right.routeType) - routeRank(left.routeType);
  });

const applyQuickFilter = (
  markets: DashboardMarketRow[],
  filter: MarketQuickFilter,
  watchlistIds: string[],
): DashboardMarketRow[] => {
  const activeMarkets = markets.filter((market) => market.status !== 'RESOLVED_OR_EXPIRED');
  const watched = new Set(watchlistIds);
  if (filter === 'watchlist') return activeMarkets.filter((market) => watched.has(market.id));
  if (filter === 'best_routes') {
    return [...activeMarkets]
      .filter((market) => market.routeType !== 'Single' && market.status !== 'RESOLVED_OR_EXPIRED')
      .sort((left, right) => routeRank(right.routeType) - routeRank(left.routeType));
  }
  if (filter === 'trending') return sortTrendingMarkets(activeMarkets);
  if (filter === 'live_crypto') {
    return sortTrendingMarkets(activeMarkets.filter((market) => marketCategoryMatches(market, 'Crypto') && market.status === 'OPEN'));
  }
  return activeMarkets;
};

const displayedMetricValue = (value: string): number => {
  const compactMatch = value.replace(/[$,\s]/g, '').match(/^([0-9.]+)([KMB])?$/i);
  if (!compactMatch) return 0;
  const amount = Number(compactMatch[1]);
  if (!Number.isFinite(amount)) return 0;
  const suffix = compactMatch[2]?.toUpperCase();
  if (suffix === 'B') return amount * 1_000_000_000;
  if (suffix === 'M') return amount * 1_000_000;
  if (suffix === 'K') return amount * 1_000;
  return amount;
};

const applyPanelFiltersAndSort = (
  markets: DashboardMarketRow[],
  categories: string[],
  routeTypes: DashboardRouteFilter[],
  sortKey: DashboardSortKey,
): DashboardMarketRow[] => {
  const categorySet = new Set(categories.map((category) => category.toLowerCase()));
  const routeSet = new Set(routeTypes);
  const filtered = markets.filter((market) => {
    const categoryMatch = categorySet.size === 0 || Array.from(categorySet).some((category) => market.category.toLowerCase().includes(category));
    const routeMatch = routeSet.size === 0 || routeSet.has(market.routeType as DashboardRouteFilter);
    return categoryMatch && routeMatch;
  });

  return [...filtered].sort((left, right) => {
    if (sortKey === 'closing') {
      const leftClose = left.closeTimestamp ?? Number.MAX_SAFE_INTEGER;
      const rightClose = right.closeTimestamp ?? Number.MAX_SAFE_INTEGER;
      return leftClose - rightClose;
    }
    if (sortKey === 'buys') return right.txnBuy - left.txnBuy;
    if (sortKey === 'sells') return right.txnSell - left.txnSell;
    if (sortKey === 'best_route') return routeRank(right.routeType) - routeRank(left.routeType);
    if (sortKey === 'liquidity') {
      const rightLiquidity = right.volumeLabel === 'Liq' ? displayedMetricValue(right.volume) : 0;
      const leftLiquidity = left.volumeLabel === 'Liq' ? displayedMetricValue(left.volume) : 0;
      if (rightLiquidity !== leftLiquidity) return rightLiquidity - leftLiquidity;
    }
    return displayedMetricValue(right.volume) - displayedMetricValue(left.volume);
  });
};

const getReadableBlocker = (blocked: LiveCandidatesResponse['blocked']): string | null => {
  const reason = blocked.find((item) => item.reason)?.reason;
  return reason ? readableQuoteBlocker(reason) : null;
};

const safeQuoteBlockerReason = (blocker: unknown): string | null => {
  if (typeof blocker === 'string') return blocker;
  if (!blocker || typeof blocker !== 'object') return null;
  const record = blocker as Record<string, unknown>;
  const candidates = [record.reason, record.code, record.detailsCode, record.message];
  const value = candidates.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return value?.trim() ?? null;
};

const catalogQuoteBlockers = (market: MarketCatalogMarket): string[] =>
  (market.quoteBlockers ?? [])
    .map(safeQuoteBlockerReason)
    .filter((item): item is string => Boolean(item));

const readableQuoteBlocker = (reason: string): string => {
  const normalized = reason.toUpperCase();
  if (normalized.includes('CLOSED_OR_NOT_ACCEPTING_ORDERS')) return 'Market closed or not accepting orders';
  if (normalized.includes('PREDICT_PROVIDER_AUTH_INVALID')) return 'Predict quote auth invalid';
  if (normalized.includes('QUOTE_PROVIDER_HTTP_429')) return 'Venue quote provider rate limited';
  if (normalized.includes('VENUE_OUTCOME_ID_MISSING')) return 'Venue outcome mapping missing';
  if (normalized.includes('OPINION_TOKEN_ID_MISSING')) return 'Opinion token mapping missing';
  if (normalized.includes('QUOTE_PROVIDER_TIMEOUT')) return 'Provider timeout';
  if (normalized.includes('QUOTE_PROVIDER_EMPTY_BOOK')) return 'No live depth';
  if (normalized.includes('QUOTE_PROVIDER_BAD_PAYLOAD')) return 'Provider payload unavailable';
  const http = normalized.match(/QUOTE_PROVIDER_HTTP_(\d{3})/);
  if (http) return `Provider unavailable (${http[1]})`;
  if (normalized.includes('QUOTE_READER_UNSUPPORTED')) return 'Venue quote reader unsupported';
  if (normalized.includes('QUOTE_SNAPSHOT_STALE')) return 'Stale quote';
  if (normalized.includes('QUOTE_READER_FAILED')) return 'Venue quote unavailable';
  return reason.replace(/[_-]+/g, ' ').toLowerCase();
};

const marketQuoteStatus = (market: MarketCatalogMarket): NonNullable<MarketCatalogMarket['quoteStatus']> => {
  const status = String(market.quoteStatus ?? '').toLowerCase();
  if (status === 'live' || status === 'partial' || status === 'stale' || status === 'unavailable') return status;
  return 'unavailable';
};

const marketDisplayQuoteStatus = (
  status: NonNullable<MarketCatalogMarket['quoteStatus']>,
  readyVenueCount: number,
  diagnosticsEnabled = lotusMarketDiagnosticsEnabled(),
): NonNullable<MarketCatalogMarket['quoteStatus']> => {
  if (diagnosticsEnabled) return status;
  if (status === 'live' || status === 'partial') return 'live';
  return readyVenueCount > 0 ? 'live' : 'unavailable';
};

const marketQuoteReadinessLabel = (
  status: NonNullable<MarketCatalogMarket['quoteStatus']>,
  readyVenueCount: number,
  blockers: string[],
  diagnosticsEnabled = lotusMarketDiagnosticsEnabled(),
): string => {
  if (!diagnosticsEnabled) {
    return '';
  }
  if (status === 'live') return readyVenueCount > 0 ? `${readyVenueCount} quote-ready venue${readyVenueCount === 1 ? '' : 's'}` : 'Quote ready';
  if (status === 'partial') return readyVenueCount > 0 ? `Partial coverage: ${readyVenueCount} venue${readyVenueCount === 1 ? '' : 's'}` : 'Partial venue coverage';
  if (status === 'stale') return 'Stale quote - refresh on open';
  return blockers[0] ? readableQuoteBlocker(blockers[0]) : 'Quote unavailable';
};

const marketQuoteStatusPriceLabel = (
  status: NonNullable<MarketCatalogMarket['quoteStatus']>,
  diagnosticsEnabled = lotusMarketDiagnosticsEnabled(),
): string => {
  if (!diagnosticsEnabled) return '-';
  if (status === 'stale') return 'Stale';
  if (status === 'unavailable') return 'Unavailable';
  return 'Preview';
};

const marketQuoteStatusBadge = (
  status: NonNullable<MarketCatalogMarket['quoteStatus']>,
  diagnosticsEnabled = lotusMarketDiagnosticsEnabled(),
): { label: string; className: string } | null => {
  if (!diagnosticsEnabled) return null;
  if (status === 'partial') {
    return {
      label: 'Partial coverage',
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    };
  }
  if (status === 'stale') {
    return {
      label: 'Stale quote',
      className: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    };
  }
  if (status === 'unavailable') {
    return {
      label: 'Blocked',
      className: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    };
  }
  return null;
};

const marketIdForCatalogMarket = (market: MarketCatalogMarket): string => market.canonicalMarketIds[0] ?? market.canonicalEventId;

const venuesForCatalogMarket = (market: MarketCatalogMarket): string[] =>
  Array.from(new Set((market.venues.length ? market.venues : market.venueMarkets.map((item) => item.venue)).map(normalizeVenueId)));

const pendingPricePlaceholder = (): string => lotusMarketDiagnosticsEnabled() ? 'Quote' : '-';

const compactFallbackOutcome = (market: MarketCatalogMarket): DashboardOutcomeRow => {
  const marketId = marketIdForCatalogMarket(market);
  const label = market.displayOutcome?.trim() || deriveCandidateOutcomeLabel(market);
  return {
    id: market.displayOutcomeKey || canonicalQuoteOutcomeId(label) || 'YES',
    marketId,
    canonicalMarketIds: market.canonicalMarketIds,
    eventId: market.eventId ?? market.canonicalEventId,
    canonicalEventId: market.canonicalEventId,
    quoteOutcomeId: canonicalQuoteOutcomeId(label),
    name: normalizeMarketOutcomeLabel(market.title, label),
    prob: pendingPricePlaceholder(),
    liveStatus: 'not_requested',
    venues: venuesForCatalogMarket(market),
    venueMarkets: [],
    marketType: market.outcomeCount > 2 ? 'multi' : 'binary',
    marketTitle: market.title,
    imageUrl: getSafeMediaUrl(market.imageUrl),
    iconUrl: getSafeMediaUrl(market.iconUrl),
  };
};

const binaryCandidateOutcomeRow = (market: MarketCatalogMarket): DashboardOutcomeRow => {
  const marketId = marketIdForCatalogMarket(market);
  return {
    id: marketId,
    marketId,
    canonicalMarketIds: market.canonicalMarketIds,
    eventId: market.eventId ?? market.canonicalEventId,
    canonicalEventId: market.canonicalEventId,
    quoteOutcomeId: 'YES',
    name: deriveCandidateOutcomeLabel(market),
    prob: pendingPricePlaceholder(),
    liveStatus: 'not_requested',
    venues: venuesForCatalogMarket(market),
    venueMarkets: market.venueMarkets,
    marketType: market.outcomeCount > 2 ? 'multi' : 'binary',
    marketTitle: market.title,
    imageUrl: getSafeMediaUrl(market.imageUrl),
    iconUrl: getSafeMediaUrl(market.iconUrl),
  };
};

const mapCatalogMarketToDashboardRow = (market: MarketCatalogMarket): DashboardMarketRow => {
  const diagnosticsEnabled = lotusMarketDiagnosticsEnabled();
  const venues = venuesForCatalogMarket(market);
  const routeType = routeTypeLabel(market);
  const marketId = marketIdForCatalogMarket(market);
  const quoteStatus = marketQuoteStatus(market);
  const quoteReadyVenueCount = Number.isFinite(Number(market.quoteReadyVenueCount)) ? Number(market.quoteReadyVenueCount) : 0;
  const displayQuoteStatus = marketDisplayQuoteStatus(quoteStatus, quoteReadyVenueCount, diagnosticsEnabled);
  const quoteBlockers = catalogQuoteBlockers(market);
  const quoteReadinessLabel = marketQuoteReadinessLabel(quoteStatus, quoteReadyVenueCount, quoteBlockers, diagnosticsEnabled);
  const marketClass = formatTitleCase(market.marketClass || 'Market');
  const category = formatTitleCase(market.category || 'Market');
  const catalogVolume24h = formatMoneyMetric(market.volume24h);
  const catalogVolume = formatMoneyMetric(market.volume24h ?? market.volume);
  const catalogLiquidity = formatMoneyMetric(market.liquidity);
  const buyCount = parseMetricNumber(market.buyCount);
  const sellCount = parseMetricNumber(market.sellCount);
  const buyVolume = parseMetricNumber(market.buyVolume);
  const sellVolume = parseMetricNumber(market.sellVolume);
  const venueDetails = Object.fromEntries(
    market.venueMarkets.map((venueMarket) => {
      const change24h = formatChange24h(venueMarket);
      return [normalizeVenueId(venueMarket.venue), {
        closesBy: formatVenueCloseDate(venueMarket.expiresAt, venueMarket.resolvesAt),
        change24hLabel: change24h.label,
        change24hDirection: change24h.direction,
      }];
    })
  );
  const catalogOutcomeLabels = Array.from(new Set(market.venueMarkets.flatMap((venueMarket) =>
    venueMarket.outcomes.map((outcome) => outcome.label?.trim()).filter((label): label is string => Boolean(label))
  )));
  const isBinaryOutcomeMarket = catalogOutcomeLabels.length > 0 && catalogOutcomeLabels.every((label) => ['YES', 'NO'].includes(normalizeOutcomeId(label)));
  const outcomeByLabel = new Map<string, DashboardOutcomeRow>();
  for (const venueMarket of market.venueMarkets) {
    for (const outcome of venueMarket.outcomes) {
      const label = outcome.label?.trim();
      if (!label || outcomeByLabel.has(label.toLowerCase())) continue;
      outcomeByLabel.set(label.toLowerCase(), {
        id: outcome.id || normalizeOutcomeId(label),
        marketId,
        canonicalMarketIds: market.canonicalMarketIds,
        eventId: market.eventId ?? market.canonicalEventId,
        canonicalEventId: market.canonicalEventId,
        quoteOutcomeId: canonicalQuoteOutcomeId(label),
        name: normalizeMarketOutcomeLabel(market.title, label),
        prob: pendingPricePlaceholder(),
        liveStatus: 'not_requested',
        venues,
        venueMarkets: market.venueMarkets,
        marketType: market.outcomeCount > 2 ? 'multi' : 'binary',
        marketTitle: market.title,
        imageUrl: getSafeMediaUrl(market.imageUrl),
        iconUrl: getSafeMediaUrl(market.iconUrl),
      });
    }
  }
  const rawOutcomeRows = market.venueMarkets.length === 0
    ? [compactFallbackOutcome(market)]
    : isBinaryOutcomeMarket
      ? [binaryCandidateOutcomeRow(market)]
      : Array.from(outcomeByLabel.values());
  const outcomeRows = rawOutcomeRows
    .sort((left, right) => {
      const order = ['YES', 'NO'];
      const leftIndex = order.indexOf(left.quoteOutcomeId);
      const rightIndex = order.indexOf(right.quoteOutcomeId);
      if (leftIndex === -1 && rightIndex === -1) return 0;
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });

  return {
    id: marketId,
    marketId,
    canonicalMarketIds: market.canonicalMarketIds,
    eventId: market.eventId ?? market.canonicalEventId,
    canonicalEventId: market.canonicalEventId,
    title: normalizeEventTopicTitle(market),
    category: `${category} - ${marketClass}`,
    icon: categoryIconFallback[market.category.toLowerCase()] ?? 'L',
    volume: catalogVolume ?? catalogLiquidity ?? 'Backend catalog',
    volumeLabel: catalogVolume ? 'Vol' : catalogLiquidity ? 'Liq' : 'Vol',
    venueCount: market.venueCount,
    routeType,
    venues,
    venueMarkets: market.venueMarkets,
    marketType: market.outcomeCount > 2 ? 'multi' : 'binary',
    marketClass,
    status: market.status,
    quoteStatus: displayQuoteStatus,
    quoteReadyVenueCount,
    quoteBlockers,
    lastQuoteAt: market.lastQuoteAt ?? null,
    outcomes: outcomeRows.length > 0
      ? outcomeRows
      : [{ id: 'OUTCOMES', marketId, canonicalMarketIds: market.canonicalMarketIds, eventId: market.eventId ?? market.canonicalEventId, canonicalEventId: market.canonicalEventId, quoteOutcomeId: 'OUTCOMES', name: 'Outcomes load in terminal', prob: pendingPricePlaceholder(), liveStatus: 'not_requested' }],
    imageUrl: getSafeMediaUrl(market.imageUrl),
    iconUrl: getSafeMediaUrl(market.iconUrl),
    priceLabel: diagnosticsEnabled ? marketQuoteStatusPriceLabel(quoteStatus, diagnosticsEnabled) : '-',
    priceVenue: null,
    changeLabel: diagnosticsEnabled ? quoteReadinessLabel : '',
    savings: diagnosticsEnabled ? quoteStatus === 'unavailable' ? 'Unavailable' : 'Preview route' : '-',
    spread: diagnosticsEnabled ? quoteStatus === 'stale' ? 'Stale' : quoteStatus === 'unavailable' ? 'Blocked' : '-' : '-',
    fallbackLabel: diagnosticsEnabled ? quoteReadinessLabel : '-',
    fallbackMode: quoteStatus === 'unavailable' && diagnosticsEnabled ? 'blocker' : routeType === 'Single' ? 'fallback' : 'pending',
    volume24h: catalogVolume24h,
    liquidity: catalogLiquidity,
    openInterest: null,
    resolvesAt: market.resolvesAt,
    resolutionDateLabel: formatMarketDate(market.resolvesAt),
    closesBy: formatMarketDate(market.expiresAt ?? market.resolvesAt),
    closeTimestamp: dateTimestamp(market.expiresAt ?? market.resolvesAt),
    change24hLabel: 'Quote',
    change24hDirection: 'pending',
    venueDetails,
    quoteRequired: diagnosticsEnabled && quoteStatus === 'unavailable',
    prob: null,
    change: null,
    txnBuy: buyCount ?? buyVolume ?? 0,
    txnSell: sellCount ?? sellVolume ?? 0,
    txnLabel: buyCount !== null || sellCount !== null ? 'Txns' : buyVolume !== null || sellVolume !== null ? 'Vol' : 'Pending',
    badges: venues,
  };
};

const mapCatalogMarketsToDashboardRows = (markets: MarketCatalogMarket[]): DashboardMarketRow[] => {
  const grouped = new Map<string, MarketCatalogMarket[]>();
  for (const market of markets) {
    const topic = normalizeEventTopicTitle(market);
    const key = `${market.category.toLowerCase()}:${topic.toLowerCase()}`;
    const existing = grouped.get(key) ?? [];
    existing.push(market);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((group) => {
    if (group.length === 1) return mapCatalogMarketToDashboardRow(group[0]!);

    const base = mapCatalogMarketToDashboardRow(group[0]!);
    const venues = Array.from(new Set(group.flatMap(venuesForCatalogMarket)));
    const routeTypes = group.map(routeTypeLabel);
    const routeType = routeTypes.includes('Strict all') ? 'Strict all' : routeTypes.includes('Tri') ? 'Tri' : routeTypes.includes('Pair') ? 'Pair' : 'Single';
    const groupedQuoteStatuses = group.map(marketQuoteStatus);
    const quoteStatus = groupedQuoteStatuses.every((status) => status === 'live')
      ? 'live'
      : groupedQuoteStatuses.some((status) => status === 'live' || status === 'partial')
        ? 'partial'
        : groupedQuoteStatuses.some((status) => status === 'stale')
          ? 'stale'
          : 'unavailable';
    const quoteReadyVenueCount = Math.max(0, ...group.map((market) => Number(market.quoteReadyVenueCount) || 0));
    const quoteBlockers = group.flatMap(catalogQuoteBlockers);
    const diagnosticsEnabled = lotusMarketDiagnosticsEnabled();
    const displayQuoteStatus = marketDisplayQuoteStatus(quoteStatus, quoteReadyVenueCount, diagnosticsEnabled);
    const quoteReadinessLabel = marketQuoteReadinessLabel(quoteStatus, quoteReadyVenueCount, quoteBlockers, diagnosticsEnabled);
    const groupedLastQuoteTimes = group
      .map((market) => market.lastQuoteAt)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort();
    const lastQuoteAt = groupedLastQuoteTimes[groupedLastQuoteTimes.length - 1] ?? null;
    const outcomeByCandidate = new Map<string, DashboardOutcomeRow>();
    for (const market of group) {
      const key = candidateOutcomeKey(market);
      if (!outcomeByCandidate.has(key)) {
        outcomeByCandidate.set(key, binaryCandidateOutcomeRow(market));
      }
    }
    const outcomes = Array.from(outcomeByCandidate.values());
    const venueMarkets = group.flatMap((market) => market.venueMarkets);
    const metricTotal = (selector: (market: MarketCatalogMarket) => string | null): number | null => {
      let total = 0;
      let hasValue = false;
      for (const market of group) {
        const parsed = parseMetricNumber(selector(market));
        if (parsed !== null) {
          total += parsed;
          hasValue = true;
        }
      }
      return hasValue ? total : null;
    };
    const buyCount = metricTotal((market) => market.buyCount);
    const sellCount = metricTotal((market) => market.sellCount);
    const buyVolume = metricTotal((market) => market.buyVolume);
    const sellVolume = metricTotal((market) => market.sellVolume);
    const volume24h = formatMoneyMetric(String(metricTotal((market) => market.volume24h) ?? ''));
    const volume = formatMoneyMetric(String(metricTotal((market) => market.volume24h ?? market.volume) ?? '')) ?? base.volume;
    const liquidity = formatMoneyMetric(String(metricTotal((market) => market.liquidity) ?? ''));
    const resolutionTimestamp = group
      .map((market) => dateTimestamp(market.resolvesAt))
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)[0] ?? null;
    const resolutionDate = resolutionTimestamp !== null ? new Date(resolutionTimestamp).toISOString() : null;
    return {
      ...base,
      id: `${base.canonicalEventId}:${base.title}`,
      marketId: outcomes[0]?.marketId ?? base.marketId,
      canonicalMarketIds: Array.from(new Set(group.flatMap((market) => market.canonicalMarketIds))),
      title: base.title,
      routeType,
      venueCount: venues.length,
      venues,
      venueMarkets,
      marketType: 'binary',
      quoteStatus: displayQuoteStatus,
      quoteReadyVenueCount,
      quoteBlockers,
      lastQuoteAt,
      outcomes,
      badges: venues,
      volume: volume ?? liquidity ?? base.volume,
      volumeLabel: volume ? 'Vol' : liquidity ? 'Liq' : base.volumeLabel,
      volume24h,
      liquidity,
      openInterest: null,
      resolvesAt: resolutionDate,
      resolutionDateLabel: formatMarketDate(resolutionDate),
      txnBuy: buyCount ?? buyVolume ?? 0,
      txnSell: sellCount ?? sellVolume ?? 0,
      txnLabel: buyCount !== null || sellCount !== null ? 'Txns' : buyVolume !== null || sellVolume !== null ? 'Vol' : 'Pending',
      priceLabel: marketQuoteStatusPriceLabel(quoteStatus, diagnosticsEnabled),
      changeLabel: diagnosticsEnabled ? quoteReadinessLabel : '',
      savings: diagnosticsEnabled ? quoteStatus === 'unavailable' ? 'Unavailable' : 'Preview route' : '-',
      spread: diagnosticsEnabled ? quoteStatus === 'stale' ? 'Stale' : quoteStatus === 'unavailable' ? 'Blocked' : '-' : '-',
      fallbackLabel: diagnosticsEnabled ? quoteReadinessLabel : '-',
      fallbackMode: quoteStatus === 'unavailable' && diagnosticsEnabled ? 'blocker' : base.fallbackMode,
      quoteRequired: diagnosticsEnabled && quoteStatus === 'unavailable',
    };
  });
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
  const averagePrice = unifiedAveragePrice(candidates);
  return {
    outcomeId,
    status: response?.candidates?.length ? 'live' : 'unavailable',
    price: averagePrice,
    priceLabel: formatProbabilityPercent(averagePrice),
    generatedAt: response?.generatedAt ?? null,
    bestCandidate,
    candidates,
    blocked,
    blocker: getReadableBlocker(blocked),
  };
};

const toOutcomeQuoteFromBatch = (quote: MarketBatchQuoteItem): DashboardOutcomeQuote => {
  const diagnosticsEnabled = lotusMarketDiagnosticsEnabled();
  const candidates: TradeRouteCandidate[] = quote.venues
    .filter((venue) => venue.price !== null)
    .map((venue) => ({
      venue: venue.venue,
      venueMarketId: venue.venueMarketId,
      ...(venue.venueOutcomeId ? { venueOutcomeId: venue.venueOutcomeId } : {}),
      price: Number(venue.price),
      availableSize: venue.availableSize,
      ...(venue.spread && venue.price ? { spreadBps: (Number(venue.spread) / Math.max(Number(venue.price), 0.000001)) * 10_000 } : {}),
      quoteQuality: venue.quoteQuality,
      ...(venue.freshnessMs !== null ? { freshnessMs: venue.freshnessMs } : {}),
      quoteBlockers: venue.blockers,
    }));
  const bestCandidate = chooseBestCandidate(candidates);
  const price = quote.unifiedAveragePrice !== null ? Number(quote.unifiedAveragePrice) : bestCandidate?.price ?? null;
  const hasDisplayPrice = Number.isFinite(price);
  return {
    outcomeId: quote.outcomeId,
    status: !diagnosticsEnabled && hasDisplayPrice ? 'live' : quote.status,
    price: hasDisplayPrice ? price : null,
    priceLabel: formatProbabilityPercent(hasDisplayPrice ? price : null),
    generatedAt: quote.generatedAt,
    bestCandidate,
    candidates,
    blocked: diagnosticsEnabled ? quote.blockers : [],
    blocker: diagnosticsEnabled ? getReadableBlocker(quote.blockers) : null,
  };
};

const toOutcomeQuoteFromLivePrice = (
  outcomeId: string,
  price: MarketLivePriceItem | undefined
): DashboardOutcomeQuote => {
  const numericPrice = price?.price !== null && price?.price !== undefined ? Number(price.price) : NaN;
  const hasDisplayPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const livePrice = hasDisplayPrice && price ? price : null;
  const candidate: TradeRouteCandidate | null = livePrice
    ? {
        venue: livePrice.bestVenue ?? livePrice.venues[0] ?? 'LOTUS',
        venueMarketId: livePrice.marketId,
        price: numericPrice,
        availableSize: '0',
        ...(livePrice.spread && livePrice.price ? { spreadBps: (Number(livePrice.spread) / Math.max(Number(livePrice.price), 0.000001)) * 10_000 } : {}),
        quoteQuality: 'DISPLAY_LIVE_PRICE',
        ...(livePrice.freshnessMs !== null ? { freshnessMs: livePrice.freshnessMs } : {}),
        quoteBlockers: [],
      }
    : null;
  return {
    outcomeId,
    status: hasDisplayPrice ? 'live' : 'unavailable',
    price: hasDisplayPrice ? numericPrice : null,
    priceLabel: formatProbabilityPercent(hasDisplayPrice ? numericPrice : null),
    generatedAt: price?.generatedAt ?? null,
    bestCandidate: candidate,
    candidates: candidate ? [candidate] : [],
    blocked: [],
    blocker: null,
  };
};

const applyLiveQuoteToMarket = (market: DashboardMarketRow, quote: DashboardMarketQuote | undefined): DashboardMarketRow => {
  if (!quote) return market;
  const diagnosticsEnabled = lotusMarketDiagnosticsEnabled();
  const quoteForOutcome = (outcome: DashboardOutcomeRow) =>
    quote.outcomes[outcome.id] ??
    quote.outcomes[outcome.quoteOutcomeId] ??
    quote.outcomes[normalizeOutcomeId(outcome.name)];
  const quotedOutcomes = market.outcomes.map((outcome) => {
    const liveQuote = quoteForOutcome(outcome);
    if (!liveQuote) return outcome;
    return {
      ...outcome,
      prob: liveQuote.price !== null ? liveQuote.priceLabel : diagnosticsEnabled ? 'Unavailable' : '-',
      liveStatus: liveQuote.price !== null ? liveQuote.status : 'unavailable' as const,
    };
  });
  const liveQuotes = quotedOutcomes
    .map((outcome) => quoteForOutcome(outcome))
    .filter((item): item is DashboardOutcomeQuote => Boolean(item?.bestCandidate));
  const yesOutcome = market.outcomes.find((outcome) => outcome.quoteOutcomeId === 'YES');
  const yesLiveQuote = yesOutcome ? quoteForOutcome(yesOutcome) : null;
  const displayQuote = yesLiveQuote?.bestCandidate ? yesLiveQuote : liveQuotes[0] ?? null;
  if (!displayQuote) {
    const unavailable = quotedOutcomes.some((outcome) => outcome.liveStatus === 'unavailable');
    const blocker = Object.values(quote.outcomes).map((outcome) => outcome.blocker).find((item): item is string => Boolean(item));
    return {
      ...market,
      outcomes: quotedOutcomes,
      priceVenue: null,
      quoteStatus: unavailable ? 'unavailable' : market.quoteStatus,
      priceLabel: unavailable && !diagnosticsEnabled ? '-' : market.priceLabel,
      changeLabel: unavailable ? diagnosticsEnabled ? blocker ?? 'Live unavailable' : '' : market.changeLabel,
      fallbackLabel: unavailable ? diagnosticsEnabled ? blocker ?? 'Backend blocker' : '-' : market.fallbackLabel,
      fallbackMode: unavailable && diagnosticsEnabled ? 'blocker' : market.fallbackMode,
      quoteRequired: diagnosticsEnabled,
    };
  }
  const bestVenueDetails = displayQuote.bestCandidate?.venue
    ? market.venueDetails[normalizeVenueId(displayQuote.bestCandidate.venue)]
    : undefined;
  const unifiedLiquidity = formatMoneyMetric(sumCandidateNotional([
    ...Object.values(quote.outcomes),
    ...Object.values(quote.sellOutcomes ?? {}),
  ]));
  const hasCatalogMetric = market.volume !== 'Backend catalog';
  const batchQuoteStatus = displayQuote.status === 'unavailable' ? market.quoteStatus : displayQuote.status;
  const statusChangeLabel = diagnosticsEnabled
    ? batchQuoteStatus === 'partial'
      ? 'Partial coverage'
      : batchQuoteStatus === 'stale'
        ? 'Stale quote'
        : displayQuote.bestCandidate?.venue ? 'Best Yes' : 'Live'
    : displayQuote.bestCandidate?.venue ? 'Best Yes' : 'Live';
  return {
    ...market,
    outcomes: quotedOutcomes,
    quoteStatus: diagnosticsEnabled ? batchQuoteStatus : 'live',
    priceLabel: formatProbabilityPrice(displayQuote.bestCandidate?.price),
    priceVenue: displayQuote.bestCandidate?.venue ?? null,
    changeLabel: statusChangeLabel,
    savings: 'Unified',
    spread: formatSpreadBps(displayQuote.bestCandidate),
    fallbackLabel: displayQuote.bestCandidate?.venue ?? market.fallbackLabel,
    fallbackMode: displayQuote.bestCandidate?.venue ? 'best_venue' : market.fallbackMode,
    closesBy: bestVenueDetails?.closesBy ?? market.closesBy,
    change24hLabel: bestVenueDetails?.change24hLabel ?? market.change24hLabel,
    change24hDirection: bestVenueDetails?.change24hDirection ?? market.change24hDirection,
    volume: hasCatalogMetric ? market.volume : unifiedLiquidity ?? market.volume,
    volumeLabel: hasCatalogMetric ? market.volumeLabel : unifiedLiquidity ? 'Liq' : market.volumeLabel,
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
      return { Icon: CheckCircle2, tone: 'success' as NotificationToastTone, meta: notification.targetKind ?? notification.type };
    case 'warning':
      return { Icon: AlertTriangle, tone: 'warning' as NotificationToastTone, meta: notification.targetKind ?? notification.type };
    case 'error':
      return { Icon: AlertTriangle, tone: 'error' as NotificationToastTone, meta: notification.targetKind ?? notification.type };
    default:
      return { Icon: Clock, tone: 'info' as NotificationToastTone, meta: notification.targetKind ?? notification.type };
  }
};

const activityTimestamp = (...values: Array<string | null | undefined>): number => {
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const formatActivityStatus = (value: string | null | undefined): string => {
  if (!value) return 'Updated';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const mapExecutionActivity = (item: ExecutionStatus): DashboardRailActivityItem => {
  const side = item.route?.side === 'sell' ? 'sell' : 'buy';
  const status = (item.userStatus ?? item.status ?? '').toUpperCase();
  const statusLabel = status.includes('FILLED')
    ? 'Filled'
    : status.includes('FAILED')
      ? 'Failed'
      : status.includes('SUBMITTED') || status.includes('PARTIAL')
        ? 'Submitted'
        : formatActivityStatus(item.userStatus ?? item.status);
  const venuePath = item.route?.venuePath?.filter(Boolean).join(', ');
  const outcome = item.route?.outcomeId ? `${item.route.outcomeId} ` : '';
  const amount = item.route?.executableAmount ? `${item.route.executableAmount} ${side === 'buy' ? 'USDC' : 'shares'}` : '';
  const timeValue = activityTimestamp(item.updatedAt, item.submittedAt);

  return {
    type: side,
    title: `${side === 'buy' ? 'Buy' : 'Sell'} ${statusLabel.toLowerCase()}`,
    market: [amount, outcome.trim(), venuePath ? `via ${venuePath}` : null].filter(Boolean).join(' - ') || item.executionId,
    time: formatRelativeTime(timeValue ? new Date(timeValue).toISOString() : item.updatedAt ?? item.submittedAt ?? '') || 'Recent',
    price: statusLabel,
    timestamp: timeValue,
  };
};

const mapFundingActivity = (item: FundingHistoryRow): DashboardRailActivityItem => {
  const isWithdrawal = String(item.direction ?? '').toUpperCase().includes('WITHDRAW');
  const amount = [item.amount, item.token ?? item.asset].filter(Boolean).join(' ');
  const status = item.aggregateStatus ?? item.status ?? item.legStatus;
  const venue = item.venue ? formatHeaderVenueLabel(item.venue) : null;
  const chain = item.destinationChain ?? item.sourceChain;
  const timeValue = activityTimestamp(item.updatedAt, item.checkedAt, item.createdAt);

  return {
    type: isWithdrawal ? 'sell' : 'buy',
    title: isWithdrawal ? 'Withdrawal' : 'Deposit',
    market: [amount || null, venue, chain].filter(Boolean).join(' - ') || item.intentId,
    time: formatRelativeTime(timeValue ? new Date(timeValue).toISOString() : item.updatedAt ?? item.createdAt ?? '') || 'Recent',
    price: formatActivityStatus(status),
    timestamp: timeValue,
  };
};

const fundingHistoryRows = (response: Awaited<ReturnType<typeof getFundingHistory>>): FundingHistoryRow[] =>
  response.items ?? response.rows ?? response.history ?? [];

export const DashboardV2Mockup = ({
  activePage = 'home',
  onNavigate,
  session,
}: {
  activePage?: LotusAppPage;
  onNavigate?: (page: LotusAppPage) => void;
  session?: AuthSession | null;
}) => {
  const [isDarkMode] = useState(true);
  const [fundingModal, setFundingModal] = useState<'deposit' | null>(null);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [marketViewMode, setMarketViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTerminalMarket, setSelectedTerminalMarket] = useState<TerminalMarketSelection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRouteTypes, setSelectedRouteTypes] = useState<DashboardRouteFilter[]>([]);
  const [marketSortKey, setMarketSortKey] = useState<DashboardSortKey>('volume');
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [marketRows, setMarketRows] = useState<DashboardMarketRow[]>([]);
  const [marketQuotes, setMarketQuotes] = useState<Record<string, DashboardMarketQuote>>({});
  const [marketNextCursor, setMarketNextCursor] = useState<string | null>(null);
  const [marketsHasMore, setMarketsHasMore] = useState(false);
  const [marketsLoadingMore, setMarketsLoadingMore] = useState(false);
  const [marketFilter, setMarketFilter] = useState<MarketQuickFilter>('all');
  const [watchlistIds, setWatchlistIds] = useState<string[]>(loadWatchlistIds);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationItems, setNotificationItems] = useState<UserNotification[]>([]);
  const [notificationSettings, setNotificationSettings] = useState(loadNotificationSettings);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [portfolioBalances, setPortfolioBalances] = useState<VenueBalance[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [railActivityItems, setRailActivityItems] = useState<DashboardRailActivityItem[]>([]);
  const [railActivityLoading, setRailActivityLoading] = useState(false);
  const [railActivityError, setRailActivityError] = useState<string | null>(null);
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
  const toggleSelectedCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  };
  const toggleRouteType = (routeType: DashboardRouteFilter) => {
    setSelectedRouteTypes((current) =>
      current.includes(routeType) ? current.filter((item) => item !== routeType) : [...current, routeType]
    );
  };

  const pageTitle = activePage === 'markets' ? 'Markets' : 'Top Opportunities';
  const effectiveMarketViewMode = activePage === 'markets' ? 'list' : marketViewMode;
  const terminalApiFocusActive = activePage === 'terminal';
  const isMarketSurface = !terminalApiFocusActive && (activePage === 'home' || activePage === 'markets');
  const quotedMarketRows = useMemo(
    () => marketRows.map((market) => applyLiveQuoteToMarket(market, marketQuotes[market.id])),
    [marketRows, marketQuotes],
  );
  const filteredMarketRows = useMemo(
    () => applyPanelFiltersAndSort(
      applyQuickFilter(quotedMarketRows, marketFilter, watchlistIds),
      selectedCategories,
      selectedRouteTypes,
      marketSortKey,
    ),
    [marketFilter, marketSortKey, quotedMarketRows, selectedCategories, selectedRouteTypes, watchlistIds],
  );
  const terminalMarketSelections = useMemo<TerminalMarketSelection[]>(
    () => quotedMarketRows.map((market) => ({
      id: market.id,
      marketId: market.marketId,
      canonicalMarketIds: market.canonicalMarketIds,
      eventId: market.eventId,
      canonicalEventId: market.canonicalEventId,
      title: market.title,
      category: market.category,
      icon: market.icon,
      volume: market.volume,
      volume24h: market.volume24h,
      liquidity: market.liquidity,
      openInterest: market.openInterest,
      resolvesAt: market.resolvesAt,
      resolutionDateLabel: market.resolutionDateLabel,
      venueCount: market.venueCount,
      routeType: market.routeType,
      venues: market.venues,
      venueMarkets: market.venueMarkets,
      marketType: market.marketType,
      outcomes: market.outcomes,
      imageUrl: market.imageUrl,
      iconUrl: market.iconUrl,
      priceLabel: market.priceLabel,
      priceVenue: market.priceVenue,
      changeLabel: market.changeLabel,
      change24hLabel: market.change24hLabel,
      change24hDirection: market.change24hDirection,
    })),
    [quotedMarketRows],
  );
  const displayedMarkets = filteredMarketRows;
  const canLoadMoreMarkets = isMarketSurface && marketsHasMore && Boolean(marketNextCursor);
  const dashboardDiagnosticsEnabled = lotusMarketDiagnosticsEnabled();
  const emptyMarketCopy = marketFilter === 'watchlist'
    ? 'Your watchlist is empty. Bookmark markets from the cards or list to track them here.'
    : marketFilter === 'best_routes'
      ? 'No cross-venue routeable markets are available for this view yet.'
      : dashboardDiagnosticsEnabled
        ? 'Try another search. Lotus only shows backend-approved market metadata here.'
        : 'Try another search or choose a different category.';
  const filterCategory = selectedCategories.length === 1 ? selectedCategories[0] : categoryForQuickFilter(marketFilter);
  const marketSummary = useMemo(() => {
    const routeable = quotedMarketRows.filter((market) => market.venueCount > 0 && market.status !== 'RESOLVED_OR_EXPIRED').length;
    const crossVenue = quotedMarketRows.filter((market) => market.routeType !== 'Single').length;
    const livePriced = quotedMarketRows.filter((market) => Boolean(market.priceVenue)).length;
    const routePreviewRequired = dashboardDiagnosticsEnabled
      ? quotedMarketRows.filter((market) => market.quoteRequired).length
      : livePriced;
    return {
      routeable,
      crossVenue,
      routePreviewRequired,
      livePriced,
    };
  }, [dashboardDiagnosticsEnabled, quotedMarketRows]);
  const portfolioCashTotal = portfolioBalances.reduce((sum, balance) => {
    const parsed = Number(balance.availableAmount ?? balance.readyAmount ?? 0);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const portfolioPositionsTotal = parseCurrencyNumber(portfolioSummary?.totalMarkValue ?? portfolioSummary?.totalCostBasis);
  const portfolioPnlPercent = (() => {
    const costBasis = parseCurrencyNumber(portfolioSummary?.totalCostBasis);
    if (costBasis <= 0) return 0;
    return (parseCurrencyNumber(portfolioSummary?.totalUnrealizedPnl) / costBasis) * 100;
  })();
  const headerPortfolioRows = useMemo<HeaderPortfolioVenueRow[]>(() => {
    const preferredVenueOrder = ['POLYMARKET', 'LIMITLESS', 'PREDICT_FUN', 'OPINION', 'MYRIAD'];
    const rowsByVenue = new Map<string, HeaderPortfolioVenueRow>();
    const ensureRow = (venue: string) => {
      const key = venue.toUpperCase();
      const existing = rowsByVenue.get(key);
      if (existing) return existing;
      const row = { venue: key, cash: 0, positions: 0 };
      rowsByVenue.set(key, row);
      return row;
    };

    preferredVenueOrder.forEach(ensureRow);

    portfolioBalances.forEach((balance) => {
      const row = ensureRow(balance.venue);
      row.cash += parseCurrencyNumber(balance.availableAmount ?? balance.readyAmount);
    });

    portfolioSummary?.positions?.forEach((position) => {
      const row = ensureRow(position.venue);
      const markedValue = parseCurrencyNumber(position.markValue);
      if (markedValue > 0) {
        row.positions += markedValue;
        return;
      }
      const size = Number(position.verifiedSize ?? 0);
      const entryPrice = Number(position.averageEntryPrice ?? 0);
      if (Number.isFinite(size) && Number.isFinite(entryPrice) && size > 0 && entryPrice > 0) {
        row.positions += size * entryPrice;
      }
    });

    return Array.from(rowsByVenue.values()).sort((left, right) => {
      const leftIndex = preferredVenueOrder.indexOf(left.venue);
      const rightIndex = preferredVenueOrder.indexOf(right.venue);
      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
      }
      return left.venue.localeCompare(right.venue);
    });
  }, [portfolioBalances, portfolioSummary]);
  const portfolioValueLabel = portfolioLoading
    ? 'Syncing'
    : portfolioSummary?.totalMarkValue !== null && portfolioSummary?.totalMarkValue !== undefined
      ? formatCurrencyValue(portfolioSummary.totalMarkValue)
      : portfolioError
        ? dashboardDiagnosticsEnabled ? 'Unavailable' : 'Updating'
        : formatCurrencyValue(portfolioCashTotal);
  const portfolioCashLabel = portfolioLoading
    ? 'Syncing'
    : portfolioError
        ? dashboardDiagnosticsEnabled ? 'Unavailable' : 'Updating'
        : formatCurrencyValue(portfolioCashTotal);
  const portfolioPositionsLabel = portfolioLoading
    ? 'Syncing'
    : portfolioSummary
      ? `${portfolioSummary.positionCount} verified`
      : portfolioError
        ? dashboardDiagnosticsEnabled ? 'Unavailable' : 'Updating'
        : 'Verified only';
  const portfolioMtmLabel = portfolioSummary
    ? !dashboardDiagnosticsEnabled
      ? 'MTM'
      : portfolioSummary.unavailableMarkCount > 0
      ? `${portfolioSummary.markedPositionCount}/${portfolioSummary.positionCount} marked`
      : 'MTM'
    : portfolioError || !dashboardDiagnosticsEnabled ? 'MTM' : 'MTM unavailable';
  const recentActivityItems = useMemo(() => {
    const notificationRows: DashboardRailActivityItem[] = notificationItems.slice(0, 4).map((notification) => ({
      type: notification.severity === 'success' ? 'buy' : notification.severity === 'error' || notification.severity === 'warning' ? 'sell' : 'route',
      title: notification.title,
      market: notification.body,
      time: formatRelativeTime(notification.createdAt) || 'Live',
      price: notification.readAt ? '' : 'New',
      timestamp: activityTimestamp(notification.createdAt),
    }));
    return (railActivityItems.length > 0 ? railActivityItems : notificationRows).slice(0, 4);
  }, [
    notificationItems,
    railActivityItems,
  ]);
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
    if ((market.venueMarkets?.length ?? 0) > 0 || !market.marketId) return;
    getMarket(market.marketId)
      .then((response) => {
        const fullMarket = response.market;
        setSelectedTerminalMarket((current) => {
          if (!current || current.marketId !== market.marketId) return current;
          return {
            ...current,
            venueMarkets: fullMarket.venueMarkets,
            venues: venuesForCatalogMarket(fullMarket),
            marketType: fullMarket.outcomeCount > 2 ? 'multi' : 'binary',
            imageUrl: getSafeMediaUrl(fullMarket.imageUrl) ?? current.imageUrl,
            iconUrl: getSafeMediaUrl(fullMarket.iconUrl) ?? current.iconUrl,
          };
        });
      })
      .catch(() => {
        // Terminal can still render compact display data; detail panels will show unavailable metadata.
      });
  };

  const toggleMarketWatch = (marketId: string) => {
    setWatchlistIds((current) => {
      const next = current.includes(marketId)
        ? current.filter((id) => id !== marketId)
        : [...current, marketId];
      saveWatchlistIds(next);
      return next;
    });
  };

  const filterButtonClass = (active: boolean, tone: 'default' | 'lotus' | 'hot' = 'default') => {
    if (active && tone === 'hot') {
      return 'flex items-center gap-2 px-3 py-2 bg-zinc-900 dark:bg-zinc-100 border border-zinc-900 dark:border-zinc-100 rounded-lg text-sm font-medium text-white dark:text-zinc-900 shadow-sm transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]';
    }
    if (active || tone === 'lotus') {
      return 'flex items-center gap-2 px-3 py-2 bg-[#ccff00]/10 border border-[#ccff00]/30 rounded-lg text-sm font-medium text-zinc-900 dark:text-[#ccff00] hover:bg-[#ccff00]/20 transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]';
    }
    return 'flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]';
  };
  const panelCategoryOptions = ['Sports', 'Politics', 'Crypto', 'Business', 'Technology', 'Health'];
  const routeTypeOptions: DashboardRouteFilter[] = ['Strict all', 'Tri', 'Pair', 'Single'];
  const sortOptions: Array<{ id: DashboardSortKey; label: string }> = [
    { id: 'volume', label: 'Volume' },
    { id: 'liquidity', label: 'Liquidity' },
    { id: 'closing', label: 'Closing period' },
    { id: 'buys', label: 'Buys' },
    { id: 'sells', label: 'Sells' },
    { id: 'best_route', label: 'Best route' },
  ];

  useEffect(() => {
    if (!fundingModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFundingModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fundingModal]);

  useEffect(() => {
    if (!isMarketSurface) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMarketsLoading(true);
      setMarketsError(null);
      listMarkets({
        category: filterCategory,
        cursor: MARKET_CATALOG_FIRST_CURSOR,
        search: searchQuery.trim() || undefined,
        limit: activePage === 'markets' ? MARKET_PAGE_SIZE : HOME_MARKET_SOURCE_PAGE_SIZE,
        quoteReadyOnly: true,
        routeCoverage: 'all',
        view: 'compact',
      })
        .then((response) => {
          if (cancelled) return;
          setMarketRows(mapCatalogMarketsToDashboardRows(response.markets));
          setMarketNextCursor(response.nextCursor ?? null);
          setMarketsHasMore(Boolean(response.hasMore));
        })
        .catch((error) => {
          if (cancelled) return;
          setMarketsError(toSafeErrorMessage(error, 'Market catalog is unavailable right now.'));
          setMarketRows([]);
          setMarketNextCursor(null);
          setMarketsHasMore(false);
        })
        .finally(() => {
          if (!cancelled) setMarketsLoading(false);
        });
    }, searchQuery.trim() ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activePage, filterCategory, isMarketSurface, searchQuery]);

  const loadMoreMarkets = useCallback(async () => {
    if (!isMarketSurface || !marketNextCursor || marketsLoading || marketsLoadingMore) return;
    setMarketsLoadingMore(true);
    setMarketsError(null);
    try {
      const response = await listMarkets({
        category: filterCategory,
        cursor: marketNextCursor,
        search: searchQuery.trim() || undefined,
        limit: activePage === 'markets' ? MARKET_PAGE_SIZE : HOME_MARKET_SOURCE_PAGE_SIZE,
        quoteReadyOnly: true,
        routeCoverage: 'all',
        view: 'compact',
      });
      const nextRows = mapCatalogMarketsToDashboardRows(response.markets);
      setMarketRows((current) => {
        const byId = new Map(current.map((market) => [market.id, market]));
        for (const row of nextRows) byId.set(row.id, row);
        return [...byId.values()];
      });
      setMarketNextCursor(response.nextCursor ?? null);
      setMarketsHasMore(Boolean(response.hasMore));
    } catch (error) {
      setMarketsError(toSafeErrorMessage(error, 'Market catalog is unavailable right now.'));
    } finally {
      setMarketsLoadingMore(false);
    }
  }, [
    activePage,
    filterCategory,
    isMarketSurface,
    marketNextCursor,
    marketsLoading,
    marketsLoadingMore,
    searchQuery,
  ]);

  useEffect(() => {
    if (!isMarketSurface || marketRows.length === 0) {
      setMarketQuotes({});
      return;
    }

    let cancelled = false;
    const marketsToQuote = marketRows
      .map((market) => ({
        market,
        outcomes: market.outcomes,
      }))
      .filter((item) => item.outcomes.length > 0);

    if (marketsToQuote.length === 0) {
      setMarketQuotes({});
      return;
    }

    const diagnosticsEnabled = lotusMarketDiagnosticsEnabled();
    const displayMode = diagnosticsEnabled ? 'debug' as const : 'user' as const;
    const loadQuotes = async () => {
      const requestItems = marketsToQuote.flatMap(({ market, outcomes }) =>
        outcomes.map((outcome) => ({
          parentMarketId: market.id,
          outcomeId: outcome.id,
          marketId: outcome.marketId ?? market.marketId,
          canonicalMarketIds: market.canonicalMarketIds.length > 0
            ? market.canonicalMarketIds
            : [outcome.marketId ?? market.marketId],
          quoteOutcomeId: outcome.quoteOutcomeId,
        }))
      );

      const chunks = chunkArray(requestItems, MARKET_LIVE_PRICE_CHUNK_SIZE);
      await Promise.all(chunks.map(async (chunk) => {
        try {
          const response = await getMarketLivePrices({
            items: chunk.map((item) => ({
              marketId: item.marketId,
              canonicalMarketIds: item.canonicalMarketIds,
              outcomeId: item.quoteOutcomeId,
            })),
          });
          if (cancelled) return;
          const priceByKey = new Map(response.prices.map((price) => [`${price.marketId}:${price.outcomeId ?? ''}`, price]));
          const nextByMarket = new Map<string, Record<string, DashboardOutcomeQuote>>();
          const missingForDiagnostics: typeof chunk = [];
          for (const item of chunk) {
            const price =
              priceByKey.get(`${item.marketId}:${item.quoteOutcomeId}`) ??
              priceByKey.get(`${item.marketId}:${normalizeOutcomeId(item.quoteOutcomeId)}`) ??
              (item.quoteOutcomeId === 'YES' ? priceByKey.get(`${item.marketId}:`) : undefined);
            const displayQuote = toOutcomeQuoteFromLivePrice(item.outcomeId, price);
            const bucket = nextByMarket.get(item.parentMarketId) ?? {};
            bucket[item.outcomeId] = displayQuote;
            nextByMarket.set(item.parentMarketId, bucket);
            if (diagnosticsEnabled && displayQuote.status !== 'live') {
              missingForDiagnostics.push(item);
            }
          }

          if (diagnosticsEnabled && missingForDiagnostics.length > 0) {
            const batchResponse = await getMarketBatchQuotes({
              items: missingForDiagnostics.map((item) => ({
                marketId: item.marketId,
                outcomeId: item.quoteOutcomeId,
                side: 'buy' as const,
                amount: '1',
              })),
              displayMode,
            });
            if (cancelled) return;
            const quoteByKey = new Map(batchResponse.quotes.map((quote) => [`${quote.marketId}:${quote.outcomeId}:buy`, quote]));
            for (const item of missingForDiagnostics) {
              const quote = quoteByKey.get(`${item.marketId}:${item.quoteOutcomeId}:buy`);
              const bucket = nextByMarket.get(item.parentMarketId) ?? {};
              bucket[item.outcomeId] = quote
                ? toOutcomeQuoteFromBatch(quote)
                : toOutcomeQuote(item.outcomeId, null, new Error('QUOTE_UNAVAILABLE'));
              nextByMarket.set(item.parentMarketId, bucket);
            }
          }

          setMarketQuotes((current) => {
            const next = { ...current };
            for (const [marketId, outcomes] of nextByMarket.entries()) {
              next[marketId] = {
                marketId,
                outcomes: {
                  ...(next[marketId]?.outcomes ?? {}),
                  ...outcomes,
                },
                sellOutcomes: next[marketId]?.sellOutcomes,
              };
            }
            return next;
          });
        } catch {
          // Keep last-good quotes visible; failed chunks will retry on the next poll.
        }
      }));
    };

    loadQuotes();
    const interval = window.setInterval(loadQuotes, 12_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isMarketSurface, marketRows]);

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

  useEffect(() => {
    if (!session?.userJwt) {
      setPortfolioSummary(null);
      setPortfolioBalances([]);
      setPortfolioError(null);
      setPortfolioLoading(false);
      return;
    }
    if (terminalApiFocusActive) {
      setPortfolioLoading(false);
      return;
    }

    let cancelled = false;
    const loadPortfolioRail = async () => {
      setPortfolioLoading(true);
      setPortfolioError(null);
      try {
        const [summary, balanceResponse] = await Promise.all([
          getPortfolioSummary(session.userJwt),
          getVenueBalances(session.userJwt),
        ]);
        if (cancelled) return;
        setPortfolioSummary(summary);
        setPortfolioBalances(balanceResponse.balances ?? balanceResponse.venues ?? []);
      } catch (error) {
        if (cancelled) return;
        setPortfolioError(toSafeErrorMessage(error, 'Portfolio summary is unavailable right now.'));
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    };

    loadPortfolioRail();
    const interval = window.setInterval(loadPortfolioRail, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.userJwt, terminalApiFocusActive]);

  useEffect(() => {
    if (!session?.userJwt) {
      setRailActivityItems([]);
      setRailActivityError(null);
      setRailActivityLoading(false);
      return;
    }
    if (terminalApiFocusActive) {
      setRailActivityLoading(false);
      return;
    }

    let cancelled = false;
    const loadRailActivity = async () => {
      setRailActivityLoading(true);
      setRailActivityError(null);
      try {
        const [executionResponse, fundingResponse] = await Promise.all([
          getExecutionHistory(session.userJwt, { limit: 6 }),
          getFundingHistory(session.userJwt, { limit: 6 }),
        ]);
        if (cancelled) return;
        const nextItems = [
          ...(executionResponse.items ?? []).map(mapExecutionActivity),
          ...fundingHistoryRows(fundingResponse).map(mapFundingActivity),
        ]
          .sort((left, right) => right.timestamp - left.timestamp)
          .slice(0, 4);
        setRailActivityItems(nextItems);
      } catch (error) {
        if (!cancelled) setRailActivityError(toSafeErrorMessage(error, 'Recent activity is unavailable right now.'));
      } finally {
        if (!cancelled) setRailActivityLoading(false);
      }
    };

    loadRailActivity();
    const interval = window.setInterval(loadRailActivity, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.userJwt, terminalApiFocusActive]);

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
    <div className={`${isDarkMode ? 'dark' : ''} h-full min-h-0 w-full`}>
      <div className="flex h-full min-h-0 w-full bg-[#F7F8FA] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
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
          <NavItem icon={<Settings className="w-4 h-4" />} active={activePage === 'settings'} label="Settings" onClick={() => onNavigate?.('settings')} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 px-3 sm:px-5 shrink-0">
          <div className="flex min-w-0 items-center gap-4 w-full max-w-[min(24rem,calc(100vw-9rem))] sm:max-w-sm">
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
          <div className="flex shrink-0 items-center gap-3 pr-16 sm:pr-56 lg:pr-72">
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
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ccff00] rounded-full border-2 border-white dark:border-zinc-900"></span>
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
                  <div className={notificationPopoverClass(notificationSettings.toastPosition)}>
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
                          <NotificationToast
                            key={item.notificationId}
                            icon={<Icon className="h-4 w-4" aria-hidden />}
                            tone={display.tone}
                            title={item.title}
                            timeLabel={formatRelativeTime(item.createdAt)}
                            description={item.body}
                            meta={display.meta}
                            unread={item.readAt === null}
                            onSelect={() => handleReadNotification(item)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <HeaderPortfolioSummary
                cashTotal={portfolioCashTotal}
                positionsTotal={portfolioPositionsTotal}
                pnlPercent={portfolioPnlPercent}
                rows={headerPortfolioRows}
                loading={portfolioLoading}
              />
              <button
                type="button"
                onClick={() => setFundingModal('deposit')}
                className="relative inline-flex h-9 items-center justify-center overflow-hidden rounded-full border border-[#e5ff73]/60 bg-[#ccff00] px-4 text-xs font-black text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_rgba(204,255,0,0.12)] transition-colors before:absolute before:inset-x-2 before:top-0 before:h-1/2 before:rounded-full before:bg-white/20 hover:bg-[#d8ff2f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              >
                <span className="relative z-10">Deposit</span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-24 sm:p-4 sm:pb-24 xl:p-5 xl:pb-24 custom-scrollbar flex flex-col gap-3 sm:gap-4 xl:flex-row">
          {isMarketSurface ? (
          <>
          
          {/* Left Column: Filters & Intelligence */}
          <div className={`relative shrink-0 flex flex-col gap-5 hidden xl:flex transition-all duration-300 ${isFilterCollapsed ? 'w-0 border-transparent' : 'w-56 pr-4 border-zinc-200 dark:border-zinc-800'} border-r`}>
            {isFilterCollapsed ? (
              null
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
                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Categories</h4>
                    {selectedCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a9900] hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 p-3">
                    {panelCategoryOptions.map((category) => {
                      const active = selectedCategories.includes(category);
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => toggleSelectedCategory(category)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${active ? 'border-[#ccff00]/60 bg-[#ccff00]/15 text-[#ccff00]' : 'border-zinc-200 bg-white text-zinc-700 hover:border-[#ccff00]/35 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100'}`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Route Type</h4>
                    {selectedRouteTypes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedRouteTypes([])}
                        className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a9900] hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 p-3">
                    {routeTypeOptions.map((routeType) => {
                      const active = selectedRouteTypes.includes(routeType);
                      return (
                        <button
                          key={routeType}
                          type="button"
                          onClick={() => toggleRouteType(routeType)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${active ? 'border-[#ccff00]/60 bg-[#ccff00]/15 text-[#ccff00]' : 'border-zinc-200 bg-white text-zinc-700 hover:border-[#ccff00]/35 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100'}`}
                        >
                          {routeType}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100" htmlFor="dashboard-sort-by">Sort by</label>
                  <select
                    id="dashboard-sort-by"
                    value={marketSortKey}
                    onChange={(event) => setMarketSortKey(event.target.value as DashboardSortKey)}
                    className="mt-2 h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 outline-none transition focus:border-[#ccff00]/60 focus:ring-2 focus:ring-[#ccff00]/25 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Center Column: Main Feed */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            
            {/* Quick Filters */}
            <div className="flex items-center flex-wrap gap-3 pb-2">
              <button
                type="button"
                aria-label={isFilterCollapsed ? 'Show filters' : 'Hide filters'}
                onClick={() => setIsFilterCollapsed((current) => !current)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] ${!isFilterCollapsed ? 'border-[#ccff00]/45 bg-[#ccff00]/10 text-[#ccff00]' : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'}`}
                title={isFilterCollapsed ? 'Show filters' : 'Hide filters'}
              >
                <Filter className="h-4 w-4" />
              </button>
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
              <button
                type="button"
                onClick={() => setMarketFilter((current) => current === 'watchlist' ? 'all' : 'watchlist')}
                className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] ${marketFilter === 'watchlist' ? 'border-[#ccff00]/45 bg-[#ccff00]/10 text-[#ccff00]' : 'border-zinc-200 bg-white text-zinc-800 hover:border-[#ccff00]/40 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-[#ccff00]/40'}`}
              >
                <Bookmark className="h-4 w-4 text-zinc-500 dark:text-zinc-400" /> Watchlist
              </button>
              <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-white p-0.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => onNavigate?.('home')}
                  className={`h-8 rounded-lg px-4 text-sm font-bold transition ${activePage === 'home' ? 'bg-[#ccff00] text-black shadow-[0_0_18px_rgba(204,255,0,0.18)]' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'}`}
                >
                  Events
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate?.('markets')}
                  className={`h-8 rounded-lg px-4 text-sm font-bold transition ${activePage === 'markets' ? 'bg-[#ccff00] text-black shadow-[0_0_18px_rgba(204,255,0,0.18)]' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'}`}
                >
                  Markets
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMarketFilter('all')}
                className={`flex h-10 items-center rounded-full px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] ${marketFilter === 'all' ? 'bg-[#ccff00] text-black shadow-[0_0_18px_rgba(204,255,0,0.16)]' : 'border border-zinc-200 bg-white text-zinc-700 hover:border-[#ccff00]/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'}`}
              >
                All
              </button>
              <button type="button" onClick={() => setMarketFilter('sports')} className={filterButtonClass(marketFilter === 'sports')}>
                <Trophy className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> Sports
              </button>
              <button type="button" onClick={() => setMarketFilter('crypto')} className={filterButtonClass(marketFilter === 'crypto')}>
                <Database className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> Crypto
              </button>
              <button type="button" onClick={() => setMarketFilter('politics')} className={filterButtonClass(marketFilter === 'politics')}>
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
                  <MarketGridMessage title="No markets found" body={emptyMarketCopy} />
                )}
                {displayedMarkets.map((market) => (
                  <MarketCard
                    key={market.id}
                    {...market}
                    isWatched={watchlistIds.includes(market.id)}
                    onToggleWatch={toggleMarketWatch}
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
                  watchlistIds={watchlistIds}
                  onToggleWatch={toggleMarketWatch}
                  onOpenMarket={openMarketInTerminal}
                  emptyCopy={emptyMarketCopy}
                />
              )}
              {canLoadMoreMarkets && (
                <div className="mt-4 mb-10 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreMarkets}
                    disabled={marketsLoadingMore}
                    className="rounded-lg border border-[#ccff00]/40 bg-[#ccff00]/10 px-4 py-2 text-xs font-bold text-[#ccff00] transition hover:bg-[#ccff00]/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                  >
                    {marketsLoadingMore ? 'Loading markets...' : `Load ${activePage === 'markets' ? MARKET_PAGE_SIZE : HOME_MARKET_LOAD_MORE_SIZE} more`}
                  </button>
                </div>
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
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{dashboardDiagnosticsEnabled ? 'Quote Pending' : 'Live Prices'}</span>
                  <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{marketSummary.routePreviewRequired}</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recent Activity</h3>
              </div>
              
              <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-zinc-200 dark:before:bg-zinc-700">
                {railActivityLoading && recentActivityItems.length === 0 ? (
                  <ActivityItem type="route" title="Loading activity" market="Checking recent trades and funding activity" time="Live" price="" />
                ) : recentActivityItems.map((item, index) => (
                  <ActivityItem
                    key={`${item.title}-${index}`}
                    type={item.type}
                    title={item.title}
                    market={item.market}
                    time={item.time}
                    price={item.price}
                  />
                ))}
                {!railActivityLoading && recentActivityItems.length === 0 && !railActivityError && (
                  <ActivityItem type="route" title="No recent activity" market="Buys, sells, deposits, and withdrawals will appear here." time="" price="" />
                )}
                {railActivityError && (
                  <ActivityItem
                    type="sell"
                    title="Recent activity unavailable"
                    market={railActivityError}
                    time="Retry"
                    price=""
                  />
                )}
              </div>
            </div>
          </div>
          </>
          ) : activePage === 'terminal' ? (
            <div className="min-w-0 flex-1">
              <InfraTradingTerminal
                embedded
                darkMode={isDarkMode}
                selectedMarket={selectedTerminalMarket}
                relatedMarkets={terminalMarketSelections}
                session={session}
              />
            </div>
          ) : activePage === 'portfolio' ? (
            <div className="min-w-0 flex-1">
              <PortfolioMockupV2 session={session} />
            </div>
          ) : (
            <SettingsPage
              settings={notificationSettings}
              onSettingsChange={(nextSettings) => {
                setNotificationSettings(nextSettings);
                saveNotificationSettings(nextSettings);
              }}
              onClose={() => onNavigate?.('home')}
            />
          )}
        </div>
      </main>
      </div>
      {fundingModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Deposit funds"
          className="fixed left-0 top-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-black/60 px-4 py-6 backdrop-blur-md"
        >
          <button
            type="button"
            aria-label="Close funding modal"
            onClick={() => setFundingModal(null)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative z-10 w-full max-w-[400px]">
            <FundingDeposit initialMode="deposit" modal onClose={() => setFundingModal(null)} session={session} />
          </div>
        </div>,
        document.body
      )}
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

type ConnectedOauthProvider = {
  providerId: string;
  providerName: string;
};

function normalizeProviderName(providerName: string): string {
  return providerName.trim().toLowerCase();
}

function getLinkedProvider(providers: ConnectedOauthProvider[] | undefined, providerName: OAuthProviders): ConnectedOauthProvider | null {
  const target = normalizeProviderName(providerName);
  return providers?.find((provider) => normalizeProviderName(provider.providerName) === target) ?? null;
}

function formatLinkedEmail(email: string | undefined): string {
  if (!email) return 'Not linked';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const visibleName = name.length <= 2 ? name : `${name.slice(0, 2)}...`;
  return `${visibleName}@${domain}`;
}

const SettingsPage = ({
  settings,
  onSettingsChange,
  onClose,
}: {
  settings: { toastPosition: ToastPosition; notificationsEnabled: boolean; notificationSound: boolean };
  onSettingsChange: (settings: { toastPosition: ToastPosition; notificationsEnabled: boolean; notificationSound: boolean }) => void;
  onClose: () => void;
}) => {
  const [activeSection, setActiveSection] = useState<'notifications' | 'animations' | 'connected'>('notifications');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [connectedAppsStatus, setConnectedAppsStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [connectedAppsBusyId, setConnectedAppsBusyId] = useState<string | null>(null);
  const {
    user,
    session: turnkeySession,
    handleAddEmail,
    handleRemoveUserEmail,
    handleAddOauthProvider,
    handleRemoveOauthProvider,
    refreshUser,
  } = useTurnkey();
  const updateNotificationSetting = (partial: Partial<typeof settings>) => {
    onSettingsChange({ ...settings, ...partial });
  };
  const turnkeyOrganizationId = turnkeySession?.organizationId;
  const turnkeyUserId = turnkeySession?.userId;
  const oauthProviders = (user?.oauthProviders ?? []) as ConnectedOauthProvider[];
  const linkedGoogle = getLinkedProvider(oauthProviders, OAuthProviders.GOOGLE);
  const linkedX = getLinkedProvider(oauthProviders, OAuthProviders.X);

  const runConnectedAppAction = async (busyId: string, action: () => Promise<void>, successMessage: string) => {
    setConnectedAppsBusyId(busyId);
    setConnectedAppsStatus(null);
    try {
      await action();
      if (turnkeyOrganizationId && turnkeyUserId) {
        await refreshUser({ organizationId: turnkeyOrganizationId, userId: turnkeyUserId }).catch(() => undefined);
      }
      setConnectedAppsStatus({ tone: 'success', message: successMessage });
    } catch (error) {
      setConnectedAppsStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to update the connected account.',
      });
    } finally {
      setConnectedAppsBusyId(null);
    }
  };

  const linkEmail = () => runConnectedAppAction(
    'email',
    async () => {
      await handleAddEmail({
        title: 'Link email',
        subTitle: 'Add an email address to your Lotus account.',
        successPageDuration: 1200,
      });
    },
    'Email linked.',
  );

  const unlinkEmail = () => runConnectedAppAction(
    'email',
    async () => {
      await handleRemoveUserEmail({
        userId: turnkeyUserId,
        organizationId: turnkeyOrganizationId,
        successPageDuration: 1200,
      });
    },
    'Email unlinked.',
  );

  const linkOauthProvider = (providerName: OAuthProviders, label: string) => runConnectedAppAction(
    providerName,
    async () => {
      await handleAddOauthProvider({
        providerName,
        openInPage: true,
        successPageDuration: 1200,
      });
    },
    `${label} linked.`,
  );

  const unlinkOauthProvider = (provider: ConnectedOauthProvider, label: string) => runConnectedAppAction(
    provider.providerName,
    async () => {
      await handleRemoveOauthProvider({
        providerId: provider.providerId,
        organizationId: turnkeyOrganizationId,
        title: `Unlink ${label}`,
        subTitle: `Remove ${label} from this Lotus account.`,
        successPageDuration: 1200,
      });
    },
    `${label} unlinked.`,
  );

  const positions = [
    { id: 'top-left' as const, label: 'Top Left' },
    { id: 'top-center' as const, label: 'Top Center' },
    { id: 'top-right' as const, label: 'Top Right' },
    { id: 'bottom-left' as const, label: 'Bottom Left' },
    { id: 'bottom-center' as const, label: 'Bottom Center' },
    { id: 'bottom-right' as const, label: 'Bottom Right' },
  ];
  const navItems = [
    { id: 'notifications' as const, label: 'Notifications', Icon: Bell },
    { id: 'animations' as const, label: 'Animations', Icon: Sparkles },
    { id: 'connected' as const, label: 'Connected Apps', Icon: Globe },
  ];

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-[#070708] p-3 pb-16 sm:p-4">
      <div className="relative min-h-full rounded-xl border border-zinc-900 bg-[#0c0c0d]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 transition hover:border-[#ccff00]/40 hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 sm:right-8 sm:top-8"
          aria-label="Close settings"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="grid min-h-[calc(100dvh-7rem)] grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-zinc-800 p-4 md:border-b-0 md:border-r">
            <h2 className="mb-5 text-sm font-bold text-white">Settings</h2>
            <nav className="space-y-2">
              {navItems.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSection(id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${activeSection === id ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          <section className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            {activeSection === 'notifications' && (
              <div>
                <h1 className="text-base font-bold text-white">Notifications</h1>
                <p className="mt-2 text-xs text-zinc-500">Configure how and when you receive notifications.</p>
                <div className="mt-8 space-y-7">
                  <SettingsToggle label="Display Notification" enabled={settings.notificationsEnabled} onChange={(value) => updateNotificationSetting({ notificationsEnabled: value })} />
                  <div>
                    <div className="mb-3 text-xs font-medium text-zinc-400">Toast Position</div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                      {positions.map((position) => (
                        <button
                          key={position.id}
                          type="button"
                          onClick={() => updateNotificationSetting({ toastPosition: position.id })}
                          className={`rounded-lg border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${settings.toastPosition === position.id ? 'border-[#ccff00]/60 bg-[#ccff00]/10' : 'border-zinc-800 bg-zinc-950/50 hover:border-[#ccff00]/30'}`}
                        >
                          <div className="relative h-8 rounded border border-zinc-800 bg-[#171719]">
                            <span className={`absolute h-2 w-2 rounded-full bg-[#ccff00] shadow-[0_0_10px_rgba(204,255,0,0.5)] ${position.id.includes('top') ? 'top-2' : 'bottom-2'} ${position.id.includes('left') ? 'left-2' : position.id.includes('right') ? 'right-2' : 'left-1/2 -translate-x-1/2'}`} />
                            <span className="absolute left-5 right-3 top-2 h-1 rounded bg-zinc-700" />
                            <span className="absolute left-5 right-8 top-4 h-1 rounded bg-zinc-800" />
                          </div>
                          <div className={`mt-2 text-[11px] ${settings.toastPosition === position.id ? 'font-semibold text-[#ccff00]' : 'text-zinc-400'}`}>{position.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <SettingsToggle label="Notification Sound" enabled={settings.notificationSound} onChange={(value) => updateNotificationSetting({ notificationSound: value })} />
                </div>
              </div>
            )}

            {activeSection === 'animations' && (
              <div>
                <h1 className="text-base font-bold text-white">Animations</h1>
                <p className="mt-2 text-xs text-zinc-500">Control motion and visual feedback across Lotus.</p>
                <div className="mt-8 space-y-5">
                  <SettingsToggle label="Reduce Motion" enabled={reducedMotion} onChange={setReducedMotion} />
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-xs text-zinc-500">
                    Motion preferences are local to this browser.
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'connected' && (
              <div>
                <h1 className="text-base font-bold text-white">Connected Apps</h1>
                <p className="mt-2 text-xs text-zinc-500">Manage account-linked services and wallet sessions.</p>
                <div className="mt-8 space-y-3">
                  <ConnectedAppRow name="Turnkey" status="Connected" statusTone="success" />
                  <ConnectedAppRow
                    name="Email"
                    status={formatLinkedEmail(user?.userEmail)}
                    statusTone={user?.userEmail ? 'success' : 'muted'}
                    actionLabel={user?.userEmail ? 'Unlink' : 'Link'}
                    actionTone={user?.userEmail ? 'neutral' : 'primary'}
                    busy={connectedAppsBusyId === 'email'}
                    onAction={user?.userEmail ? unlinkEmail : linkEmail}
                  />
                  <ConnectedAppRow
                    name="X / Twitter"
                    status={linkedX ? 'Linked' : 'Not linked'}
                    statusTone={linkedX ? 'success' : 'muted'}
                    actionLabel={linkedX ? 'Unlink' : 'Link'}
                    actionTone={linkedX ? 'neutral' : 'primary'}
                    busy={connectedAppsBusyId === OAuthProviders.X || connectedAppsBusyId === linkedX?.providerName}
                    onAction={linkedX ? () => unlinkOauthProvider(linkedX, 'X / Twitter') : () => linkOauthProvider(OAuthProviders.X, 'X / Twitter')}
                  />
                  <ConnectedAppRow
                    name="Google"
                    status={linkedGoogle ? 'Linked' : 'Not linked'}
                    statusTone={linkedGoogle ? 'success' : 'muted'}
                    actionLabel={linkedGoogle ? 'Unlink' : 'Link'}
                    actionTone={linkedGoogle ? 'neutral' : 'primary'}
                    busy={connectedAppsBusyId === OAuthProviders.GOOGLE || connectedAppsBusyId === linkedGoogle?.providerName}
                    onAction={linkedGoogle ? () => unlinkOauthProvider(linkedGoogle, 'Google') : () => linkOauthProvider(OAuthProviders.GOOGLE, 'Google')}
                  />
                </div>
                {connectedAppsStatus ? (
                  <div className={`mt-4 rounded-lg border px-3 py-2 text-xs font-medium ${connectedAppsStatus.tone === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-red-500/25 bg-red-500/10 text-red-300'}`}>
                    {connectedAppsStatus.message}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

const SettingsToggle = ({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (value: boolean) => void }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-zinc-400">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative h-4 w-8 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${enabled ? 'bg-[#ccff00]' : 'bg-zinc-800'}`}
      aria-pressed={enabled}
    >
      <span className={`absolute top-0.5 h-3 w-3 rounded-full transition ${enabled ? 'right-0.5 bg-black' : 'left-0.5 bg-zinc-400'}`} />
    </button>
  </div>
);

const ConnectedAppRow = ({
  name,
  status,
  statusTone = 'muted',
  actionLabel,
  actionTone = 'neutral',
  busy = false,
  onAction,
}: {
  name: string;
  status: string;
  statusTone?: 'success' | 'muted';
  actionLabel?: string;
  actionTone?: 'primary' | 'neutral';
  busy?: boolean;
  onAction?: () => void;
}) => (
  <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
    <div className="min-w-0">
      <span className="block text-sm font-semibold text-white">{name}</span>
      <span className={`mt-1 block truncate text-xs ${statusTone === 'success' ? 'text-emerald-300' : 'text-zinc-500'}`}>{status}</span>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${
          actionTone === 'primary'
            ? 'border-[#ccff00]/40 bg-[#ccff00]/10 text-[#ccff00] hover:bg-[#ccff00]/15'
            : 'border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700 hover:text-white'
        }`}
      >
        {busy ? 'Working...' : actionLabel}
      </button>
    ) : null}
  </div>
);

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
  useEffect(() => setImageFailed(false), [mediaUrl]);
  const showMedia = mediaUrl && !imageFailed;
  const topicLogoId = resolveTopicAssetLogoId(title);
  const useTopicFallback = Boolean(topicLogoId) || icon === 'L' || !icon;

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
      ) : useTopicFallback ? (
        <CryptoLogo
          id={topicLogoId ?? title}
          label={title}
          className="h-full w-full rounded-[inherit]"
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
  <div className="min-h-[452px] rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#121214]">
    <div className="flex gap-3">
      <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      </div>
    </div>
    <div className="mt-5 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
    <div className="mt-5 space-y-2">
      {[0, 1, 2, 3, 4].map((item) => (
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
  watchlistIds,
  onToggleWatch,
  onOpenMarket,
  emptyCopy,
}: {
  markets: DashboardMarketRow[];
  loading: boolean;
  error: string | null;
  watchlistIds: string[];
  onToggleWatch: (marketId: string) => void;
  onOpenMarket?: (market: Pick<TerminalMarketSelection, 'title' | 'category' | 'icon' | 'volume' | 'venueCount' | 'routeType'> & Partial<TerminalMarketSelection>) => void;
  emptyCopy: string;
}) => {
  const changeClass = (direction: DashboardMarketRow['change24hDirection']) => {
    if (direction === 'positive') return 'text-emerald-400';
    if (direction === 'negative') return 'text-red-400';
    return 'text-zinc-500';
  };
  return (
  <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-zinc-800 bg-[#101012] shadow-sm custom-scrollbar">
    <div className="grid min-w-[1150px] grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 border-b border-zinc-800 bg-zinc-900/80 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">
      <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-[#ccff00]" /> Market</div>
      <div>Last 7 Days</div>
      <div>Yes Price</div>
      <div>24h</div>
      <div>Volume 24h</div>
      <div>Closes By</div>
      <div>Spread</div>
      <div className="text-right">Trade</div>
    </div>
    <div className="min-w-[1150px] divide-y divide-zinc-800">
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
        <div className="px-5 py-6 text-sm font-medium text-zinc-400">{emptyCopy}</div>
      )}
      {markets.map((market) => {
        const statusBadge = marketQuoteStatusBadge(market.quoteStatus);
        return (
        <div key={market.id} className="group grid grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#ccff00]/[0.035]">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70" aria-label={`Expand ${market.title}`}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onToggleWatch(market.id)}
              className={`flex h-7 w-5 shrink-0 items-center justify-center rounded-md transition hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${watchlistIds.includes(market.id) ? 'text-[#ccff00]' : 'text-zinc-500'}`}
              aria-label={`${watchlistIds.includes(market.id) ? 'Remove' : 'Add'} ${market.title} ${watchlistIds.includes(market.id) ? 'from' : 'to'} watchlist`}
            >
              <Bookmark className={`h-3.5 w-3.5 ${watchlistIds.includes(market.id) ? 'fill-current' : ''}`} />
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
                  {statusBadge && (
                    <>
                      <span>-</span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusBadge.className}`}>{statusBadge.label}</span>
                    </>
                  )}
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
            <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-100">
              {market.priceVenue && <VenueChip id={normalizeVenueId(market.priceVenue)} size="xs" />}
              <span>{market.priceLabel}</span>
            </div>
            <div className="mt-1 text-[10px] font-semibold text-zinc-500">{market.changeLabel}</div>
          </div>
          <div className={`font-mono text-xs font-bold ${changeClass(market.change24hDirection)}`}>{market.change24hLabel}</div>
          <div>
            <div className="font-mono text-sm font-semibold text-zinc-100">{market.volume}</div>
            <div className="mt-1 font-mono text-[10px] text-zinc-500">
              <span className="text-emerald-500">{market.volumeLabel}</span>
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
        );
      })}
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
};

const MarketListTable = () => (
  <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#101012] custom-scrollbar">
    <div className="grid min-w-[1150px] grid-cols-[minmax(360px,1.7fr)_112px_96px_84px_116px_92px_96px_150px] items-center gap-4 border-b border-zinc-200 bg-zinc-50/70 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-500">
      <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-[#ccff00]" /> Market</div>
      <div>Last 7 Days</div>
      <div>Yes Price</div>
      <div>24h</div>
      <div>Volume 24h</div>
      <div>Closes By</div>
      <div>Spread</div>
      <div className="text-right">Trade</div>
    </div>
    <div className="min-w-[1150px] divide-y divide-zinc-200 dark:divide-zinc-800">
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

const MarketCard = ({ id, marketId, eventId, canonicalEventId, title, category, venueCount, routeType, savings, spread, fallback, fallbackLabel, fallbackMode = 'pending', icon, imageUrl, iconUrl, priceLabel, priceVenue, changeLabel, prob, change, volume, volumeLabel = 'Vol', volume24h = null, liquidity = null, openInterest = null, resolvesAt = null, resolutionDateLabel = null, txnBuy, txnSell, txnLabel = 'Pending', badges = [], outcomes, marketType, venues, venueMarkets, quoteStatus = 'live', quoteReadyVenueCount = 0, quoteBlockers = [], lastQuoteAt = null, isWatched = false, onToggleWatch, onOpenTerminal }: any) => {
  const [outcomesExpanded, setOutcomesExpanded] = useState(false);
  const allVenues = [
    { id: 'polymarket', label: 'Polymarket' },
    { id: 'predict', label: 'Predict.fun' },
    { id: 'limitless', label: 'Limitless' },
    { id: 'opinion', label: 'Opinion' },
    { id: 'myriad', label: 'Myriad' }
  ];

  const normalizedQuoteStatus: NonNullable<MarketCatalogMarket['quoteStatus']> =
    quoteStatus === 'live' || quoteStatus === 'partial' || quoteStatus === 'stale' || quoteStatus === 'unavailable'
      ? quoteStatus
      : 'unavailable';
  const diagnosticsEnabled = lotusMarketDiagnosticsEnabled();
  const statusBadge = marketQuoteStatusBadge(normalizedQuoteStatus, diagnosticsEnabled);
  const blockerList = diagnosticsEnabled && Array.isArray(quoteBlockers)
    ? quoteBlockers.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const readableBlocker = blockerList[0] ? readableQuoteBlocker(blockerList[0]) : null;
  const lastQuoteLabel = typeof lastQuoteAt === 'string' && lastQuoteAt ? formatRelativeTime(lastQuoteAt) : null;
  const rawDisplayPrice = priceLabel ?? (prob !== null && prob !== undefined ? `${prob}¢` : 'Quote');
  const displayPrice = !diagnosticsEnabled && normalizedQuoteStatus === 'unavailable' && !priceVenue ? '-' : rawDisplayPrice;
  const displayChange = !diagnosticsEnabled && normalizedQuoteStatus === 'unavailable' ? '' : changeLabel ?? (
    normalizedQuoteStatus === 'unavailable'
      ? readableBlocker ?? 'Quote unavailable'
      : normalizedQuoteStatus === 'stale'
        ? 'Stale quote'
        : change ? `+${change}¢ vs single venue` : 'Quote ready'
  );
  const emptyTxnCopy = !diagnosticsEnabled
    ? '-'
    : normalizedQuoteStatus === 'unavailable'
    ? readableBlocker ?? 'Quote unavailable'
    : normalizedQuoteStatus === 'stale'
      ? lastQuoteLabel ? `Stale quote, checked ${lastQuoteLabel}` : 'Stale quote. Refresh on open.'
      : normalizedQuoteStatus === 'partial'
        ? 'Partial venue quote coverage'
        : quoteReadyVenueCount > 0
          ? `${quoteReadyVenueCount} quote-ready venue${quoteReadyVenueCount === 1 ? '' : 's'}`
          : 'Quote-ready venue available';
  const buyCount = typeof txnBuy === 'number' ? txnBuy : 0;
  const sellCount = typeof txnSell === 'number' ? txnSell : 0;
  const totalCount = buyCount + sellCount;
  const activeBadgeIds = new Set((badges as string[]).map(dashboardVenueIconId));
  const visibleOutcomes = outcomesExpanded ? outcomes : outcomes?.slice(0, 5);
  const hiddenOutcomeCount = Math.max(0, (outcomes?.length ?? 0) - (visibleOutcomes?.length ?? 0));
  const fallbackText = !diagnosticsEnabled && normalizedQuoteStatus === 'unavailable'
    ? '-'
    : fallbackLabel ?? (fallback ? 'Yes' : 'No');
  const liveVenueCaption = quoteReadyVenueCount > 0
    ? `${quoteReadyVenueCount} live venue${quoteReadyVenueCount === 1 ? '' : 's'}`
    : `${venueCount} venue${venueCount === 1 ? '' : 's'} scanned`;
  const routeVenueLogoLabel = diagnosticsEnabled && fallbackMode === 'best_venue' && fallbackText && fallbackText !== '-'
    ? fallbackText
    : priceVenue;
  const showRouteVenueLogo = diagnosticsEnabled && typeof routeVenueLogoLabel === 'string' && routeVenueLogoLabel.trim().length > 0;
  const shouldShowVolumeMetric = volume != null && String(volume).trim().length > 0 && String(volume).trim().toLowerCase() !== 'backend catalog';
  const terminalPayload = { id, marketId, eventId, canonicalEventId, title, category, icon, volume, volume24h, liquidity, openInterest, resolvesAt, resolutionDateLabel, venueCount, routeType, venues, venueMarkets, marketType, outcomes, imageUrl, iconUrl, priceLabel, priceVenue, changeLabel };
  const outcomeRailOverflowClass = outcomesExpanded ? 'overflow-x-hidden overflow-y-auto custom-scrollbar' : 'overflow-hidden';
  const singleOutcome = (outcomes?.length ?? 0) === 1 ? outcomes[0] : null;
  const singleOutcomeProbability = singleOutcome?.prob
    ? (/^\d+(\.\d+)?$/.test(String(singleOutcome.prob)) ? `${singleOutcome.prob}%` : String(singleOutcome.prob))
    : displayPrice && displayPrice !== 'Quote' && displayPrice !== '-'
      ? String(displayPrice).replace('Â¢', '%')
      : 'Quote';
  const singleOutcomePayload = singleOutcome
    ? {
        ...terminalPayload,
        id: singleOutcome.marketId ?? terminalPayload.id,
        marketId: singleOutcome.marketId ?? terminalPayload.marketId,
        eventId: singleOutcome.eventId ?? terminalPayload.eventId,
        canonicalEventId: singleOutcome.canonicalEventId ?? terminalPayload.canonicalEventId,
        title,
        venues: singleOutcome.venues ?? terminalPayload.venues,
        venueMarkets: singleOutcome.venueMarkets ?? terminalPayload.venueMarkets,
        marketType: singleOutcome.marketType ?? terminalPayload.marketType,
        imageUrl: singleOutcome.imageUrl ?? terminalPayload.imageUrl,
        iconUrl: singleOutcome.iconUrl ?? terminalPayload.iconUrl,
        priceLabel: singleOutcome.prob ?? terminalPayload.priceLabel,
        priceVenue: singleOutcome.priceVenue ?? terminalPayload.priceVenue,
        outcomes,
        initialOutcomeId: singleOutcome.id,
      }
    : null;

  if (singleOutcome && singleOutcomePayload) {
    return (
      <div className="flex h-full min-h-[276px] flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-[#121214] dark:hover:border-zinc-700 group">
        <div className="grid grid-cols-[minmax(0,1fr)_76px] items-start gap-4">
          <button
            type="button"
            onClick={() => onOpenTerminal?.(terminalPayload)}
            className="flex min-w-0 gap-3 rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#121214]"
            aria-label={`Open ${title} in terminal`}
          >
            <MarketMediaThumb title={title} icon={icon} imageUrl={imageUrl} iconUrl={iconUrl} className="h-11 w-11 text-xl shadow-sm" />
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block pr-2 text-base font-black leading-tight text-zinc-900 line-clamp-2 transition-colors group-hover:text-[#5c7300] dark:text-zinc-100 dark:group-hover:text-[#ccff00]">{title}</span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span className="truncate">{category}</span>
                <span>-</span>
                <span className="shrink-0">{venueCount} venues scanned</span>
              </span>
            </span>
          </button>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => onToggleWatch?.(id)}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${isWatched ? 'border-[#ccff00]/40 bg-[#ccff00]/10 text-[#ccff00]' : 'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-[#ccff00]'}`}
              aria-label={`${isWatched ? 'Remove' : 'Add'} ${title} ${isWatched ? 'from' : 'to'} watchlist`}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isWatched ? 'fill-current' : ''}`} />
            </button>
            <div className="relative flex h-16 w-16 flex-col items-center justify-center rounded-full border-[5px] border-emerald-500/25 border-r-emerald-400 border-t-emerald-400 bg-zinc-950/70 text-center shadow-[inset_0_0_18px_rgba(16,185,129,0.08)]">
              <span className="text-sm font-black leading-none text-zinc-100">{singleOutcomeProbability}</span>
              <span className="mt-1 text-[9px] font-semibold leading-none text-zinc-400">chance</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onOpenTerminal?.({ ...singleOutcomePayload, initialOutcomeSide: 'yes' })}
            className="h-12 rounded-lg border border-emerald-500/10 bg-emerald-500/15 text-sm font-black text-emerald-300 transition hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onOpenTerminal?.({ ...singleOutcomePayload, initialOutcomeSide: 'no' })}
            className="h-12 rounded-lg border border-red-500/10 bg-red-500/15 text-sm font-black text-red-300 transition hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
          >
            No
          </button>
        </div>

        {routeType ? (
          <div className="mt-4 flex min-h-9 items-center justify-between gap-3 overflow-hidden rounded-lg border border-[#ccff00]/20 bg-[#ccff00]/5 px-3 py-2 text-[10px] font-medium">
            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
              <span className="shrink-0 text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Route:</span> {routeType}</span>
              {spread && <span className="truncate text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Spread:</span> {spread}</span>}
            </div>
            {showRouteVenueLogo ? (
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-700/70 bg-zinc-900/80 p-0.5 shadow-sm"
                title={routeVenueLogoLabel}
                aria-label={`Best venue ${routeVenueLogoLabel}`}
              >
                <VenueLogo id={dashboardVenueIconId(routeVenueLogoLabel)} label={routeVenueLogoLabel} className="h-full w-full rounded-[inherit] object-cover" />
              </span>
            ) : (
              <span className="whitespace-nowrap text-zinc-700 dark:text-zinc-300">{diagnosticsEnabled ? fallbackText : 'Live'}</span>
            )}
          </div>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          <span>{shouldShowVolumeMetric ? <><span className="font-mono text-zinc-700 dark:text-zinc-300">{volume}</span> {volumeLabel}</> : emptyTxnCopy}</span>
          <span>{quoteReadyVenueCount > 0 ? `${quoteReadyVenueCount} quote-ready venue${quoteReadyVenueCount === 1 ? '' : 's'}` : liveVenueCaption}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[452px] flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-[#121214] dark:hover:border-zinc-700 group">
      
      {/* Header */}
      <div className="grid h-[112px] shrink-0 grid-cols-[minmax(0,1fr)_76px] items-start gap-3 overflow-hidden">
        <button
          type="button"
          onClick={() => onOpenTerminal?.(terminalPayload)}
          className="flex h-full min-w-0 gap-3 rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#121214]"
          aria-label={`Open ${title} in terminal`}
        >
          <MarketMediaThumb title={title} icon={icon} imageUrl={imageUrl} iconUrl={iconUrl} className="h-10 w-10 text-xl shadow-sm" />
          <span className="flex-1 min-w-0">
            <span className="mb-1 block h-[34px] pr-2 text-sm font-bold leading-tight text-zinc-900 line-clamp-2 transition-colors group-hover:text-[#5c7300] dark:text-zinc-100 dark:group-hover:text-[#ccff00]">{title}</span>
            <span className="flex h-4 min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span className="truncate">{category}</span>
              <span>-</span>
              <span className="shrink-0">{venueCount} venues scanned</span>
            </span>
            <span className="mt-1 flex h-5 items-center">
              {statusBadge ? (
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusBadge.className}`}>{statusBadge.label}</span>
              ) : (
                <span className="rounded-full border border-transparent px-1.5 py-0.5 text-[10px] font-bold opacity-0">Ready</span>
              )}
            </span>
            <span className="mt-1 flex h-5 gap-1.5 overflow-hidden">
              {allVenues.map(v => {
                const isActive = activeBadgeIds.has(v.id);
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
        <div className="h-full w-[76px] shrink-0 text-right">
          <button
            type="button"
            onClick={() => onToggleWatch?.(id)}
            className={`mb-2 inline-flex h-6 w-6 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${isWatched ? 'border-[#ccff00]/40 bg-[#ccff00]/10 text-[#ccff00]' : 'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-[#ccff00]'}`}
            aria-label={`${isWatched ? 'Remove' : 'Add'} ${title} ${isWatched ? 'from' : 'to'} watchlist`}
          >
            <Bookmark className={`h-3.5 w-3.5 ${isWatched ? 'fill-current' : ''}`} />
          </button>
          <div className="mb-1 flex items-center justify-end gap-1.5">
            {priceVenue && (
              <span className="flex h-4 w-4 items-center justify-center rounded border border-zinc-700/70 bg-zinc-900/80 p-0.5 shadow-sm" title={priceVenue}>
                <VenueLogo id={dashboardVenueIconId(priceVenue)} label={priceVenue} className="h-full w-full rounded-[inherit] object-cover" />
              </span>
            )}
            <span className="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100 leading-none">{displayPrice}</span>
          </div>
          <div className="line-clamp-2 text-[10px] font-bold leading-tight text-zinc-500 dark:text-zinc-400">{displayChange}</div>
        </div>
        <div className="hidden">
          <div className="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100 leading-none mb-1">{prob}¢</div>
          <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            +{change}¢ vs single venue
          </div>
        </div>
      </div>

      {/* Lotus Route Strip */}
      <div className="mt-2 h-[31px] shrink-0">
        {routeType ? (
          <div className="flex h-full items-center justify-between gap-3 overflow-hidden rounded-lg border border-[#ccff00]/20 bg-[#ccff00]/5 px-3 py-1.5 text-[10px] font-medium">
            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
              <span className="text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Route:</span> {routeType}</span>
              {diagnosticsEnabled ? (
                <>
                  {spread && <span className="text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Spread:</span> {spread}</span>}
                </>
              ) : (
                <span className="text-zinc-700 dark:text-zinc-300"><span className="text-zinc-500 dark:text-zinc-400">Venues:</span> {liveVenueCaption}</span>
              )}
            </div>
            {showRouteVenueLogo ? (
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-700/70 bg-zinc-900/80 p-0.5 shadow-sm"
                title={routeVenueLogoLabel}
                aria-label={`Best venue ${routeVenueLogoLabel}`}
              >
                <VenueLogo id={dashboardVenueIconId(routeVenueLogoLabel)} label={routeVenueLogoLabel} className="h-full w-full rounded-[inherit] object-cover" />
              </span>
            ) : (
              <span className="whitespace-nowrap text-zinc-700 dark:text-zinc-300">{diagnosticsEnabled ? fallbackText : 'Live'}</span>
            )}
          </div>
        ) : null}
      </div>

      <div className="my-3 h-px w-full shrink-0 bg-zinc-100 dark:bg-zinc-800/60"></div>

      {/* Outcomes */}
      <div className={`flex h-[176px] shrink-0 flex-col gap-1.5 pr-1 ${outcomeRailOverflowClass}`}>
        {outcomes && outcomes.length > 0 && (
          <>
          {visibleOutcomes.map((outcome: any, idx: number) => {
            const outcomePayload = {
              ...terminalPayload,
              id: outcome.marketId ?? terminalPayload.id,
              marketId: outcome.marketId ?? terminalPayload.marketId,
              eventId: outcome.eventId ?? terminalPayload.eventId,
              canonicalEventId: outcome.canonicalEventId ?? terminalPayload.canonicalEventId,
              title,
              venues: outcome.venues ?? terminalPayload.venues,
              venueMarkets: outcome.venueMarkets ?? terminalPayload.venueMarkets,
              marketType: outcome.marketType ?? terminalPayload.marketType,
              imageUrl: outcome.imageUrl ?? terminalPayload.imageUrl,
              iconUrl: outcome.iconUrl ?? terminalPayload.iconUrl,
              priceLabel: outcome.prob ?? terminalPayload.priceLabel,
              priceVenue: outcome.priceVenue ?? terminalPayload.priceVenue,
              outcomes,
              initialOutcomeId: outcome.id,
            };
            return (
              <div key={outcome.id ?? idx} className="flex h-6 shrink-0 items-center justify-between text-sm">
                <span className="font-semibold text-zinc-600 dark:text-zinc-400 truncate pr-2 flex-1 text-xs">{outcome.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 w-12 text-right text-xs">{outcome.prob}{/^\d+(\.\d+)?$/.test(String(outcome.prob)) ? '%' : ''}</span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => onOpenTerminal?.({ ...outcomePayload, initialOutcomeSide: 'yes' })} className="w-9 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] transition-colors rounded font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70">Yes</button>
                    <button type="button" onClick={() => onOpenTerminal?.({ ...outcomePayload, initialOutcomeSide: 'no' })} className="w-9 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] transition-colors rounded font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70">No</button>
                  </div>
                </div>
              </div>
            );
          })}

          {(outcomes?.length ?? 0) > 5 && (
            <button
              type="button"
              onClick={() => setOutcomesExpanded((current) => !current)}
              className="flex items-center justify-between rounded-md py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
            >
              <span>{outcomesExpanded ? 'Show fewer outcomes' : `Show ${hiddenOutcomeCount} more outcome${hiddenOutcomeCount === 1 ? '' : 's'}`}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${outcomesExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          </>
        )}
      </div>

      {/* Footer / Buy Sell Txns */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <div className="flex h-4 items-center gap-3 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 pb-1">
          {shouldShowVolumeMetric ? (
            <span>{volumeLabel} <span className="font-mono text-zinc-700 dark:text-zinc-300">{volume}</span></span>
          ) : null}
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {totalCount > 0 ? (
            <>
              <span className="text-emerald-600 dark:text-emerald-500/90">
                {txnLabel === 'Vol' ? formatMoneyMetric(buyCount) : buyCount.toLocaleString()} Buys
              </span>
              <span>-</span>
              <span className="text-red-600 dark:text-red-500/90">
                {txnLabel === 'Vol' ? formatMoneyMetric(sellCount) : sellCount.toLocaleString()} Sells
              </span>
            </>
          ) : (
            <span className="text-zinc-500">{emptyTxnCopy}</span>
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
