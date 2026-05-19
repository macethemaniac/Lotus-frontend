import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Lock, ShieldAlert, ShieldCheck, Info,
  Clock, BarChart2, Layers, Share2, Bookmark, Search, Maximize2, Activity, Zap, Ghost,
  Home, Terminal, PieChart, Volleyball, Settings
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { useTurnkey, type Wallet as TurnkeyWallet, type WalletAccount } from '@turnkey/react-wallet-kit';
import { JsonRpcProvider, Transaction } from 'ethers';
import { VenueLogo } from '@/components/icons/asset-logo';
import { LotusLogo } from '@/components/icons/lotus-icons';
import { FundingDeposit } from '@/design/mockups/FundingDeposit';
import type { AuthSession } from '@/features/auth/types';
import {
  getAccountSnapshot,
  mergeVenueBalanceSnapshots,
  preparePolymarketActivation,
  submitPolymarketActivation,
  type VenueActivation,
  type VenueBalance,
} from '@/features/funding/api/funding-api';
import {
  getCanonicalResolutionRisk,
  getMarketChart,
  getMarketOrderbook,
  getMarketOutcomes,
  getVenueMarketResolutionRisk,
  type MarketChartResponse,
  type MarketChartTimeframe,
  type MarketCatalogVenueMarket,
  type MarketOrderbookResponse,
  type ResolutionRiskAssessment,
  type ResolutionRiskProfile,
} from '@/features/markets/api/market-api';
import {
  createExecutionQuote,
  getExecutionHistory,
  getLiveCandidates,
  getLiveReadiness,
  getOpenOrders,
  getPositions,
  prepareSignatures,
  submitSignedBundle,
  submitExecutionQuote,
  type ExecutionPosition,
  type ExecutionStatus,
  type LiveCandidatesResponse,
  type LiveSubmitReadinessSnapshot,
  type OpenOrdersResponse,
  type RouteQuote,
  type SignatureBundle,
  type TradeRouteCandidate,
} from '@/features/trading/api/execution-api';
import {
  completeVenueSetupBatch,
  prepareVenueSetupBatch,
  type VenueSetupSignatureRequest,
} from '@/features/wallets/api/wallet-api';
import { ApiClientError } from '@/lib/api/http-client';

const walletAddressEquals = (left?: string | null, right?: string | null): boolean => {
  if (!left || !right) return false;
  if (left.startsWith('0x') && right.startsWith('0x')) return left.toLowerCase() === right.toLowerCase();
  return left === right;
};

const findTurnkeyWalletAccount = (wallets: TurnkeyWallet[], address: string): WalletAccount | null => {
  for (const wallet of wallets) {
    for (const account of wallet.accounts ?? []) {
      if (walletAddressEquals(account.address, address)) return account;
    }
  }
  return null;
};

const normalizeHexPart = (value: string, bytes: number) => {
  const stripped = value.startsWith('0x') ? value.slice(2) : value;
  return stripped.padStart(bytes * 2, '0');
};

const normalizeRecoveryId = (value: string) => {
  const decimal = value.startsWith('0x') ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value, 10);
  const normalized = decimal >= 27 ? decimal : decimal + 27;
  if (!Number.isFinite(normalized) || (normalized !== 27 && normalized !== 28)) {
    throw new Error('Turnkey returned an unsupported signature recovery id.');
  }
  return normalized.toString(16).padStart(2, '0');
};

const signatureFromTurnkeyResult = (result: { r: string; s: string; v: string }) =>
  `0x${normalizeHexPart(result.r, 32)}${normalizeHexPart(result.s, 32)}${normalizeRecoveryId(result.v)}`;

const maxUint256Hex = `0x${'f'.repeat(64)}`;

const encodeErc20Approve = (spender: string, amountHex = maxUint256Hex) =>
  `0x095ea7b3${spender.toLowerCase().replace(/^0x/, '').padStart(64, '0')}${amountHex.replace(/^0x/, '').padStart(64, '0')}`;

const encodeErc1155SetApprovalForAll = (operator: string, approved = true) =>
  `0xa22cb465${operator.toLowerCase().replace(/^0x/, '').padStart(64, '0')}${(approved ? '1' : '0').padStart(64, '0')}`;

const rpcUrlForChainId = (chainId: number): string | null => {
  const env = import.meta.env as Record<string, string | undefined>;
  if (chainId === 8453) return env.VITE_BASE_RPC_URL?.trim() || 'https://mainnet.base.org';
  if (chainId === 137) return env.VITE_POLYGON_RPC_URL?.trim() || 'https://polygon-rpc.com';
  if (chainId === 1) return env.VITE_ETHEREUM_RPC_URL?.trim() || 'https://ethereum-rpc.publicnode.com';
  if (chainId === 56) return env.VITE_BSC_RPC_URL?.trim() || 'https://bsc-dataseed.bnbchain.org/';
  if (chainId === 97) return env.VITE_BSC_TESTNET_RPC_URL?.trim() || 'https://bsc-testnet-dataseed.bnbchain.org/';
  return null;
};

const buildUnsignedEvmTransaction = async (input: {
  chainId: number;
  ownerAddress: string;
  to: string;
  data: string;
  label: string;
}): Promise<{ unsignedTransaction: string; rpcUrl: string }> => {
  const rpcUrl = rpcUrlForChainId(input.chainId);
  if (!rpcUrl) {
    throw new Error(`${input.label} is not configured for chain ${input.chainId}.`);
  }
  const provider = new JsonRpcProvider(rpcUrl, input.chainId);
  const [nonce, feeData] = await Promise.all([
    provider.getTransactionCount(input.ownerAddress, 'pending'),
    provider.getFeeData(),
  ]);
  const gasLimit = await provider.estimateGas({
    from: input.ownerAddress,
    to: input.to,
    data: input.data,
    value: 0n,
  });
  const base = {
    chainId: input.chainId,
    nonce,
    to: input.to,
    value: 0n,
    data: input.data,
    gasLimit,
  };
  const transaction = feeData.maxFeePerGas && feeData.maxPriorityFeePerGas
    ? Transaction.from({
        ...base,
        type: 2,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      })
    : Transaction.from({
        ...base,
        gasPrice: feeData.gasPrice ?? 1_000_000_000n,
      });
  return {
    unsignedTransaction: transaction.unsignedSerialized,
    rpcUrl,
  };
};

const buildUnsignedApprovalTransaction = async (input: {
  chainId: number;
  ownerAddress: string;
  tokenAddress: string;
  spenderAddress: string;
  approvalMethod?: "CLOB_PUSD_APPROVAL" | "ERC20_APPROVE" | "ERC1155_SET_APPROVAL_FOR_ALL";
}): Promise<{ unsignedTransaction: string; rpcUrl: string }> => {
  const approvalMethod = input.approvalMethod === "CLOB_PUSD_APPROVAL"
    ? "ERC20_APPROVE"
    : input.approvalMethod ?? "ERC20_APPROVE";
  return buildUnsignedEvmTransaction({
    chainId: input.chainId,
    ownerAddress: input.ownerAddress,
    to: input.tokenAddress,
    data: approvalMethod === "ERC1155_SET_APPROVAL_FOR_ALL"
      ? encodeErc1155SetApprovalForAll(input.spenderAddress)
      : encodeErc20Approve(input.spenderAddress),
    label: approvalMethod === "ERC1155_SET_APPROVAL_FOR_ALL"
      ? "venue share approval"
      : "venue collateral approval",
  });
};

const eip712PayloadForTurnkey = (typedData: unknown) => {
  const data = typedData && typeof typedData === 'object' ? typedData as Record<string, unknown> : {};
  const types = data.types && typeof data.types === 'object' ? data.types as Record<string, unknown> : {};
  return JSON.stringify({
    ...data,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...types,
    },
  });
};

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const polymarketActivationConfirmed = (activation: VenueActivation | null | undefined) => {
  const reason = String(activation?.readinessReason ?? '').toUpperCase();
  return reason === 'POLYMARKET_CLOB_COLLATERAL_CONFIRMED';
};

const isTurnkeyMissingSessionError = (error: unknown): boolean =>
  error instanceof Error && /No active session found|valid session|Fetching embedded wallets/i.test(error.message);

const isLimitlessExchangeRefreshError = (error: unknown): boolean =>
  error instanceof Error &&
  /LIMITLESS_EXCHANGE_ADDRESS_MISSING|Limitless signature preparation requires the market exchange address|market exchange address/i.test(error.message);

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
  outcomes?: Array<{
    id: string;
    marketId?: string;
    eventId?: string;
    canonicalEventId?: string;
    quoteOutcomeId?: string;
    name: string;
    prob: string;
    venues?: string[];
    venueMarkets?: MarketCatalogVenueMarket[];
    marketType?: 'binary' | 'multi';
    marketTitle?: string;
    imageUrl?: string | null;
    iconUrl?: string | null;
    priceVenue?: string | null;
  }>;
  initialOutcomeId?: string | null;
  initialOutcomeSide?: TicketOutcomeSide;
  imageUrl?: string | null;
  iconUrl?: string | null;
  priceLabel?: string;
  priceVenue?: string | null;
  changeLabel?: string;
  change24hLabel?: string;
  change24hDirection?: 'positive' | 'negative' | 'neutral' | 'pending';
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
  marketId: string | null;
  quoteOutcomeId: string;
  name: string;
  vol: string;
  platforms: number;
  prob: string;
  yesPrice: string;
  noPrice: string;
  primaryVenue: string | null;
  venueQuotes: TerminalVenueQuote[];
  active: boolean;
  venues: string[];
  status: 'live' | 'unavailable' | 'pending' | 'auth_required';
  blocker: string | null;
};

type TerminalVenueQuote = {
  venue: string;
  yesPrice: string;
  noPrice: string;
  blocker: string | null;
};

type TicketOutcomeSide = 'yes' | 'no';

type TerminalChartSeries = {
  id: string;
  label: string;
  color: string;
  emphasis?: boolean;
  dashed?: boolean;
};

type TerminalChartRow = Record<string, string | number | null>;

type TerminalRiskState = {
  loading: boolean;
  error: string | null;
  assessments: ResolutionRiskAssessment[];
  profiles: ResolutionRiskProfile[];
};

type TerminalOpenOrder = OpenOrdersResponse['items'][number];

const EMPTY_VENUE_MARKETS: MarketCatalogVenueMarket[] = [];
const EMPTY_TERMINAL_OUTCOMES: TerminalOutcomeRow[] = [];

const isUuid = (value: string | null | undefined): value is string =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const normalizeVenueId = (venue: string): string => venue.toLowerCase().replace(/[\s._-]+/g, '_');

const formatVenueLabel = (venue: string): string =>
  venue.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const toBackendVenueId = (venue: string): string => {
  const normalized = normalizeVenueId(venue);
  if (normalized === 'poly' || normalized === 'polymarket') return 'POLYMARKET';
  if (normalized === 'predict' || normalized === 'predict_fun' || normalized === 'predictfun') return 'PREDICT_FUN';
  return normalized.toUpperCase();
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

const parsePositiveNumber = (value: string | number | null | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseFiniteNumber = (value: string | number | null | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const isOpenExecutionPosition = (position: { verifiedSize?: string | number | null }) =>
  (parsePositiveNumber(position.verifiedSize) ?? 0) > 0;

const parseProbabilityLabel = (value: string | null | undefined): number | null => {
  if (!value || value === 'Quote') return null;
  const cleaned = value.replace(/[Â¢c%,$\s]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed > 1 ? parsed / 100 : parsed;
};

const formatTerminalCurrency = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
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

const routeRank = (routeType: string | null | undefined): number => {
  const normalized = (routeType ?? '').toLowerCase();
  if (normalized.includes('tri')) return 3;
  if (normalized.includes('pair')) return 2;
  if (normalized.includes('single')) return 1;
  return 0;
};

const bestRouteLabel = (markets: TerminalMarketSelection[]): string => {
  const best = [...markets].sort((left, right) => routeRank(right.routeType) - routeRank(left.routeType))[0];
  return best?.routeType ?? 'Route';
};

const uniqueVenueCount = (markets: TerminalMarketSelection[]): number => {
  const venues = new Set<string>();
  for (const market of markets) {
    for (const venue of market.venues ?? []) venues.add(normalizeVenueId(venue));
  }
  return venues.size || markets.reduce((max, market) => Math.max(max, market.venueCount), 0);
};

const terminalMarketKey = (market: TerminalMarketSelection): string =>
  market.marketId ?? market.id ?? `${market.title}:${market.category}`;

const sameTerminalEvent = (market: TerminalMarketSelection, selected: TerminalMarketSelection): boolean => {
  const selectedEventIds = [selected.eventId, selected.canonicalEventId].filter(Boolean);
  const marketEventIds = [market.eventId, market.canonicalEventId].filter(Boolean);
  return selectedEventIds.length > 0 && marketEventIds.some((id) => selectedEventIds.includes(id));
};

const outcomePriceLabel = (market: TerminalMarketSelection, outcomeId: string, fallback: string): string => {
  const outcome = market.outcomes?.find((item) => item.id.toUpperCase() === outcomeId || item.name.toUpperCase() === outcomeId);
  return outcome?.prob && outcome.prob !== 'Quote' ? outcome.prob : fallback;
};

const inverseOutcomePriceLabel = (label: string | null | undefined): string => {
  if (!label || label === 'Quote') return 'Quote';
  const parsed = Number(label.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return 'Quote';
  const suffix = /%/.test(label) ? '%' : 'c';
  const inverse = 100 - parsed;
  return `${inverse >= 10 ? inverse.toFixed(0) : inverse.toFixed(1)}${suffix}`;
};

const readableQuoteBlocker = (reason: string | null | undefined): string | null => {
  if (!reason) return null;
  const normalized = reason.toUpperCase();
  if (normalized.includes('OPINION_TOKEN_ID_MISSING')) return 'Opinion token mapping missing';
  if (normalized.includes('VENUE_OUTCOME_ID_MISSING')) return 'Outcome token mapping missing';
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

const TerminalMarketThumb = ({
  title,
  icon,
  imageUrl,
  iconUrl,
  className = 'h-9 w-9',
}: {
  title: string;
  icon: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const mediaUrl = !failed ? imageUrl ?? iconUrl : null;

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-500/30 bg-amber-500/10 text-base ${className}`}>
      {mediaUrl ? (
        <img
          src={mediaUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{icon || title.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
};

const formatBookPrice = (value: string | null | undefined): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Quote';
  const cents = parsed <= 1 ? parsed * 100 : parsed;
  return `${cents >= 10 ? cents.toFixed(1) : cents.toFixed(2)}c`;
};

const formatBookSize = (value: string | null | undefined): string => formatCompactMetric(value) ?? '-';

const formatBookNotional = (value: string | null | undefined): string => {
  const metric = formatCompactMetric(value);
  return metric ? `$${metric}` : '-';
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

const toVenueQuotes = (candidates: TradeRouteCandidate[], marketType: 'binary' | 'multi' | undefined): TerminalVenueQuote[] =>
  [...candidates]
    .filter((candidate) => Number.isFinite(candidate.price) && candidate.price > 0)
    .sort((left, right) => left.price - right.price)
    .map((candidate) => ({
      venue: candidate.venue,
      yesPrice: formatProbabilityPrice(candidate.price),
      noPrice: marketType === 'binary' ? formatProbabilityPrice(1 - candidate.price) : 'Quote',
      blocker: readableQuoteBlocker(candidate.quoteBlockers?.[0] ?? null),
    }));

const placeholderVenueQuotes = (venues: string[], yesPrice = 'Quote', noPrice = 'Quote', blocker: string | null = null): TerminalVenueQuote[] =>
  venues.map((venue) => ({ venue, yesPrice, noPrice, blocker }));

const canonicalQuoteOutcomeId = (label: string): string => {
  const trimmed = label.trim();
  const normalized = trimmed.toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'YES' || normalized === 'NO' || normalized === 'UP' || normalized === 'DOWN') {
    return normalized;
  }
  return trimmed;
};

const isGenericBinaryOutcome = (label: string | null | undefined): boolean => {
  if (!label) return false;
  const normalized = canonicalQuoteOutcomeId(label);
  return normalized === 'YES' || normalized === 'NO' || normalized === 'UP' || normalized === 'DOWN';
};

const outcomeIdForTicketSide = (
  outcomes: readonly TerminalOutcomeRow[],
  side: TicketOutcomeSide,
  fallbackOutcomeId: string | null
): string | null => {
  const fallback = fallbackOutcomeId ? outcomes.find((outcome) => outcome.id === fallbackOutcomeId) : null;
  if (fallback && !['yes', 'no'].includes(fallback.name.trim().toLowerCase())) {
    return fallback.id;
  }
  const exact = outcomes.find((outcome) => outcome.name.trim().toLowerCase() === side);
  if (exact) return exact.id;
  return fallbackOutcomeId ?? outcomes[0]?.id ?? null;
};

const quoteOutcomeIdForTicketSide = (outcome: TerminalOutcomeRow | null, side: TicketOutcomeSide): string | null => {
  if (!outcome) return null;
  const current = canonicalQuoteOutcomeId(outcome.quoteOutcomeId || outcome.name || outcome.id);
  if (side === 'no' && current !== 'NO') return 'NO';
  if (side === 'yes' && current === 'NO') return 'YES';
  return current;
};

const ticketPriceForSide = (outcome: TerminalOutcomeRow | null, side: TicketOutcomeSide): number | null => {
  const raw = side === 'yes' ? outcome?.yesPrice : outcome?.noPrice;
  if (!raw || raw === 'Quote') return null;
  const parsed = Number(raw.replace(/[Â¢c%<\s]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed / 100;
};

const formatUsdc = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0 USDC';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 2 })} USDC`;
};

const formatTradeUsdc = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0 USDC';
  const maximumFractionDigits = value > 0 && value < 1 ? 4 : value >= 100 ? 0 : 2;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 0,
    maximumFractionDigits,
  })} USDC`;
};

const venueReadyBalanceAmount = (balance: VenueBalance): number => {
  const asset = (balance.asset ?? balance.token ?? 'USDC')
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '');
  const stableVenueAsset = asset === 'USDC' || asset === 'USDCE' || asset === 'USDC.E' || asset === 'USDT' || asset === 'PUSD' || asset === 'USD';
  if (!stableVenueAsset) return 0;
  return parsePositiveNumber(balance.readyAmount ?? balance.availableAmount) ?? 0;
};

const formatSignedShares = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0 shares';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 2 })} shares`;
};

const formatRouteAmount = (value: number): string =>
  value.toFixed(8).replace(/\.?0+$/, '');

const estimateShares = (amount: string, price: number | null | undefined): number | null => {
  const parsedAmount = parsePositiveNumber(amount);
  if (!parsedAmount || !price || price <= 0) return null;
  return parsedAmount / price;
};

const summarizeExpectedFees = (quote: RouteQuote | null): string => {
  const fees = quote?.expectedFees;
  if (!fees || Object.keys(fees).length === 0) return 'Backend quote pending';
  const pairs = Object.entries(fees)
    .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
    .slice(0, 3)
    .map(([key, value]) => `${key.replace(/[_-]+/g, ' ')}: ${String(value)}`);
  return pairs.length ? pairs.join(' / ') : 'Backend quote pending';
};

const routePath = (quote: RouteQuote | null): string[] => {
  if (quote?.venuePath?.length) return quote.venuePath;
  const fromLegs = quote?.legs?.map((leg) => leg.venue).filter(Boolean) ?? [];
  return [...new Set(fromLegs)];
};

const routeShareImprovement = (
  amount: string,
  quote: RouteQuote | null,
  candidates: LiveCandidatesResponse | null
): number | null => {
  const amountNumber = parsePositiveNumber(amount);
  const effective = quote?.effectivePrice;
  const bestSingle = bestCandidate(candidates?.candidates ?? [])?.price;
  if (!amountNumber || !effective || !bestSingle || effective <= 0 || bestSingle <= 0 || effective >= bestSingle) {
    return null;
  }
  return amountNumber / effective - amountNumber / bestSingle;
};

const routeLegShareLabel = (leg: RouteQuote['legs'][number]): string =>
  formatSignedShares(parsePositiveNumber(leg.size));

const ticketAmountNumber = (amount: string): number | null => parsePositiveNumber(amount);

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

const formatRiskFactorName = (factor: string): string =>
  factor.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());

const riskFactorRows = (assessment: ResolutionRiskAssessment) =>
  Object.entries(assessment.factorBreakdown ?? {}).map(([name, value]) => {
    const factor = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const score = typeof factor.score === 'string' || typeof factor.score === 'number' ? String(factor.score) : null;
    const confidence = typeof factor.confidence === 'string' || typeof factor.confidence === 'number' ? String(factor.confidence) : null;
    const reason = typeof factor.reason === 'string' ? factor.reason : null;
    return { name, score, confidence, reason };
  });

const ruleTextForProfile = (profile: ResolutionRiskProfile): string =>
  profile.primaryResolutionText || profile.supplementalRulesText || 'Backend has not returned public venue rule text for this market.';

const urlPattern = /(https?:\/\/[^\s"',)]+)/g;

const renderLinkedText = (text: string, className?: string): React.ReactNode => {
  const parts = text.split(urlPattern);
  return (
    <p className={`whitespace-pre-wrap ${className ?? ''}`.trim()}>
      {parts.map((part, index) => {
        urlPattern.lastIndex = 0;
        if (!urlPattern.test(part)) {
          return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
        }
        return (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition-colors hover:text-sky-200"
          >
            {part}
          </a>
        );
      })}
    </p>
  );
};

const metadataRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sourceUrlForProfile = (profile: ResolutionRiskProfile): string | null => {
  const officialVenueRules = metadataRecord(metadataRecord(profile.metadata).officialVenueRules);
  const sourceUrl = officialVenueRules.sourceUrl;
  return typeof sourceUrl === 'string' && /^https:\/\//i.test(sourceUrl) ? sourceUrl : null;
};

const knownResolutionProviders = [
  'Binance',
  'Coinbase',
  'Kraken',
  'OKX',
  'Bybit',
  'Bitstamp',
  'Bitfinex',
  'Gemini',
  'TradingView',
  'UMA',
  'Kleros'
];

const sourceTextsForProfile = (profile: ResolutionRiskProfile): string[] =>
  [profile.oracleName, profile.supplementalRulesText, profile.primaryResolutionText]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

const extractResolutionProvider = (text: string): string | null => {
  const knownProvider = knownResolutionProviders.find((provider) =>
    new RegExp(`\\b${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
  );
  if (knownProvider) return knownProvider;

  const namedSource = text.match(/\b(?:resolution source for this market is|source is|according to)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9.&-]*)/i);
  const candidate = namedSource?.[1]?.trim();
  if (!candidate || /^(the|a|an|this|that)$/i.test(candidate)) return null;
  return candidate;
};

const extractResolutionMarket = (text: string): string | null => {
  const pair = text.match(/\b([A-Z]{2,10}[\/_][A-Z]{2,10}|[A-Z]{2,10}USD[A-Z]?)\b/);
  return pair?.[1]?.replace('_', '/') ?? null;
};

const sourceProviderForProfile = (profile: ResolutionRiskProfile): string | null => {
  for (const text of sourceTextsForProfile(profile)) {
    const provider = extractResolutionProvider(text);
    if (provider) return provider;
  }
  return null;
};

const sourceMarketForProfile = (profile: ResolutionRiskProfile): string | null => {
  for (const text of sourceTextsForProfile(profile)) {
    const market = extractResolutionMarket(text);
    if (market) return market;
  }
  return null;
};

const formatSourceMethod = (oracleType: string | null | undefined): string =>
  (oracleType ?? 'Not specified')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const safeExecutionAccountError = (error: unknown): string => {
  if (!error || typeof error !== 'object') {
    return 'Execution records are temporarily unavailable. Please try again shortly.';
  }
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : null;
  const status = typeof candidate.status === 'number' ? candidate.status : null;
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (
    code === 'EXECUTION_ACCOUNT_DATA_UNAVAILABLE' ||
    status === 500 ||
    status === 503 ||
    /relation .* does not exist/i.test(message) ||
    /database|postgres|sql|query/i.test(message)
  ) {
    return 'Execution records are temporarily unavailable. Please try again shortly.';
  }
  return message || 'Execution records are temporarily unavailable. Please try again shortly.';
};

const safeMarketDataError = (error: unknown, surface: 'chart' | 'orderbook'): string => {
  const fallback = surface === 'chart'
    ? 'Live chart data is temporarily unavailable. The market can still be reviewed from live outcomes and route quotes.'
    : 'Live orderbook depth is temporarily unavailable. The market can still be reviewed from live outcomes and route quotes.';
  if (error instanceof ApiClientError) {
    if (error.status === 404 || error.status === 503) return fallback;
    if (error.status >= 500) return fallback;
    if (/route\s+(get|post|put|patch|delete):/i.test(error.message)) return fallback;
    return error.message || fallback;
  }
  if (error instanceof Error) {
    if (/route\s+(get|post|put|patch|delete):/i.test(error.message)) return fallback;
    return error.message || fallback;
  }
  return fallback;
};

const describeOutcomeSchema = (schema: Record<string, unknown> | null | undefined): string => {
  if (!schema) return 'Outcome schema not specified';
  const yes = typeof schema.yesLabel === 'string' ? schema.yesLabel : 'Yes';
  const no = typeof schema.noLabel === 'string' ? schema.noLabel : 'No';
  const shape = typeof schema.marketShape === 'string' ? schema.marketShape : 'market';
  return `${shape} - ${yes} / ${no}`;
};

const semanticComparisonSummary = (profiles: ResolutionRiskProfile[], assessment: ResolutionRiskAssessment | null): string => {
  if (profiles.length < 2) {
    return 'Backend needs at least two venue rule profiles before Lotus can explain aggregation compatibility.';
  }
  const venues = profiles.map((profile) => formatVenueLabel(profile.venue)).join(' vs ');
  if (!assessment) {
    return `${venues}: venue rules are loaded, but no backend aggregation decision has been returned yet.`;
  }
  return `${venues}: Lotus compares the venue rule text, oracle/source type, outcome schema, wording boundaries, dispute windows, settlement lag, and historical divergence before deciding whether these markets can be aggregated.`;
};

const initialOutcomeRows = (market: TerminalMarketSelection): TerminalOutcomeRow[] => {
  const rows = market.outcomes ?? [];
  const fallbackMarketId = executionMarketId(market);
  return rows.map((outcome, index) => ({
    id: outcome.id,
    marketId: outcome.marketId ?? fallbackMarketId,
    quoteOutcomeId: outcome.quoteOutcomeId ?? canonicalQuoteOutcomeId(outcome.name),
    name: outcome.name,
    vol: market.volume,
    platforms: market.venueCount,
    prob: outcome.prob,
    yesPrice: outcome.prob,
    noPrice: 'Quote',
    primaryVenue: outcome.priceVenue ?? outcome.venues?.[0] ?? market.venues?.[0] ?? null,
    venueQuotes: placeholderVenueQuotes(outcome.venues ?? market.venues ?? [], outcome.prob, 'Quote'),
    active: index === 0,
    venues: outcome.venues ?? market.venues ?? [],
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
      <div className="h-[300px] min-h-[300px] w-full mt-6 pr-4 relative">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
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

const chartPointValue = (value: string | null | undefined): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * 100 : null;
};

const OUTCOME_CHART_COLORS = ["#22C55E", "#EF4444", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899"];

const normalizeChartKey = (prefix: string, value: string): string =>
  `${prefix}_${value.replace(/[^a-zA-Z0-9_]/g, "_")}`;

const bucketChartTimestamp = (timestamp: string): number => {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return Date.now();
  return Math.round(parsed / 10_000) * 10_000;
};

const formatChartTimeLabel = (timestamp: string, timeframe: MarketChartTimeframe): string => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return timestamp;
  const options: Intl.DateTimeFormatOptions =
    timeframe === "1H"
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : timeframe === "6H" || timeframe === "1D"
        ? { hour: "2-digit", minute: "2-digit" }
        : timeframe === "1W"
          ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
          : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", options).format(date);
};

const toVenueChartModel = (
  chart: MarketChartResponse | null,
  timeframe: MarketChartTimeframe
): { rows: TerminalChartRow[]; series: TerminalChartSeries[]; historyStatus: MarketChartResponse["historyStatus"] | null } => {
  if (!chart) return { rows: [], series: [], historyStatus: null };
  const series = chart.series.map((item) => ({
    id: item.id,
    label: item.label,
    color: item.color,
    emphasis: item.id === "unified",
    dashed: item.id !== "unified"
  }));
  const rows = chart.points.map((point) => ({
    label: formatChartTimeLabel(point.timestamp, timeframe),
    timestamp: Date.parse(point.timestamp),
    unified: chartPointValue(point.unified),
    ...Object.fromEntries(Object.entries(point.venues).map(([venue, value]) => [venue, chartPointValue(value)]))
  }));
  return { rows, series, historyStatus: chart.historyStatus };
};

const toOutcomeChartModel = (
  charts: Array<{ chart: MarketChartResponse; key: string; label: string; color: string }>,
  timeframe: MarketChartTimeframe
): { rows: TerminalChartRow[]; series: TerminalChartSeries[]; historyStatus: MarketChartResponse["historyStatus"] | null } => {
  const rowsByBucket = new Map<number, TerminalChartRow>();
  const series: TerminalChartSeries[] = charts.map((entry) => ({
    id: entry.key,
    label: entry.label,
    color: entry.color
  }));

  for (const entry of charts) {
    for (const point of entry.chart.points) {
      const value = chartPointValue(point.unified);
      if (value === null) continue;
      const bucket = bucketChartTimestamp(point.timestamp);
      const existing = rowsByBucket.get(bucket) ?? {
        label: formatChartTimeLabel(point.timestamp, timeframe),
        timestamp: bucket
      };
      existing[entry.key] = value;
      rowsByBucket.set(bucket, existing);
    }
  }

  const rows = [...rowsByBucket.values()].sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0));
  const historyStatus = charts.some((entry) => entry.chart.historyStatus === "live")
    ? "live"
    : charts.some((entry) => entry.chart.historyStatus === "accumulating")
      ? "accumulating"
      : charts.some((entry) => entry.chart.historyStatus === "unavailable")
        ? "unavailable"
        : null;
  return { rows, series, historyStatus };
};

const LiveCanonicalChart = ({
  marketId,
  outcomeId,
  marketType,
  outcomes = EMPTY_TERMINAL_OUTCOMES,
}: {
  marketId: string | null;
  outcomeId: string | null;
  marketType: 'binary' | 'multi';
  outcomes?: TerminalOutcomeRow[];
}) => {
  const [activeTab, setActiveTab] = useState<MarketChartTimeframe>('ALL');
  const [venueChart, setVenueChart] = useState<MarketChartResponse | null>(null);
  const [outcomeCharts, setOutcomeCharts] = useState<Array<{ chart: MarketChartResponse; key: string; label: string; color: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabs: MarketChartTimeframe[] = ['1H', '6H', '1D', '1W', '1M', 'ALL'];
  const binaryOutcomeInputs = useMemo(() => {
    if (marketType !== 'binary') return [];
    const source = outcomes.length > 0
      ? outcomes
      : [
          { id: 'YES', marketId, quoteOutcomeId: 'YES', name: 'Yes' } as TerminalOutcomeRow,
          { id: 'NO', marketId, quoteOutcomeId: 'NO', name: 'No' } as TerminalOutcomeRow
        ];
    return source.slice(0, 5).map((outcome, index) => ({
      id: outcome.id,
      quoteOutcomeId: outcome.quoteOutcomeId,
      label: outcome.name,
      key: normalizeChartKey('outcome', outcome.id),
      color: OUTCOME_CHART_COLORS[index % OUTCOME_CHART_COLORS.length]!
    }));
  }, [marketType, outcomes]);
  const chartModel = useMemo(
    () => marketType === 'binary'
      ? toOutcomeChartModel(outcomeCharts, activeTab)
      : toVenueChartModel(venueChart, activeTab),
    [activeTab, marketType, outcomeCharts, venueChart]
  );
  const { rows, series, historyStatus } = chartModel;

  React.useEffect(() => {
    let cancelled = false;
    const loadChart = async () => {
      if (!marketId) {
        setVenueChart(null);
        setOutcomeCharts([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (marketType === 'binary') {
          const results = await Promise.allSettled(
            binaryOutcomeInputs.map(async (outcome) => ({
              ...outcome,
              chart: await getMarketChart(marketId, { outcomeId: outcome.quoteOutcomeId, timeframe: activeTab })
            }))
          );
          const fulfilled = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
          if (!cancelled) {
            setVenueChart(null);
            setOutcomeCharts(fulfilled);
            if (fulfilled.length === 0) {
              const rejected = results.find((result) => result.status === 'rejected');
              setError(safeMarketDataError(rejected?.reason, 'chart'));
            }
          }
          return;
        }

        const response = await getMarketChart(marketId, { outcomeId, timeframe: activeTab });
        if (!cancelled) {
          setOutcomeCharts([]);
          setVenueChart(response);
        }
      } catch (err) {
        if (!cancelled) {
          setVenueChart(null);
          setOutcomeCharts([]);
          setError(safeMarketDataError(err, 'chart'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadChart();
    const interval = window.setInterval(() => {
      void loadChart();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTab, binaryOutcomeInputs, marketId, marketType, outcomeId]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#18181b]/95 border border-zinc-800 rounded-lg p-3 shadow-2xl z-50 min-w-[200px]">
        <div className="text-zinc-400 text-[11px] mb-3 font-sans">{label}</div>
        <div className="flex flex-col gap-2">
          {[...payload].filter((entry: any) => typeof entry.value === 'number').sort((a: any, b: any) => b.value - a.value).map((entry: any) => (
            <div key={entry.dataKey} className="flex items-center gap-1.5 text-[13px] font-medium">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="font-bold text-white">{Number(entry.value).toFixed(Number(entry.value) >= 10 ? 1 : 2)}{marketType === 'multi' ? 'c' : '%'}</span>
              <span className="text-white ml-0.5">{entry.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-full flex flex-col pt-2 pb-2 bg-[#0c0c0c] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-2">
        <Activity className="w-4 h-4 text-white" />
        <span className="text-white font-bold text-sm">Probability</span>
      </div>
      <div className="w-full bg-zinc-800 h-px mt-2" />
      <div className="w-24 bg-white h-0.5" />
      <div className="flex items-center justify-between px-4 mt-3">
        <div className="flex items-center rounded-md bg-transparent space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
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
      <div className="flex items-center gap-4 px-4 mt-4 text-[13px] min-h-[20px]">
        {series.slice(0, 5).map((item) => {
          const latest = [...rows].reverse().find((point) => typeof point[item.id] === 'number');
          const value = typeof latest?.[item.id] === 'number' ? latest[item.id] as number : null;
          return (
            <div key={item.id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-white font-bold">
                {item.label} {value === null ? 'pending' : `${value.toFixed(value >= 10 ? 1 : 2)}${marketType === 'multi' ? 'c' : '%'}`}
              </span>
            </div>
          );
        })}
        {historyStatus === 'accumulating' && (
          <div className="text-zinc-500 font-bold ml-2">Live history accumulating</div>
        )}
      </div>
      <div className="h-[300px] min-h-[300px] w-full mt-6 pr-4 relative">
        {loading && rows.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
            Loading live chart
          </div>
        )}
        {error && rows.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-xs font-semibold text-amber-300">
            {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-xs font-semibold text-zinc-500">
            Live chart data will appear after Lotus receives backend orderbook points for this market.
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
          <LineChart data={rows} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 11 }} dy={10} />
            <YAxis
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#71717A', fontSize: 11 }}
              dx={10}
              tickFormatter={(val) => marketType === 'multi' ? `${val}c` : `${val}%`}
              ticks={[0, 25, 50, 75, 100]}
              domain={[0, 100]}
            />
            {[0, 25, 50, 75, 100].map((val) => (
              <ReferenceLine key={val} y={val} stroke="#27272A" strokeDasharray="3 3" opacity={0.6} />
            ))}
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525B', strokeWidth: 1, strokeDasharray: '3 3' }} />
            {series.map((item) => (
              <Line
                key={item.id}
                type="monotone"
                dataKey={item.id}
                name={item.label}
                stroke={item.color}
                strokeWidth={item.emphasis ? 2.5 : 1.8}
                dot={false}
                strokeDasharray={item.dashed ? '4 2' : undefined}
                activeDot={{ r: item.emphasis ? 5 : 4, stroke: '#18181b', strokeWidth: 2 }}
                connectNulls
              />
            ))}
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
  relatedMarkets = [],
  session,
}: {
  embedded?: boolean;
  darkMode?: boolean;
  selectedMarket?: TerminalMarketSelection | null;
  relatedMarkets?: TerminalMarketSelection[];
  session?: AuthSession | null;
} = {}) => {
  const {
    wallets: turnkeyWallets,
    refreshWallets,
    handleLogin,
    signMessage,
    signAndSendTransaction,
    session: turnkeySession,
  } = useTurnkey();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType] = useState<'market' | 'limit' | 'pro'>('market');
  const [ticketOutcomeSide, setTicketOutcomeSide] = useState<TicketOutcomeSide>('yes');
  const [ticketAmount, setTicketAmount] = useState('');
  const [ticketLiveCandidates, setTicketLiveCandidates] = useState<LiveCandidatesResponse | null>(null);
  const [ticketLiveReadiness, setTicketLiveReadiness] = useState<LiveSubmitReadinessSnapshot | null>(null);
  const [ticketQuote, setTicketQuote] = useState<RouteQuote | null>(null);
  const [ticketQuoteAmount, setTicketQuoteAmount] = useState<string | null>(null);
  const [ticketExecutionId, setTicketExecutionId] = useState<string | null>(null);
  const [ticketSignatureBundle, setTicketSignatureBundle] = useState<SignatureBundle | null>(null);
  const [ticketStatusMessage, setTicketStatusMessage] = useState<string | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketActivationPolling, setTicketActivationPolling] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [rulesInnerTab, setRulesInnerTab] = useState<'rules' | 'aggregation'>('rules');
  const [orderAction, setOrderAction] = useState<'setup' | 'preview'>('setup');
  const [marketType, setMarketType] = useState<'binary' | 'multi'>('binary');
  const [bottomTab, setBottomTab] = useState<TerminalBottomTab>('Outcomes');
  const [ghostFill, setGhostFill] = useState(false);
  const [fastLane, setFastLane] = useState(false);
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [showAllOutcomes, setShowAllOutcomes] = useState(false);
  const [expandedOutcomeId, setExpandedOutcomeId] = useState<string | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null);
  const [terminalOutcomes, setTerminalOutcomes] = useState<TerminalOutcomeRow[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(false);
  const [outcomesError, setOutcomesError] = useState<string | null>(null);
  const [positions, setPositions] = useState<ExecutionPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<TerminalOpenOrder[]>([]);
  const [tradeHistory, setTradeHistory] = useState<ExecutionStatus[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [fundingBalances, setFundingBalances] = useState<VenueBalance[]>([]);
  const [fundingActivations, setFundingActivations] = useState<VenueActivation[]>([]);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [fundingModalOpen, setFundingModalOpen] = useState(false);
  const [riskState, setRiskState] = useState<TerminalRiskState>({ loading: false, error: null, assessments: [], profiles: [] });
  const [orderbook, setOrderbook] = useState<MarketOrderbookResponse | null>(null);
  const [orderbookLoading, setOrderbookLoading] = useState(false);
  const [orderbookError, setOrderbookError] = useState<string | null>(null);
  const [orderbookVenue, setOrderbookVenue] = useState<string>('ALL');
  const [localSelectedMarket, setLocalSelectedMarket] = useState<TerminalMarketSelection | null>(null);

  React.useEffect(() => {
    setLocalSelectedMarket(null);
  }, [selectedMarket?.id, selectedMarket?.marketId]);

  React.useEffect(() => {
    if (selectedMarket?.marketType) {
      setMarketType(selectedMarket.marketType);
    }
  }, [selectedMarket?.marketType, selectedMarket?.title]);

  const activeEventMarket = marketType === 'binary' ? canonicalEventMarkets[0] : canonicalEventMarkets[3];
  const activeSelectedMarket = localSelectedMarket ?? selectedMarket;
  const terminalMarket = useMemo<TerminalMarketSelection>(() => activeSelectedMarket ?? {
    title: marketType === 'binary' ? 'Cleveland / Will the Cleveland Cavaliers win...' : 'World Cup / Who will win the 2026 FIFA World Cup?',
    category: activeEventMarket.category,
    icon: activeEventMarket.icon,
    volume: '$67.9M',
    venueCount: canonicalEventMarkets.length,
    routeType: marketType === 'binary' ? 'Pair' : 'Single',
    marketType,
  }, [activeEventMarket.category, activeEventMarket.icon, activeSelectedMarket, marketType]);
  const selectorMarkets = useMemo(() => {
    const matchingEventMarkets = relatedMarkets.filter((market) => sameTerminalEvent(market, terminalMarket));
    const sourceMarkets = matchingEventMarkets.length > 0
      ? matchingEventMarkets
      : relatedMarkets.length > 0
        ? relatedMarkets.filter((market) => market.category === terminalMarket.category).slice(0, 12)
        : [];
    const byKey = new Map<string, TerminalMarketSelection>();
    byKey.set(terminalMarketKey(terminalMarket), terminalMarket);
    for (const market of sourceMarkets) byKey.set(terminalMarketKey(market), market);
    return Array.from(byKey.values());
  }, [relatedMarkets, terminalMarket]);
  const selectorSummary = useMemo(() => ({
    marketCount: selectorMarkets.length,
    bestRoute: bestRouteLabel(selectorMarkets),
    venueCount: uniqueVenueCount(selectorMarkets),
  }), [selectorMarkets]);
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
  const selectedVenueMarkets = selectedMarket?.venueMarkets ?? EMPTY_VENUE_MARKETS;
  const token = session?.userJwt ?? null;
  const marketVenueList = useMemo(() => {
    const venues = terminalMarket.venues?.length
      ? terminalMarket.venues
      : selectedVenueMarkets.map((venueMarket) => venueMarket.venue);
    return [...new Set(venues.filter(Boolean))];
  }, [selectedVenueMarkets, terminalMarket.venues]);
  const backendVenueList = useMemo(
    () => [...new Set(marketVenueList.map(toBackendVenueId).filter(Boolean))],
    [marketVenueList]
  );
  const venueReadyBalance = useMemo(() => {
    const venueSet = new Set(backendVenueList);
    return fundingBalances.reduce((sum, balance) => {
      const balanceVenue = toBackendVenueId(balance.venue);
      if (venueSet.size > 0 && !venueSet.has(balanceVenue)) return sum;
      return sum + venueReadyBalanceAmount(balance);
    }, 0);
  }, [backendVenueList, fundingBalances]);
  const polymarketActivationRequired = useMemo(() => {
    if (!backendVenueList.includes('POLYMARKET')) return false;
    const activation = fundingActivations.find((item) => toBackendVenueId(item.venue) === 'POLYMARKET');
    if (!activation) return false;
    const reason = String(activation.readinessReason ?? '').toUpperCase();
    const bridgedUsdc = parsePositiveNumber(activation.bridgedUsdcBalance ?? undefined) ?? 0;
    return activation.activationRequired === true &&
      (reason === 'POLYMARKET_USDCE_ACTIVATION_REQUIRED' ||
        reason === 'POLYMARKET_CLOB_APPROVAL_REQUIRED' ||
        bridgedUsdc > 0);
  }, [backendVenueList, fundingActivations]);
  const polymarketClobSyncPending = useMemo(() => {
    if (!backendVenueList.includes('POLYMARKET')) return false;
    const activation = fundingActivations.find((item) => toBackendVenueId(item.venue) === 'POLYMARKET');
    return String(activation?.readinessReason ?? '').toUpperCase() === 'POLYMARKET_CLOB_SYNC_PENDING';
  }, [backendVenueList, fundingActivations]);
  const visibleOutcomeRows = showAllOutcomes ? terminalOutcomes : terminalOutcomes.slice(0, 5);
  const selectedOutcome = terminalOutcomes.find((outcome) => outcome.id === selectedOutcomeId) ?? terminalOutcomes[0] ?? null;
  const selectedOutcomeMarketId = selectedOutcome?.marketId ?? terminalMarketId;
  const selectedQuoteOutcomeId = selectedOutcome?.quoteOutcomeId ?? selectedOutcomeId;
  const selectedTicketOutcomeId = outcomeIdForTicketSide(terminalOutcomes, ticketOutcomeSide, selectedOutcomeId);
  const selectedTicketOutcome = terminalOutcomes.find((outcome) => outcome.id === selectedTicketOutcomeId) ?? selectedOutcome;
  const selectedTicketMarketId = selectedTicketOutcome?.marketId ?? selectedOutcomeMarketId ?? terminalMarketId;
  const selectedTicketQuoteOutcomeId = quoteOutcomeIdForTicketSide(selectedTicketOutcome, ticketOutcomeSide)
    ?? selectedTicketOutcomeId;
  const ticketRoutePath = routePath(ticketQuote);
  const ticketRouteUsesPolymarket = Boolean(ticketQuote?.legs.some((leg) => toBackendVenueId(leg.venue) === 'POLYMARKET'));
  const ticketPolymarketTokenId = ticketQuote?.legs.find((leg) =>
    toBackendVenueId(leg.venue) === 'POLYMARKET' && /^\d+$/.test(String(leg.venueOutcomeId ?? ''))
  )?.venueOutcomeId;
  const ticketEffectivePrice = ticketQuote?.effectivePrice ?? ticketPriceForSide(selectedTicketOutcome, ticketOutcomeSide);
  const ticketEstimatedShares = estimateShares(ticketAmount, ticketEffectivePrice);
  const ticketShareImprovement = routeShareImprovement(ticketAmount, ticketQuote, ticketLiveCandidates);
  const accountEmptyCopy = !token ? 'Log in to load your Lotus execution records for this market.' : 'No backend records for this market yet.';
  const selectedSellPositions = positions.filter((position) =>
    matchesPositionMarket(position, selectedTicketMarketId, selectedTicketQuoteOutcomeId)
  );
  const ticketSellableShares = selectedSellPositions.reduce((sum, position) => {
    const sellable = parseFiniteNumber(position.sellableSize);
    if (sellable !== null) {
      return sum + Math.max(0, sellable);
    }
    const verified = parsePositiveNumber(position.verifiedSize) ?? 0;
    return sum + verified;
  }, 0);
  const totalVerifiedSize = positions.reduce((sum, position) => sum + (parsePositiveNumber(position.verifiedSize) ?? 0), 0);
  const totalCostBasis = positions.reduce((sum, position) => sum + (parsePositiveNumber(position.verifiedSize) ?? 0) * position.averageEntryPrice, 0);
  const averageEntry = totalVerifiedSize > 0 ? totalCostBasis / totalVerifiedSize : null;
  const positionVenueRows = positions.map((position) => {
    const outcomeRow = terminalOutcomes.find((outcome) => matchesPositionMarket(position, outcome.marketId ?? terminalMarketId, null)) ?? selectedOutcome;
    const currentPrice = parseProbabilityLabel(position.outcomeId === 'NO' ? outcomeRow?.noPrice : outcomeRow?.yesPrice) ?? position.averageEntryPrice;
    const size = parsePositiveNumber(position.verifiedSize) ?? 0;
    const value = size * currentPrice;
    const pnl = value - (size * position.averageEntryPrice);
    return {
      venue: formatVenueLabel(position.venue),
      logo: normalizeVenueId(position.venue),
      shares: formatCompactMetric(position.verifiedSize) ?? position.verifiedSize,
      avgEntry: formatProbabilityPrice(position.averageEntryPrice),
      mark: formatProbabilityPrice(currentPrice),
      pnl,
      pnlTone: pnl >= 0 ? 'text-emerald-400' : 'text-red-400',
      value,
      fill: formatCompactMetric(position.sellableSize) ? `${formatCompactMetric(position.sellableSize)} sellable` : 'Verified',
    };
  });
  const totalPositionValue = positionVenueRows.reduce((sum, row) => sum + row.value, 0);
  const totalPositionPnl = positionVenueRows.reduce((sum, row) => sum + row.pnl, 0);
  const primaryRiskAssessment = riskState.assessments[0] ?? null;
  const primaryRiskTone = riskTone(primaryRiskAssessment);
  const PrimaryRiskIcon = primaryRiskTone.icon;
  const primaryRiskFactors = primaryRiskAssessment ? riskFactorRows(primaryRiskAssessment) : [];
  const bottomPanelHeight = bottomTab === 'Outcomes'
    ? 'h-[440px] 2xl:h-[500px]'
    : 'h-[620px] 2xl:h-[720px]';
  const venueBadgeClass = 'h-7 w-7 rounded-full border-[2.5px] border-[#121214] bg-zinc-900 shadow-sm';
  const tinyVenueClass = 'h-3.5 w-3.5 rounded-full border border-zinc-800 bg-zinc-950';
  const orderbookVenueOptions = useMemo(
    () => [...new Set([...(orderbook?.venues.map((venue) => venue.venue) ?? []), ...marketVenueList.map((venue) => venue.toUpperCase())])].sort(),
    [marketVenueList, orderbook?.venues]
  );

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
      const seededEventOutcomes = fallbackRows.length > 0 && fallbackRows.some((row) =>
        row.marketId !== terminalMarketId || !isGenericBinaryOutcome(row.name)
      );
      const seededOutcomes = fallbackRows.map((row) => ({
        id: row.id,
        label: row.name,
        venues: row.venues,
        marketId: row.marketId,
        quoteOutcomeId: row.quoteOutcomeId,
      }));
      const outcomeResponse = seededEventOutcomes ? null : await getMarketOutcomes(terminalMarketId);
      const baseOutcomes = seededEventOutcomes
        ? seededOutcomes
        : outcomeResponse && outcomeResponse.outcomes.length > 0
          ? outcomeResponse.outcomes.map((outcome) => ({
            id: outcome.id,
            label: outcome.label,
            venues: outcome.venues,
            marketId: terminalMarketId,
            quoteOutcomeId: canonicalQuoteOutcomeId(outcome.label),
          }))
          : seededOutcomes;

      const rows = await Promise.all(baseOutcomes.map(async (outcome, index): Promise<TerminalOutcomeRow> => {
        const outcomeMarketId = outcome.marketId ?? terminalMarketId;
        const quoteOutcomeId = outcome.quoteOutcomeId ?? canonicalQuoteOutcomeId(outcome.label);
        if (!token) {
          const venues = outcome.venues.length ? outcome.venues : marketVenueList;
          return {
            id: outcome.id,
            marketId: outcomeMarketId,
            quoteOutcomeId,
            name: outcome.label,
            vol: `${formatMoneyMetric(terminalMarket.volume) ?? terminalMarket.volume} Vol.`,
            platforms: venues.length || terminalMarket.venueCount,
            prob: 'Quote',
            yesPrice: 'Quote',
            noPrice: 'Quote',
            primaryVenue: venues[0] ?? null,
            venueQuotes: placeholderVenueQuotes(venues, 'Quote', 'Quote', 'Login required for live route quote'),
            active: index === 0,
            venues,
            status: 'auth_required',
            blocker: 'Login required for live route quote',
          };
        }

        try {
          const candidateResponse = await getLiveCandidates(token, {
            side: 'buy',
            marketId: outcomeMarketId,
            outcomeId: quoteOutcomeId,
            amount: '1',
            venues: backendVenueList.length ? backendVenueList : undefined,
          });
          const best = bestCandidate(candidateResponse.candidates);
          const average = averageCandidatePrice(candidateResponse.candidates);
          const venueQuotes = toVenueQuotes(candidateResponse.candidates, terminalMarket.marketType);
          const venues = candidateResponse.candidates.length
            ? candidateResponse.candidates.map((candidate) => candidate.venue)
            : outcome.venues;
          const primaryQuote = venueQuotes[0] ?? null;
          return {
            id: outcome.id,
            marketId: outcomeMarketId,
            quoteOutcomeId,
            name: outcome.label,
            vol: `${formatMoneyMetric(terminalMarket.volume) ?? terminalMarket.volume} Vol.`,
            platforms: venues.length || terminalMarket.venueCount,
            prob: formatProbabilityPercent(average),
            yesPrice: primaryQuote?.yesPrice ?? formatProbabilityPrice(best?.price ?? average),
            noPrice: primaryQuote?.noPrice ?? (terminalMarket.marketType === 'binary' && best?.price ? formatProbabilityPrice(1 - best.price) : 'Quote'),
            primaryVenue: primaryQuote?.venue ?? best?.venue ?? venues[0] ?? null,
            venueQuotes: venueQuotes.length ? venueQuotes : placeholderVenueQuotes(venues, 'Quote', 'Quote', readableQuoteBlocker(candidateResponse.blocked[0]?.reason)),
            active: index === 0,
            venues,
            status: candidateResponse.candidates.length ? 'live' : 'unavailable',
            blocker: readableQuoteBlocker(candidateResponse.blocked[0]?.reason),
          };
        } catch (error) {
          const venues = outcome.venues.length ? outcome.venues : marketVenueList;
          const blocker = readableQuoteBlocker(error instanceof Error ? error.message : null) ?? 'Live quote unavailable';
          return {
            id: outcome.id,
            marketId: outcomeMarketId,
            quoteOutcomeId,
            name: outcome.label,
            vol: `${formatMoneyMetric(terminalMarket.volume) ?? terminalMarket.volume} Vol.`,
            platforms: venues.length || terminalMarket.venueCount,
            prob: 'Quote',
            yesPrice: 'Quote',
            noPrice: 'Quote',
            primaryVenue: venues[0] ?? null,
            venueQuotes: placeholderVenueQuotes(venues, 'Quote', 'Quote', blocker),
            active: index === 0,
            venues,
            status: 'unavailable',
            blocker,
          };
        }
      }));

      setTerminalOutcomes(rows);
      setSelectedOutcomeId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        if (terminalMarket.initialOutcomeId && rows.some((row) => row.id === terminalMarket.initialOutcomeId)) {
          return terminalMarket.initialOutcomeId;
        }
        return rows[0]?.id ?? null;
      });
    } catch (error) {
      setTerminalOutcomes(fallbackRows);
      setSelectedOutcomeId((current) => {
        if (current) return current;
        if (terminalMarket.initialOutcomeId && fallbackRows.some((row) => row.id === terminalMarket.initialOutcomeId)) {
          return terminalMarket.initialOutcomeId;
        }
        return fallbackRows[0]?.id ?? null;
      });
      setOutcomesError(error instanceof Error ? error.message : 'Unable to load market outcomes');
    } finally {
      setOutcomesLoading(false);
    }
  }, [backendVenueList, marketVenueList, terminalMarket, terminalMarketId, token]);

  React.useEffect(() => {
    setShowAllOutcomes(false);
    setSelectedOutcomeId(terminalMarket.initialOutcomeId ?? null);
    setExpandedOutcomeId(null);
    setTicketOutcomeSide(terminalMarket.initialOutcomeSide ?? 'yes');
    setTicketAmount('');
    setTicketLiveCandidates(null);
    setTicketQuote(null);
    setTicketQuoteAmount(null);
    setTicketExecutionId(null);
    setTicketSignatureBundle(null);
    setTicketStatusMessage(null);
    setTicketError(null);
  }, [terminalMarket.initialOutcomeId, terminalMarket.initialOutcomeSide, terminalMarketId]);

  const selectTicketOutcome = useCallback((nextSide: TicketOutcomeSide, fallbackOutcomeId?: string | null) => {
    setTicketOutcomeSide(nextSide);
    setTicketLiveCandidates(null);
    setTicketQuote(null);
    setTicketQuoteAmount(null);
    setTicketExecutionId(null);
    setTicketSignatureBundle(null);
    setTicketStatusMessage(null);
    setTicketError(null);
    if (fallbackOutcomeId) {
      setSelectedOutcomeId(fallbackOutcomeId);
    }
  }, []);

  const resetTicketPreviewState = useCallback(() => {
    setTicketLiveCandidates(null);
    setTicketQuote(null);
    setTicketQuoteAmount(null);
    setTicketExecutionId(null);
    setTicketSignatureBundle(null);
    setTicketStatusMessage(null);
    setTicketError(null);
  }, []);

  const setTicketAmountFromPercent = useCallback((percent: number) => {
    const baseAmount = side === 'sell' ? ticketSellableShares : venueReadyBalance;
    const nextAmount = baseAmount > 0 ? baseAmount * percent : 0;
    setTicketAmount(nextAmount > 0 ? formatRouteAmount(nextAmount) : '');
    resetTicketPreviewState();
  }, [resetTicketPreviewState, side, ticketSellableShares, venueReadyBalance]);

  const switchTicketSide = useCallback((nextSide: 'buy' | 'sell') => {
    setSide(nextSide);
    setTicketAmount('');
    resetTicketPreviewState();
  }, [resetTicketPreviewState]);

  const previewMarketOrder = useCallback(async () => {
    if (!token) {
      setTicketError('Log in to preview a live market route.');
      return;
    }
    if (!selectedTicketMarketId || !selectedTicketQuoteOutcomeId) {
      setTicketError('Select a backend market outcome first.');
      return;
    }
    if (side === 'buy') {
      if (fundingLoading) {
        setTicketStatusMessage('Checking backend venue-ready balance while requesting the live route.');
      }
      if (fundingError) {
        setTicketStatusMessage('Funding readiness cache is unavailable. Backend route checks will decide tradeability.');
      }
    }
    const requestedShares = side === 'buy'
      ? estimateShares(ticketAmount, ticketPriceForSide(selectedTicketOutcome, ticketOutcomeSide))
      : parsePositiveNumber(ticketAmount);
    if (!requestedShares) {
      setTicketError(side === 'buy' ? 'Enter a USDC amount after a live outcome price is available.' : 'Enter the shares to sell.');
      return;
    }
    if (side === 'sell' && ticketSellableShares <= 0) {
      setTicketError('No verified sellable shares are available for this outcome yet.');
      return;
    }
    if (side === 'sell' && requestedShares > ticketSellableShares) {
      setTicketError(`You can sell up to ${formatSignedShares(ticketSellableShares)} for this outcome.`);
      return;
    }
    const backendAmount = formatRouteAmount(requestedShares);
    setTicketLoading(true);
    setTicketError(null);
    setTicketStatusMessage(null);
    setTicketQuote(null);
    setTicketLiveReadiness(null);
    setTicketExecutionId(null);
    setTicketSignatureBundle(null);
    try {
      const liveCandidates = await getLiveCandidates(token, {
        side,
        marketId: selectedTicketMarketId,
        outcomeId: selectedTicketQuoteOutcomeId,
        amount: backendAmount,
        venues: backendVenueList.length ? backendVenueList : undefined,
      });
      setTicketLiveCandidates(liveCandidates);
      if (liveCandidates.candidates.length === 0) {
        setTicketError(readableQuoteBlocker(liveCandidates.blocked[0]?.reason) ?? 'No executable live route returned for this market order.');
        return;
      }
      const response = await createExecutionQuote(token, {
        side,
        marketId: selectedTicketMarketId,
        outcomeId: selectedTicketQuoteOutcomeId,
        amount: backendAmount,
        venues: backendVenueList.length ? backendVenueList : undefined,
        candidates: liveCandidates.candidates,
      });
      setTicketQuote(response.quote);
      setTicketQuoteAmount(ticketAmount.trim());
      setTicketSignatureBundle(null);
      setOrderAction(routePath(response.quote).length > 0 ? 'preview' : 'setup');
      try {
        const readiness = await getLiveReadiness(token, response.quote.quoteId);
        setTicketLiveReadiness(readiness);
        const readinessBlocker = readiness.venues.find((venue) => venue.status === 'blocked' && venue.blockers.length > 0);
        if (readinessBlocker) {
          const blockerCopy = readinessBlocker.blockers[0] ?? 'Live submit readiness is blocked.';
          const venueLabel = formatVenueLabel(readinessBlocker.venue);
          setTicketError(`${venueLabel}: ${blockerCopy}`);
          setTicketStatusMessage(/ALLOWANCE|APPROVE/i.test(blockerCopy)
            ? `${venueLabel} route is priced, but collateral approval is required before signing.`
            : `${venueLabel} route is priced, but live submit is blocked until collateral readiness clears.`);
          return;
        }
      } catch {
        setTicketLiveReadiness(null);
      }
      setTicketStatusMessage('Live market quote ready. Review the route before placing the order.');
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Live market quote failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [backendVenueList, fundingError, fundingLoading, selectedTicketMarketId, selectedTicketOutcome, selectedTicketOutcomeId, selectedTicketQuoteOutcomeId, side, ticketAmount, ticketOutcomeSide, ticketSellableShares, token, venueReadyBalance]);

  const signAndSubmitTicketSignature = useCallback(async (bundle: SignatureBundle, executionId: string) => {
    if (!token) return;
    if (ticketQuoteAmount !== null && ticketQuoteAmount !== ticketAmount.trim()) {
      setTicketError('The visible amount changed after this route was quoted. Preview the route again before signing.');
      setTicketStatusMessage(null);
      setTicketSignatureBundle(null);
      setTicketExecutionId(null);
      return;
    }
    if (ticketLiveReadiness?.venues.some((venue) => venue.status === 'blocked' && venue.blockers.length > 0)) {
      const blocked = ticketLiveReadiness.venues.find((venue) => venue.status === 'blocked' && venue.blockers.length > 0);
      setTicketError(`${formatVenueLabel(blocked?.venue ?? 'Venue')}: ${blocked?.blockers[0] ?? 'Live submit readiness is blocked.'}`);
      setTicketStatusMessage('This route must clear live readiness before wallet signing.');
      return;
    }
    if (bundle.signatureRequests.length === 0) {
      setTicketError('This route requires a wallet signature, but no signature request was returned.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    try {
      let activeWallets = turnkeyWallets;
      if (activeWallets.length === 0) {
        try {
          activeWallets = await refreshWallets();
        } catch (walletError) {
          if (!isTurnkeyMissingSessionError(walletError)) {
            throw walletError;
          }
          setTicketStatusMessage('Reconnect your Turnkey wallet session to sign this market order.');
          await handleLogin();
          activeWallets = await refreshWallets();
        }
      }
      const organizationId = turnkeySession?.organizationId ?? session?.turnkeyOrganizationId;
      const signedLegs = [];
      for (const request of bundle.signatureRequests) {
        if (request.kind !== 'EIP712' || !request.typedData) {
          throw new Error(`${request.venue} returned an unsupported signature request.`);
        }
        const signer = request.signer ?? '';
        const account = request.account ?? signer;
        const walletAccount = findTurnkeyWalletAccount(activeWallets, signer);
        if (!walletAccount) {
          throw new Error(`${request.venue} requires the Turnkey EVM wallet ${signer.slice(0, 6)}...${signer.slice(-4)}, but it is not loaded in this session.`);
        }
        const signatureResult = await signMessage({
          message: eip712PayloadForTurnkey(request.typedData),
          walletAccount,
          encoding: 'PAYLOAD_ENCODING_EIP712',
          hashFunction: 'HASH_FUNCTION_NO_OP',
          addEthereumPrefix: false,
          ...(organizationId ? { organizationId } : {}),
        });
        const hint = recordValue(request.signedPayloadHint);
        signedLegs.push({
          legIndex: request.legIndex,
          venue: request.venue,
          requestType: request.requestType,
          signedPayload: {
            ...hint,
            signer,
            account,
            typedData: request.typedData,
            signature: signatureFromTurnkeyResult(signatureResult),
          },
        });
      }
      setTicketStatusMessage('Wallet signature collected. Submitting signed market order to Lotus backend.');
      const submitted = await submitSignedBundle(token, executionId, signedLegs, false);
      setTicketExecutionId(submitted.executionId);
      setTicketSignatureBundle(null);
      void getPositions(token, { limit: 100 })
        .then((positionsResponse) => {
          setPositions(positionsResponse.positions.filter((position) =>
            isOpenExecutionPosition(position) || (parsePositiveNumber(position.sellableSize) ?? 0) > 0
          ));
        })
        .catch(() => undefined);
      const submittedStatus = (submitted.status ?? submitted.userStatus ?? 'SUBMITTED').toUpperCase();
      if (submittedStatus === 'FAILED') {
        const reason = submitted.submittedLegs?.find((leg) => leg.reason)?.reason;
        setTicketStatusMessage('Market order failed at venue submit.');
        setTicketError(reason ? `Execution failed: ${reason}` : 'Execution failed after backend submit.');
        setBottomTab('Trade History');
        return;
      }
      const successMessage = submittedStatus === 'FILLED'
        ? 'Market order filled.'
        : submittedStatus === 'PARTIAL'
          ? 'Market order partially filled. Tracking remaining size.'
          : 'Market order submitted. Tracking execution status.';
      setTicketStatusMessage(successMessage);
      setBottomTab(submittedStatus === 'SUBMITTED' || submittedStatus === 'PARTIAL' ? 'Open Orders' : 'Trade History');
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Wallet signature or signed submit failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [handleLogin, refreshWallets, session?.turnkeyOrganizationId, signMessage, ticketAmount, ticketLiveReadiness, ticketQuoteAmount, token, turnkeySession?.organizationId, turnkeyWallets]);

  const submitMarketOrder = useCallback(async () => {
    if (!token || !ticketQuote) {
      return;
    }
    if (ticketQuoteAmount !== null && ticketQuoteAmount !== ticketAmount.trim()) {
      setTicketError('The visible amount changed after this route was quoted. Preview the route again before submitting.');
      setTicketStatusMessage(null);
      setTicketSignatureBundle(null);
      setTicketExecutionId(null);
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    try {
      const response = await submitExecutionQuote(token, ticketQuote.quoteId);
      const executionId = response.executionId || ticketQuote.quoteId;

      const signatureRequired = ticketQuote.requiredUserSignatureSteps.length > 0 ||
        ticketQuote.legs.some((leg) => leg.requiresUserSignature === true);
      if (signatureRequired) {
        setTicketExecutionId(executionId);
        const signatures = await prepareSignatures(token, executionId);
        setTicketSignatureBundle(signatures);
        setTicketStatusMessage(
          signatures.signatureRequests.length > 0
            ? `Prepared ${signatures.signatureRequests.length} wallet signature request(s).`
            : response.message || 'User signature is required before this route can be submitted.'
        );
        if (signatures.signatureRequests.length > 0) {
          await signAndSubmitTicketSignature(signatures, executionId);
        } else {
          setTicketError('This route requires a wallet signature, but no signature request was returned.');
        }
        return;
      }

      const submitted = await submitSignedBundle(token, executionId, [], false);
      setTicketExecutionId(submitted.executionId);
      void getPositions(token, { limit: 100 })
        .then((positionsResponse) => {
          setPositions(positionsResponse.positions.filter((position) =>
            isOpenExecutionPosition(position) || (parsePositiveNumber(position.sellableSize) ?? 0) > 0
          ));
        })
        .catch(() => undefined);
      const submittedStatus = (submitted.status ?? submitted.userStatus ?? 'SUBMITTED').toUpperCase();
      if (submittedStatus === 'FAILED') {
        const reason = submitted.submittedLegs?.find((leg) => leg.reason)?.reason;
        setTicketStatusMessage('Market order failed at venue submit.');
        setTicketError(reason ? `Execution failed: ${reason}` : 'Execution failed after backend submit.');
        setBottomTab('Trade History');
        return;
      }
      const successMessage = submittedStatus === 'FILLED'
        ? 'Market order filled.'
        : submittedStatus === 'PARTIAL'
          ? 'Market order partially filled. Tracking remaining size.'
          : 'Market order submitted. Tracking execution status.';
      setTicketStatusMessage(successMessage);
      setBottomTab(submittedStatus === 'SUBMITTED' || submittedStatus === 'PARTIAL' ? 'Open Orders' : 'Trade History');
    } catch (error) {
      setTicketExecutionId(null);
      if (isLimitlessExchangeRefreshError(error)) {
        setTicketQuote(null);
        setTicketQuoteAmount(null);
        setTicketSignatureBundle(null);
        setTicketStatusMessage('This Limitless route needs fresh market metadata. Preview the route again before signing.');
      }
      setTicketError(error instanceof Error ? error.message : 'Market order submit failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [signAndSubmitTicketSignature, ticketAmount, ticketQuote, ticketQuoteAmount, token]);

  const prepareTicketSignature = useCallback(async () => {
    if (!token || !ticketQuote) return;
    if (ticketQuoteAmount !== null && ticketQuoteAmount !== ticketAmount.trim()) {
      setTicketError('The visible amount changed after this route was quoted. Preview the route again before signing.');
      setTicketStatusMessage(null);
      setTicketSignatureBundle(null);
      setTicketExecutionId(null);
      return;
    }
    if (ticketLiveReadiness?.venues.some((venue) => venue.status === 'blocked' && venue.blockers.length > 0)) {
      const blocked = ticketLiveReadiness.venues.find((venue) => venue.status === 'blocked' && venue.blockers.length > 0);
      setTicketError(`${formatVenueLabel(blocked?.venue ?? 'Venue')}: ${blocked?.blockers[0] ?? 'Live submit readiness is blocked.'}`);
      setTicketStatusMessage('This route must clear live readiness before wallet signing.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    try {
      const executionId = ticketExecutionId ?? (await submitExecutionQuote(token, ticketQuote.quoteId)).executionId;
      setTicketExecutionId(executionId);
      const signatures = await prepareSignatures(token, executionId);
      setTicketSignatureBundle(signatures);
      setTicketStatusMessage(`Prepared ${signatures.signatureRequests.length} wallet signature request(s).`);
      setTicketError(
        signatures.signatureRequests.length > 0
          ? 'Wallet signature is ready for Turnkey review.'
          : 'No signature requests were returned for this route.'
      );
    } catch (error) {
      if (isLimitlessExchangeRefreshError(error)) {
        setTicketQuote(null);
        setTicketQuoteAmount(null);
        setTicketExecutionId(null);
        setTicketSignatureBundle(null);
        setTicketStatusMessage('This Limitless route needs fresh market metadata. Preview the route again before signing.');
      }
      setTicketError(error instanceof Error ? error.message : 'Signature preparation failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [ticketAmount, ticketExecutionId, ticketLiveReadiness, ticketQuote, ticketQuoteAmount, token]);

  const activateLimitlessAccount = useCallback(async () => {
    if (!token) {
      setTicketError('Log in before activating Limitless.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    setTicketStatusMessage('Preparing Limitless account activation.');
    try {
      const prepared = await prepareVenueSetupBatch(token);
      const limitlessAccount = prepared.accounts.find((account) => account.venue.toUpperCase() === 'LIMITLESS');
      const setupRequests = [
        ...(prepared.setupRequests ?? []),
        ...(prepared.signatureRequests ?? []),
      ];
      const setupRequest = setupRequests.find((request): request is VenueSetupSignatureRequest =>
        request.venue.toUpperCase() === 'LIMITLESS' &&
        typeof request.signer === 'string' &&
        typeof request.message === 'string' &&
        request.message.length > 0
      );

      if (!setupRequest) {
        if (limitlessAccount?.status === 'ACTIVE' && (limitlessAccount.readinessBlockers ?? []).length === 0) {
          setTicketStatusMessage('Limitless account is linked. Refreshing the live route.');
          setTicketExecutionId(null);
          setTicketSignatureBundle(null);
          setTicketError(null);
          await previewMarketOrder();
          return;
        }
        const blocker = limitlessAccount?.readinessBlockers?.[0] ?? limitlessAccount?.setupInstructions?.[0];
        setTicketError(blocker ?? 'Limitless account setup is not ready yet. Open Portfolio and retry venue setup.');
        setTicketStatusMessage(null);
        return;
      }

      let activeWallets = turnkeyWallets;
      if (activeWallets.length === 0) {
        try {
          activeWallets = await refreshWallets();
        } catch (walletError) {
          if (!isTurnkeyMissingSessionError(walletError)) {
            throw walletError;
          }
          setTicketStatusMessage('Reconnect your Turnkey wallet session to activate Limitless.');
          await handleLogin();
          activeWallets = await refreshWallets();
        }
      }

      const walletAccount = findTurnkeyWalletAccount(activeWallets, setupRequest.signer);
      if (!walletAccount) {
        throw new Error(`Limitless activation needs your Turnkey EVM wallet ${setupRequest.signer.slice(0, 6)}...${setupRequest.signer.slice(-4)}, but it is not loaded in this session.`);
      }

      const organizationId = turnkeySession?.organizationId ?? session?.turnkeyOrganizationId;
      setTicketStatusMessage('Sign the Limitless account ownership message with Turnkey.');
      const signatureResult = await signMessage({
        message: setupRequest.message,
        walletAccount,
        encoding: 'PAYLOAD_ENCODING_TEXT_UTF8',
        hashFunction: 'HASH_FUNCTION_KECCAK256',
        addEthereumPrefix: true,
        ...(organizationId ? { organizationId } : {}),
      });

      setTicketStatusMessage('Submitting Limitless account activation to Lotus.');
      const completed = await completeVenueSetupBatch(token, {
        limitless: {
          signer: setupRequest.signer,
          message: setupRequest.message,
          signature: signatureFromTurnkeyResult(signatureResult),
        },
      });
      const completedAccount = completed.accounts.find((account) => account.venue.toUpperCase() === 'LIMITLESS');
      const blockers = completedAccount?.readinessBlockers ?? [];
      if (!completedAccount || completedAccount.status !== 'ACTIVE' || blockers.length > 0) {
        setTicketError(blockers[0] ?? 'Limitless account activation is still pending.');
        setTicketStatusMessage(null);
        return;
      }

      setTicketStatusMessage('Limitless account linked. Refreshing the live route.');
      setTicketExecutionId(null);
      setTicketSignatureBundle(null);
      setTicketError(null);
      await previewMarketOrder();
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Limitless account activation failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [handleLogin, previewMarketOrder, refreshWallets, session?.turnkeyOrganizationId, signMessage, token, turnkeySession?.organizationId, turnkeyWallets]);

  const refreshPredictFunAuth = useCallback(async () => {
    if (!token) {
      setTicketError('Log in before refreshing Predict.fun auth.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    setTicketStatusMessage('Preparing Predict.fun auth refresh.');
    try {
      const prepared = await prepareVenueSetupBatch(token);
      const predictAccount = prepared.accounts.find((account) => account.venue.toUpperCase() === 'PREDICT_FUN');
      const setupRequests = [
        ...(prepared.setupRequests ?? []),
        ...(prepared.signatureRequests ?? []),
      ];
      const setupRequest = setupRequests.find((request): request is VenueSetupSignatureRequest =>
        request.venue.toUpperCase() === 'PREDICT_FUN' &&
        typeof request.signer === 'string' &&
        typeof request.message === 'string' &&
        request.message.length > 0
      );

      if (!setupRequest) {
        const blocker = predictAccount?.readinessBlockers?.[0] ?? predictAccount?.setupInstructions?.[0];
        setTicketError(blocker ?? 'Predict.fun auth refresh is not ready. Open Portfolio and retry venue setup.');
        setTicketStatusMessage(null);
        return;
      }

      let activeWallets = turnkeyWallets;
      if (activeWallets.length === 0) {
        try {
          activeWallets = await refreshWallets();
        } catch (walletError) {
          if (!isTurnkeyMissingSessionError(walletError)) {
            throw walletError;
          }
          setTicketStatusMessage('Reconnect your Turnkey wallet session to refresh Predict.fun auth.');
          await handleLogin();
          activeWallets = await refreshWallets();
        }
      }

      const walletAccount = findTurnkeyWalletAccount(activeWallets, setupRequest.signer);
      if (!walletAccount) {
        throw new Error(`Predict.fun auth needs your Turnkey EVM wallet ${setupRequest.signer.slice(0, 6)}...${setupRequest.signer.slice(-4)}, but it is not loaded in this session.`);
      }

      const organizationId = turnkeySession?.organizationId ?? session?.turnkeyOrganizationId;
      setTicketStatusMessage('Sign the Predict.fun auth message with Turnkey.');
      const signatureResult = await signMessage({
        message: setupRequest.message,
        walletAccount,
        encoding: 'PAYLOAD_ENCODING_TEXT_UTF8',
        hashFunction: 'HASH_FUNCTION_KECCAK256',
        addEthereumPrefix: true,
        ...(organizationId ? { organizationId } : {}),
      });

      setTicketStatusMessage('Submitting Predict.fun auth refresh to Lotus.');
      await completeVenueSetupBatch(token, {
        predictFun: {
          signer: setupRequest.signer,
          message: setupRequest.message,
          signature: signatureFromTurnkeyResult(signatureResult),
        },
      });

      setTicketStatusMessage('Predict.fun auth refreshed. Refreshing the live route.');
      setTicketQuote(null);
      setTicketQuoteAmount(null);
      setTicketExecutionId(null);
      setTicketSignatureBundle(null);
      setTicketLiveReadiness(null);
      setTicketError(null);
      await previewMarketOrder();
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Predict.fun auth refresh failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [handleLogin, previewMarketOrder, refreshWallets, session?.turnkeyOrganizationId, signMessage, token, turnkeySession?.organizationId, turnkeyWallets]);

  const approveRouteCollateral = useCallback(async () => {
    const readinessVenue = ticketLiveReadiness?.venues.find((venue) =>
      venue.status === 'blocked' &&
      venue.blockers.some((blocker) => /ALLOWANCE|APPROVE/i.test(blocker)) &&
      Boolean(venue.collateral.tokenAddress && venue.collateral.spenderAddress && venue.collateral.chainId && venue.account.ownerAddress)
    ) ?? null;
    const venueLabel = readinessVenue ? formatVenueLabel(readinessVenue.venue) : 'venue';
    if (!token || !readinessVenue) {
      setTicketError('Preview the route again before approving collateral.');
      return;
    }
    const ownerAddress = readinessVenue.account.ownerAddress;
    const tokenAddress = readinessVenue.collateral.tokenAddress;
    const spenderAddress = readinessVenue.collateral.spenderAddress;
    const chainId = readinessVenue.collateral.chainId;
    const approvalMethod = readinessVenue.collateral.approvalMethod ?? 'ERC20_APPROVE';
    const tokenSymbol = readinessVenue.collateral.tokenSymbol ?? 'collateral';
    if (!ownerAddress || !tokenAddress || !spenderAddress || !chainId) {
      setTicketError(`${venueLabel} approval is missing token, spender, owner, or chain metadata. Refresh the route.`);
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    setTicketStatusMessage(approvalMethod === 'ERC1155_SET_APPROVAL_FOR_ALL'
      ? `Preparing ${venueLabel} share approval with Turnkey.`
      : `Preparing ${venueLabel} ${tokenSymbol} allowance approval with Turnkey.`);
    try {
      let activeWallets = turnkeyWallets;
      if (activeWallets.length === 0) {
        try {
          activeWallets = await refreshWallets();
        } catch (walletError) {
          if (!isTurnkeyMissingSessionError(walletError)) {
            throw walletError;
          }
          setTicketStatusMessage(`Reconnect your Turnkey wallet session to approve ${venueLabel} collateral.`);
          await handleLogin();
          activeWallets = await refreshWallets();
        }
      }
      const walletAccount = findTurnkeyWalletAccount(activeWallets, ownerAddress);
      if (!walletAccount) {
        throw new Error(`${venueLabel} approval needs your Turnkey EVM wallet ${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}, but it is not loaded in this session.`);
      }
      setTicketStatusMessage(approvalMethod === 'ERC1155_SET_APPROVAL_FOR_ALL'
        ? `Building a ${venueLabel} share approval transaction for Turnkey signing.`
        : `Building a ${venueLabel} ${tokenSymbol} approval transaction for Turnkey signing.`);
      const { unsignedTransaction, rpcUrl } = await buildUnsignedApprovalTransaction({
        chainId,
        ownerAddress,
        tokenAddress,
        spenderAddress,
        approvalMethod,
      });
      setTicketStatusMessage(approvalMethod === 'ERC1155_SET_APPROVAL_FOR_ALL'
        ? `Review and sign the ${venueLabel} share approval in Turnkey.`
        : `Review and sign the ${venueLabel} ${tokenSymbol} approval in Turnkey.`);
      const txHash = await signAndSendTransaction({
        organizationId: turnkeySession?.organizationId ?? session?.turnkeyOrganizationId,
        walletAccount,
        unsignedTransaction,
        transactionType: 'TRANSACTION_TYPE_ETHEREUM',
        rpcUrl,
      });
      const approvalLabel = approvalMethod === 'ERC1155_SET_APPROVAL_FOR_ALL' ? 'share approval' : `${tokenSymbol} approval`;
      setTicketStatusMessage(txHash
        ? `${venueLabel} ${approvalLabel} submitted (${txHash.slice(0, 6)}...${txHash.slice(-4)}). Refreshing route readiness.`
        : `${venueLabel} ${approvalLabel} submitted. Refreshing route readiness.`);
      setTicketQuote(null);
      setTicketQuoteAmount(null);
      setTicketSignatureBundle(null);
      setTicketExecutionId(null);
      setTicketLiveReadiness(null);
      await sleep(2_000);
      await previewMarketOrder();
    } catch (error) {
      const message = error instanceof Error ? error.message : `${venueLabel} collateral approval failed.`;
      setTicketError(/feature is not enabled/i.test(message)
        ? `Turnkey cannot sign this EVM approval yet. Enable Ethereum transaction signing for this Turnkey organization, then retry the ${venueLabel} approval.`
        : message);
    } finally {
      setTicketLoading(false);
    }
  }, [
    handleLogin,
    previewMarketOrder,
    refreshWallets,
    session?.turnkeyOrganizationId,
    signAndSendTransaction,
    ticketLiveReadiness,
    token,
    turnkeySession?.organizationId,
    turnkeyWallets,
  ]);

  const activatePolymarketFunds = useCallback(async () => {
    if (!token) {
      setTicketError('Log in before activating Polymarket funds.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    const sellTokenId = side === 'sell' ? ticketPolymarketTokenId : undefined;
    setTicketStatusMessage(sellTokenId
      ? 'Preparing Polymarket outcome-token approval for your Turnkey wallet.'
      : 'Preparing Polymarket pUSD approval for your Turnkey wallet.');
    try {
      const prepared = await preparePolymarketActivation(token, sellTokenId ? { tokenId: sellTokenId } : {});
      const activation = prepared.activation;
      let activeWallets = turnkeyWallets;
      if (activeWallets.length === 0) {
        try {
          activeWallets = await refreshWallets();
        } catch (walletError) {
          if (!isTurnkeyMissingSessionError(walletError)) {
            throw walletError;
          }
          setTicketStatusMessage('Reconnect your Turnkey wallet session to approve Polymarket trading.');
          await handleLogin();
          activeWallets = await refreshWallets();
        }
      }
      const signerAccount = findTurnkeyWalletAccount(activeWallets, activation.ownerAddress);
      if (!signerAccount) {
        throw new Error(`Polymarket activation needs your Turnkey EVM wallet ${activation.ownerAddress.slice(0, 6)}...${activation.ownerAddress.slice(-4)}, but it is not loaded in this session.`);
      }
      const organizationId = turnkeySession?.organizationId ?? session?.turnkeyOrganizationId;
      setTicketStatusMessage(activation.instructions?.[0] ?? 'Sign once to approve Polymarket pUSD trading spenders.');
      const signatureResult = await signMessage({
        message: eip712PayloadForTurnkey(activation.typedData),
        walletAccount: signerAccount,
        encoding: 'PAYLOAD_ENCODING_EIP712',
        hashFunction: 'HASH_FUNCTION_NO_OP',
        addEthereumPrefix: false,
        ...(organizationId ? { organizationId } : {}),
      });
      setTicketStatusMessage('Submitting Polymarket activation to Lotus.');
      const submitted = await submitPolymarketActivation(token, {
        ownerAddress: activation.ownerAddress,
        depositWalletAddress: activation.depositWalletAddress,
        nonce: activation.nonce,
        deadline: activation.deadline,
        calls: activation.calls,
        signature: signatureFromTurnkeyResult(signatureResult),
        ...(sellTokenId ? { tokenId: sellTokenId } : {}),
      });
      const relayerState = submitted.activation.relayerState ? ` State: ${submitted.activation.relayerState}.` : '';
      const relayerReference = submitted.activation.relayerTransactionId ? ` Relayer reference: ${submitted.activation.relayerTransactionId}.` : '';
      setTicketStatusMessage(sellTokenId
        ? `Polymarket share approval submitted. Lotus is polling CLOB sell readiness.${relayerState}${relayerReference}`
        : `Polymarket activation submitted. Lotus is polling CLOB allowance readiness.${relayerState}${relayerReference}`);
      setTicketLoading(false);
      setTicketActivationPolling(true);

      for (let attempt = 0; attempt < 30; attempt += 1) {
        const accountSnapshot = await getAccountSnapshot(token, { force: true });
        const nextActivations = accountSnapshot.activations ?? [];
        setFundingBalances((current) => mergeVenueBalanceSnapshots(current, accountSnapshot.balances ?? []));
        setFundingActivations(nextActivations);
        const polymarket = nextActivations.find((item) => toBackendVenueId(item.venue) === 'POLYMARKET');
        if (polymarketActivationConfirmed(polymarket)) {
          setTicketStatusMessage('Polymarket funds are active. Preview the route again before placing the market order.');
          setTicketQuote(null);
          setTicketQuoteAmount(null);
          setTicketLiveCandidates(null);
          return;
        }
        await sleep(4_000);
      }
      setTicketStatusMessage('Polymarket activation was submitted, but allowance is still pending. Lotus will keep checking during balance refresh.');
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Polymarket activation failed.');
    } finally {
      setTicketLoading(false);
      setTicketActivationPolling(false);
    }
  }, [handleLogin, refreshWallets, session?.turnkeyOrganizationId, side, signMessage, ticketPolymarketTokenId, token, turnkeySession?.organizationId, turnkeyWallets]);

  React.useEffect(() => {
    let cancelled = false;
    const loadFundingBalances = async () => {
      if (!token) {
        setFundingBalances([]);
        setFundingActivations([]);
        setFundingError(null);
        setFundingLoading(false);
        return;
      }
      setFundingLoading(true);
      setFundingError(null);
      try {
        const accountSnapshot = await getAccountSnapshot(token);
        if (!cancelled) {
          setFundingBalances((current) => mergeVenueBalanceSnapshots(current, accountSnapshot.balances ?? []));
          setFundingActivations(accountSnapshot.activations ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setFundingError(error instanceof Error ? error.message : 'Unable to load venue-ready balances.');
        }
      } finally {
        if (!cancelled) setFundingLoading(false);
      }
    };

    void loadFundingBalances();
    return () => {
      cancelled = true;
    };
  }, [token]);

  React.useEffect(() => {
    void refreshOutcomes();
    const interval = window.setInterval(() => {
      void refreshOutcomes();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshOutcomes]);

  React.useEffect(() => {
    let cancelled = false;
    const refreshOrderbook = async () => {
      const orderbookMarketId = selectedOutcomeMarketId ?? terminalMarketId;
      if (!orderbookMarketId) {
        setOrderbook(null);
        setOrderbookError(null);
        return;
      }
      setOrderbookLoading(true);
      setOrderbookError(null);
      try {
        const response = await getMarketOrderbook(orderbookMarketId, {
          outcomeId: selectedQuoteOutcomeId,
          depth: 20,
          venue: orderbookVenue === 'ALL' ? null : orderbookVenue
        });
        if (!cancelled) setOrderbook(response);
      } catch (error) {
        if (!cancelled) {
          setOrderbook(null);
          setOrderbookError(safeMarketDataError(error, 'orderbook'));
        }
      } finally {
        if (!cancelled) setOrderbookLoading(false);
      }
    };
    void refreshOrderbook();
    const interval = window.setInterval(() => {
      void refreshOrderbook();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [orderbookVenue, selectedOutcomeMarketId, selectedQuoteOutcomeId, terminalMarketId]);

  const refreshAccountData = useCallback(async () => {
    if (!token) {
      setPositions([]);
      setOpenOrders([]);
      setTradeHistory([]);
      setAccountError(null);
      return;
    }
    setAccountLoading(true);
    setAccountError(null);
    try {
      const positionsResponse = await getPositions(token, { limit: 100 });
      setPositions(positionsResponse.positions.filter((position) =>
        isOpenExecutionPosition(position) && matchesPositionMarket(position, terminalMarketId, null)
      ));
      if (bottomTab === 'Open Orders') {
        const openOrdersResponse = await getOpenOrders(token, { limit: 50 });
        setOpenOrders(openOrdersResponse.items.filter((order) => matchesTerminalMarket(order, terminalMarketId)));
      }
      if (bottomTab === 'Trade History') {
        const historyResponse = await getExecutionHistory(token, { limit: 50 });
        setTradeHistory(historyResponse.items.filter((item) => matchesTerminalMarket(item, terminalMarketId)));
      }
    } catch (error) {
      setAccountError(safeExecutionAccountError(error));
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

        const canonicalAssessments: ResolutionRiskAssessment[] = [];
        const selectedMarketAssessments: ResolutionRiskAssessment[] = [];
        const profiles: ResolutionRiskProfile[] = [];
        if (canonicalResult.status === 'fulfilled' && canonicalResult.value) {
          canonicalAssessments.push(...canonicalResult.value.assessments);
        }
        for (const result of profileResults) {
          if (result.status === 'fulfilled') {
            profiles.push(result.value.profile);
            selectedMarketAssessments.push(...result.value.assessments);
          }
        }
        const assessments = selectedMarketAssessments.length > 0 ? selectedMarketAssessments : canonicalAssessments;
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

  const ticketAmountValue = ticketAmountNumber(ticketAmount);
  const ticketHasExecutableQuote = Boolean(ticketQuote && ticketRoutePath.length > 0);
  const ticketHasFundingBlocker = !ticketHasExecutableQuote && (ticketLiveCandidates?.blocked ?? []).some((blocked) => {
    const reason = `${blocked.reason ?? ''} ${blocked.detailsCode ?? ''}`.toUpperCase();
    return reason.includes('FUND') || reason.includes('BALANCE') || reason.includes('DEPOSIT') || reason.includes('INSUFFICIENT');
  });
  const ticketSellApprovalRequired = side === 'sell' && Boolean(token) && ticketRouteUsesPolymarket && Boolean(ticketPolymarketTokenId) &&
    /ALLOWANCE|SPENDER|BALANCE|APPROVAL/i.test(ticketError ?? '');
  const ticketRouteApprovalVenue = ticketLiveReadiness?.venues.find((venue) =>
    venue.status === 'blocked' &&
    venue.blockers.some((blocker) => /ALLOWANCE|APPROVE|APPROVAL/i.test(blocker)) &&
    Boolean(venue.collateral.tokenAddress && venue.collateral.spenderAddress && venue.collateral.chainId && venue.account.ownerAddress)
  ) ?? null;
  const ticketRouteApprovalRequired = Boolean(token) && Boolean(ticketRouteApprovalVenue) &&
    /ALLOWANCE|APPROVAL|APPROVE/i.test(ticketError ?? '');
  const ticketRouteApprovalVenueLabel = ticketRouteApprovalVenue ? formatVenueLabel(ticketRouteApprovalVenue.venue) : 'Venue';
  const ticketRouteApprovalTokenLabel = ticketRouteApprovalVenue?.collateral.approvalMethod === 'ERC1155_SET_APPROVAL_FOR_ALL'
    ? 'shares'
    : ticketRouteApprovalVenue?.collateral.tokenSymbol ?? 'collateral';
  const ticketLiveReadinessBlocked = Boolean(ticketLiveReadiness?.venues.some((venue) => venue.status === 'blocked' && venue.blockers.length > 0));
  const ticketLimitlessBalanceBlocked = Boolean(ticketLiveReadiness?.venues.some((venue) =>
    venue.venue.toUpperCase() === 'LIMITLESS' &&
    venue.status === 'blocked' &&
    venue.blockers.some((blocker) => /BALANCE|TOTAL BID/i.test(blocker))
  ));
  const ticketLimitlessSetupRequired = Boolean(token) && /LIMITLESS/i.test(ticketError ?? '') &&
    /ACTIVE LINKED VENUE ACCOUNT|LINKED VENUE ACCOUNT|PROFILE|PROFILE_SETUP|PARTNER ACCOUNT|OWNERSHIP/i.test(ticketError ?? '');
  const ticketPredictFunAuthRequired = Boolean(token) && /PREDICT/i.test(ticketError ?? '') &&
    /AUTH JWT|USER AUTH|VENUE SETUP SIGNATURE|AUTH MESSAGE|JWT/i.test(ticketError ?? '');
  const ticketActivationRequired = Boolean(token) && (
    (side === 'buy' && polymarketActivationRequired && (ticketRouteUsesPolymarket || ticketHasFundingBlocker || venueReadyBalance <= 0)) ||
    ticketSellApprovalRequired
  );
  const ticketDepositRequired = side === 'buy' && Boolean(token) && ticketHasFundingBlocker && !ticketActivationRequired && !ticketLimitlessSetupRequired;
  const ticketFundingLabel = fundingLoading
    ? 'checking...'
    : fundingError
      ? 'unavailable'
      : polymarketClobSyncPending
        ? 'CLOB sync pending'
      : ticketActivationRequired
        ? 'activation required'
      : venueReadyBalance > 0
        ? formatUsdc(venueReadyBalance)
        : 'deposit required';
  const ticketAvailabilityLabel = side === 'sell'
    ? formatSignedShares(ticketSellableShares)
    : ticketFundingLabel;
  const ticketAvailabilityCopy = side === 'sell' ? 'Sellable shares' : 'Venue-ready balance';
  const ticketReceiveEstimate = side === 'buy'
    ? parsePositiveNumber(ticketQuote?.executableAmount) ?? ticketEstimatedShares
    : ticketAmountValue && ticketEffectivePrice
      ? ticketAmountValue * ticketEffectivePrice
      : null;
  const ticketRequiresSignature = Boolean(ticketQuote && (
    ticketQuote.requiredUserSignatureSteps.length > 0 ||
    ticketQuote.legs.some((leg) => leg.requiresUserSignature === true)
  ));
  const ticketEstimatedPayout = side === 'buy' ? ticketEstimatedShares : ticketReceiveEstimate;
  const ticketNeedsFundingAction = ticketActivationRequired || ticketDepositRequired || ticketLimitlessSetupRequired || ticketPredictFunAuthRequired || ticketRouteApprovalRequired || ticketLimitlessBalanceBlocked;
  const ticketActionDisabled = !token || !terminalMarketId || !selectedTicketOutcomeId || ticketLoading || ticketActivationPolling || polymarketClobSyncPending ||
    Boolean(ticketExecutionId && ticketQuote && !ticketRequiresSignature && !ticketNeedsFundingAction) ||
    Boolean(side === 'buy' && !ticketQuote && fundingLoading);
  const ticketActionLabel = ticketActivationPolling
    ? 'Confirming Polymarket readiness...'
    : ticketLoading
      ? ticketActivationRequired
        ? 'Preparing activation...'
        : ticketRouteApprovalRequired
          ? 'Preparing approval...'
        : ticketLimitlessSetupRequired
          ? 'Preparing Limitless activation...'
        : ticketPredictFunAuthRequired
          ? 'Refreshing Predict.fun auth...'
          : 'Checking live route...'
    : side === 'buy' && !ticketQuote && fundingLoading
      ? 'Checking balance...'
    : polymarketClobSyncPending
      ? 'Waiting for CLOB sync'
    : ticketActivationRequired
      ? side === 'sell' ? 'Approve Polymarket shares' : 'Activate Polymarket funds'
    : ticketRouteApprovalRequired
      ? `Approve ${ticketRouteApprovalVenueLabel} ${ticketRouteApprovalTokenLabel}`
    : ticketLimitlessBalanceBlocked
      ? 'Reduce amount or fund Limitless'
    : ticketLimitlessSetupRequired
      ? 'Activate Limitless account'
    : ticketPredictFunAuthRequired
      ? 'Refresh Predict.fun auth'
    : ticketDepositRequired
      ? 'Deposit to trade'
    : ticketLiveReadinessBlocked
      ? 'Execution blocked'
    : ticketRequiresSignature && !ticketSignatureBundle
      ? 'Prepare wallet signature'
    : ticketSignatureBundle
      ? 'Sign and submit'
    : ticketExecutionId && ticketQuote && ticketError
      ? 'Execution blocked'
    : ticketExecutionId && ticketQuote
      ? 'Order sent'
    : ticketQuote
      ? side === 'buy' ? 'Place market order' : 'Place sell order'
      : 'Preview market order';
  const ticketRouteReady = Boolean(ticketQuote && ticketRoutePath.length > 0);
  const ticketBlockedRoutes = ticketLiveCandidates?.blocked ?? [];
  const ticketAmountLabel = side === 'buy' ? 'Amount' : 'Shares to Sell';
  const ticketAmountUnit = side === 'buy' ? 'USDC' : 'Shares';
  const ticketReceiveLabel = side === 'buy' ? 'To Win' : 'To Receive';
  const ticketReceiveText = side === 'buy'
    ? formatUsdc(ticketEstimatedPayout)
    : formatTradeUsdc(ticketReceiveEstimate);
  const ticketPrimaryButtonClass = side === 'buy'
    ? 'bg-[#ccff00] hover:bg-[#b0dc00] text-black shadow-[0_0_15px_rgba(204,255,0,0.15)]'
    : 'bg-[#E52B50] hover:bg-[#ff3366] text-white shadow-[0_0_15px_rgba(229,43,80,0.15)]';
  const ticketPrimaryDisabledClass = ticketActionDisabled ? 'opacity-50 cursor-not-allowed hover:bg-zinc-700' : '';

  return (
    <>
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
                      <TerminalMarketThumb
                        title={terminalMarket.title}
                        icon={terminalMarket.icon}
                        imageUrl={terminalMarket.imageUrl}
                        iconUrl={terminalMarket.iconUrl}
                        className="h-9 w-9"
                      />
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
                                {terminalMarket.title}
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
                              <div className="mt-1 font-mono text-sm font-bold text-zinc-100">{terminalMarket.volume}</div>
                            </div>
                            <div className="rounded-xl border border-[#ccff00]/25 bg-[#ccff00]/10 p-3">
                              <div className="text-zinc-500">Best route</div>
                              <div className="mt-1 font-mono text-sm font-bold text-[#ccff00]">{selectorSummary.bestRoute}</div>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-[#121214] p-3">
                              <div className="text-zinc-500">Venues</div>
                              <div className="mt-1 font-mono text-sm font-bold text-zinc-100">{selectorSummary.venueCount} linked</div>
                            </div>
                          </div>
                        </div>
                        <div className="max-h-[420px] overflow-y-auto p-2 custom-scrollbar">
                          {selectorMarkets.map((market) => {
                            const marketKey = terminalMarketKey(market);
                            const isSelected = marketKey === terminalMarketKey(terminalMarket);
                            const selectorOutcomes = market.outcomes?.length
                              ? market.outcomes
                              : [{
                                id: market.marketId ?? market.id ?? marketKey,
                                marketId: market.marketId,
                                quoteOutcomeId: 'YES',
                                name: market.title,
                                prob: outcomePriceLabel(market, 'YES', market.priceLabel ?? 'Quote'),
                                venues: market.venues,
                                venueMarkets: market.venueMarkets,
                                marketType: market.marketType,
                                imageUrl: market.imageUrl,
                                iconUrl: market.iconUrl,
                                priceVenue: market.priceVenue,
                              }];
                            const selectSelectorOutcome = (
                              outcome: NonNullable<TerminalMarketSelection['outcomes']>[number],
                              side: TicketOutcomeSide,
                            ) => {
                              setMarketType(outcome.marketType ?? market.marketType ?? marketType);
                              setLocalSelectedMarket({
                                ...market,
                                id: outcome.marketId ?? market.id,
                                marketId: outcome.marketId ?? market.marketId,
                                eventId: outcome.eventId ?? market.eventId,
                                canonicalEventId: outcome.canonicalEventId ?? market.canonicalEventId,
                                venues: outcome.venues ?? market.venues,
                                venueMarkets: outcome.venueMarkets ?? market.venueMarkets,
                                marketType: outcome.marketType ?? market.marketType,
                                imageUrl: outcome.imageUrl ?? market.imageUrl,
                                iconUrl: outcome.iconUrl ?? market.iconUrl,
                                priceLabel: outcome.prob ?? market.priceLabel,
                                priceVenue: outcome.priceVenue ?? market.priceVenue,
                                outcomes: market.outcomes,
                                initialOutcomeId: outcome.id,
                                initialOutcomeSide: side,
                              });
                              setSelectedOutcomeId(outcome.id);
                              selectTicketOutcome(side, outcome.id);
                              setShowMarketSelector(false);
                            };
                            return (
                            <div
                              key={marketKey}
                              className={`group w-full rounded-xl border p-3 text-left transition-colors ${
                                isSelected
                                  ? 'border-[#ccff00]/35 bg-[#ccff00]/10'
                                  : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/70'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => selectSelectorOutcome(selectorOutcomes[0], 'yes')}
                                className="flex w-full items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                              >
                                <TerminalMarketThumb
                                  title={market.title}
                                  icon={market.icon}
                                  imageUrl={market.imageUrl}
                                  iconUrl={market.iconUrl}
                                  className="h-11 w-11 rounded-xl text-lg"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-zinc-100">{market.title}</span>
                                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                    <span>{market.category}</span>
                                    <span>/</span>
                                    <span className={market.change24hDirection === 'negative' ? 'text-red-400' : market.change24hDirection === 'pending' ? 'text-zinc-500' : 'text-emerald-400'}>
                                      {market.change24hLabel ?? market.changeLabel ?? 'Quote'}
                                    </span>
                                    <span>/</span>
                                    <span>{market.volume} volume</span>
                                    <span className="rounded-md border border-[#ccff00]/25 bg-[#ccff00]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ccff00]">
                                      {market.routeType} route
                                    </span>
                                  </span>
                                </span>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition-colors group-hover:border-zinc-700 group-hover:text-zinc-300">
                                  <BarChart2 className="h-4 w-4" />
                                </span>
                              </button>
                              <div className="mt-3 flex flex-col gap-2 pl-14">
                                {selectorOutcomes.slice(0, 6).map((outcome) => {
                                  const liveSelectorOutcome = isSelected
                                    ? terminalOutcomes.find((row) => row.id === outcome.id)
                                    : null;
                                  const yesLabel = outcome.prob && outcome.prob !== 'Quote'
                                    ? outcome.prob
                                    : liveSelectorOutcome?.yesPrice && liveSelectorOutcome.yesPrice !== 'Quote'
                                      ? liveSelectorOutcome.yesPrice
                                    : outcomePriceLabel(market, outcome.quoteOutcomeId ?? outcome.id, 'Quote');
                                  const noLabel = liveSelectorOutcome?.noPrice && liveSelectorOutcome.noPrice !== 'Quote'
                                    ? liveSelectorOutcome.noPrice
                                    : inverseOutcomePriceLabel(yesLabel);
                                  const outcomeVenues = outcome.venues ?? market.venues ?? [];
                                  const venueQuotes = liveSelectorOutcome?.venueQuotes ?? [];
                                  return (
                                    <div key={`${marketKey}-${outcome.id}`} className="rounded-lg border border-zinc-800/70 bg-zinc-950/35 px-2.5 py-2">
                                      <div className="mb-2 flex items-center justify-between gap-3">
                                        <div className="min-w-0 text-xs font-bold text-zinc-200">
                                          <span className="block truncate">{outcome.name}</span>
                                          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
                                            {outcomeVenues.slice(0, 4).map((venue) => (
                                              <VenueLogo
                                                key={`${marketKey}-${outcome.id}-${venue}`}
                                                id={normalizeVenueId(venue)}
                                                label={formatVenueLabel(venue)}
                                                className="h-3.5 w-3.5 rounded-full"
                                              />
                                            ))}
                                            {outcomeVenues.length > 0 ? `${outcomeVenues.length} venues` : 'Venue quotes load in terminal'}
                                          </span>
                                        </div>
                                        <span className="shrink-0 font-mono text-xs font-black text-zinc-100">{yesLabel}</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <button
                                          type="button"
                                          onClick={() => selectSelectorOutcome(outcome, 'yes')}
                                          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                        >
                                          Yes {yesLabel}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => selectSelectorOutcome(outcome, 'no')}
                                          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-xs font-bold text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                        >
                                          No {noLabel}
                                        </button>
                                      </div>
                                      {venueQuotes.length > 1 && (
                                        <div className="mt-2 flex flex-col gap-1.5 border-t border-zinc-800/70 pt-2">
                                          {venueQuotes.slice(0, 4).map((quote) => (
                                            <div key={`${marketKey}-${outcome.id}-${quote.venue}-selector`} className="flex items-center justify-between gap-2 rounded-md bg-[#09090b] px-2 py-1.5">
                                              <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-zinc-300">
                                                <VenueLogo id={normalizeVenueId(quote.venue)} label={formatVenueLabel(quote.venue)} className="h-3.5 w-3.5 rounded-full" />
                                                <span className="truncate">{formatVenueLabel(quote.venue)}</span>
                                              </span>
                                              <span className="flex shrink-0 items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => selectSelectorOutcome(outcome, 'yes')}
                                                  className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                                >
                                                  Yes {quote.yesPrice}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => selectSelectorOutcome(outcome, 'no')}
                                                  className="rounded bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                                >
                                                  No {quote.noPrice}
                                                </button>
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })}
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
               <LiveCanonicalChart
                 marketId={selectedOutcomeMarketId}
                 outcomeId={selectedQuoteOutcomeId}
                 marketType={marketType}
                 outcomes={terminalOutcomes}
               />
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
                                       <span className="font-semibold text-white">Spread: {formatBookPrice(orderbook?.spread)}</span>
                                       <span className="text-[10px] text-zinc-500">(Combined effective spread)</span>
                                   </div>
                               </div>
                               <div className="flex justify-between text-[11px] font-sans mb-1 text-zinc-300">
                                   <span>Best Bid: <span className="text-emerald-400 font-mono font-bold">{formatBookPrice(orderbook?.bestBid)}</span></span>
                                   <span>Best Ask: <span className="text-pink-400 font-mono font-bold">{formatBookPrice(orderbook?.bestAsk)}</span></span>
                               </div>
                               <div className="text-[11px] font-sans text-zinc-400">
                                   Status: <span className="font-mono text-zinc-300 font-bold">{orderbook?.status ?? 'pending'}</span>
                               </div>
                               
                               {/* Triangle pointer */}
                               <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-2 h-2 -mb-1 bg-zinc-900 border-t border-l border-zinc-700/50 rotate-45"></div>
                           </div>
                       </div>
                   </div>
                   <select
                     value={orderbookVenue}
                     onChange={(event) => setOrderbookVenue(event.target.value)}
                     className="bg-zinc-950 border border-zinc-700/50 rounded-md px-2 py-1.5 text-xs text-white outline-none cursor-pointer"
                   >
                       <option value="ALL">All Venues</option>
                       {orderbookVenueOptions.map((venue) => (
                         <option key={venue} value={venue}>{formatVenueLabel(venue)}</option>
                       ))}
                   </select>
               </div>
               <div className="flex justify-between px-4 py-2 bg-zinc-950/20 text-zinc-500 font-sans text-[10px] font-bold tracking-wider uppercase border-b border-zinc-800">
                   <span className="w-12">Price</span>
                   <span className="w-16">Venue</span>
                   <span className="w-20 text-right">Size</span>
                   <span className="w-24 text-right">Cum. USD</span>
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                   {orderbookLoading && !orderbook && (
                     <div className="px-4 py-6 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Loading live book</div>
                   )}
                   {orderbookError && (
                     <div className="mx-3 my-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">{orderbookError}</div>
                   )}
                   {!orderbookLoading && !orderbookError && orderbook && orderbook.asks.length === 0 && orderbook.bids.length === 0 && (
                     <div className="px-4 py-6 text-center text-[11px] font-semibold text-zinc-500">
                       No live depth returned for this outcome yet.
                     </div>
                   )}
                   {orderbook?.asks.slice().reverse().map((level, i) => (
                     <div key={`ask-${level.venue}-${level.price}-${i}`} className={`flex justify-between px-4 py-0.5 hover:bg-zinc-800/50 ${i === 0 ? 'mb-1' : ''} ${i < 3 ? 'bg-[#E52B50]/5' : ''}`}>
                       <span className="w-12 text-pink-500 font-bold">{formatBookPrice(level.price)}</span>
                       <span className="w-16 flex items-center gap-1.5 text-zinc-500 uppercase text-[9px] font-bold tracking-wider">
                         <VenueLogo id={normalizeVenueId(level.venue)} label={formatVenueLabel(level.venue)} className={tinyVenueClass} />
                         {formatVenueLabel(level.venue)}
                       </span>
                       <span className="w-20 text-right text-zinc-200">{formatBookSize(level.size)}</span>
                       <span className="w-24 text-right text-white font-bold">{formatBookNotional(level.cumulativeNotional)}</span>
                     </div>
                   ))}
                   {/* Asks (Sells) */}
                   {false && [...Array(10)].map((_, i) => {
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
                       <span className="font-mono">{formatBookPrice(orderbook?.spread)}</span>
                   </div>

                   {orderbook?.bids.map((level, i) => (
                     <div key={`bid-${level.venue}-${level.price}-${i}`} className={`flex justify-between px-4 py-0.5 hover:bg-zinc-800/50 ${i === 0 ? 'mt-1' : ''} ${i < 3 ? 'bg-[#ccff00]/5' : ''}`}>
                       <span className="w-12 text-emerald-400 font-bold">{formatBookPrice(level.price)}</span>
                       <span className="w-16 flex items-center gap-1.5 text-zinc-500 uppercase text-[9px] font-bold tracking-wider">
                         <VenueLogo id={normalizeVenueId(level.venue)} label={formatVenueLabel(level.venue)} className={tinyVenueClass} />
                         {formatVenueLabel(level.venue)}
                       </span>
                       <span className="w-20 text-right text-zinc-200">{formatBookSize(level.size)}</span>
                       <span className="w-24 text-right text-white font-bold">{formatBookNotional(level.cumulativeNotional)}</span>
                     </div>
                   ))}
                   {/* Bids (Buys) */}
                   {false && [...Array(10)].map((_, i) => {
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
                           const primaryVenue = m.primaryVenue ?? venues[0] ?? 'lotus';
                           const alternateVenueQuotes = m.venueQuotes.filter((quote) => quote.venue !== primaryVenue);
                           return (
                            <div key={m.id} className="rounded-xl">
                            <div
                              onClick={() => setSelectedOutcomeId(m.id)}
                              className={`px-5 py-2.5 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${(selectedOutcomeId ? selectedOutcomeId === m.id : m.active) ? 'border border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border border-transparent hover:border-zinc-800 hover:bg-zinc-900/30 bg-transparent'}`}
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
                                              selectTicketOutcome('yes', m.id);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A3A34] text-[#4ade80] text-xs font-bold hover:bg-[#204941] transition-colors"
                                          >
                                               <VenueLogo id={normalizeVenueId(primaryVenue)} label={formatVenueLabel(primaryVenue)} className="h-3.5 w-3.5 rounded-full" /> Yes {m.yesPrice}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedOutcomeId(m.id);
                                              selectTicketOutcome('no', m.id);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3F1D24] text-[#f87171] text-xs font-bold hover:bg-[#52252f] transition-colors"
                                          >
                                               <VenueLogo id={normalizeVenueId(primaryVenue)} label={formatVenueLabel(primaryVenue)} className="h-3.5 w-3.5 rounded-full" /> No {m.noPrice}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setExpandedOutcomeId((current) => current === m.id ? null : m.id);
                                            }}
                                            aria-label={`Open ${m.name} outcome details`}
                                            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                            aria-expanded={expandedOutcomeId === m.id}
                                          >
                                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedOutcomeId === m.id ? 'rotate-180' : ''}`} />
                                          </button>
                                     </div>
                                 </div>
                             </div>
                             {expandedOutcomeId === m.id && (
                               <div className="mx-5 mb-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                 <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Other venue prices</div>
                                 {alternateVenueQuotes.length > 0 ? (
                                   <div className="flex flex-col gap-2">
                                     {alternateVenueQuotes.map((quote) => (
                                       <div key={`${m.id}-${quote.venue}-quote`} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#0c0c0e] px-3 py-2">
                                         <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                                           <VenueLogo id={normalizeVenueId(quote.venue)} label={formatVenueLabel(quote.venue)} className="h-4 w-4 rounded-full" />
                                           {formatVenueLabel(quote.venue)}
                                           {quote.blocker && <span className="text-[10px] font-medium text-amber-300">{quote.blocker}</span>}
                                         </div>
                                         <div className="flex items-center gap-2">
                                           <button
                                             type="button"
                                             onClick={(event) => {
                                               event.stopPropagation();
                                               setSelectedOutcomeId(m.id);
                                               selectTicketOutcome('yes', m.id);
                                             }}
                                             className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A3A34] text-[#4ade80] text-xs font-bold hover:bg-[#204941] transition-colors"
                                           >
                                             <VenueLogo id={normalizeVenueId(quote.venue)} label={formatVenueLabel(quote.venue)} className="h-3.5 w-3.5 rounded-full" /> Yes {quote.yesPrice}
                                           </button>
                                           <button
                                             type="button"
                                             onClick={(event) => {
                                               event.stopPropagation();
                                               setSelectedOutcomeId(m.id);
                                               selectTicketOutcome('no', m.id);
                                             }}
                                             className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3F1D24] text-[#f87171] text-xs font-bold hover:bg-[#52252f] transition-colors"
                                           >
                                             <VenueLogo id={normalizeVenueId(quote.venue)} label={formatVenueLabel(quote.venue)} className="h-3.5 w-3.5 rounded-full" /> No {quote.noPrice}
                                           </button>
                                         </div>
                                       </div>
                                     ))}
                                   </div>
                                 ) : (
                                   <div className="text-xs font-medium text-zinc-500">No additional venue prices returned for this outcome.</div>
                                 )}
                               </div>
                             )}
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
                                                            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed max-w-3xl font-medium">
                                                                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                                                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Venue rule text</div>
                                                                  <div className="mt-2">{renderLinkedText(ruleTextForProfile(profile))}</div>
                                                                </div>
                                                                {profile.supplementalRulesText && profile.supplementalRulesText !== profile.primaryResolutionText && (
                                                                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
                                                                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Resolution source</div>
                                                                    <div className="mt-2">{renderLinkedText(profile.supplementalRulesText, 'text-zinc-400')}</div>
                                                                  </div>
                                                                )}
                                                                <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                                                                  <div><span className="text-zinc-500">Source type:</span> {sourceProviderForProfile(profile) ?? 'Not specified'}</div>
                                                                  <div><span className="text-zinc-500">Source market:</span> {sourceMarketForProfile(profile) ?? profile.oracleName ?? 'Not specified'}</div>
                                                                  <div><span className="text-zinc-500">Resolution method:</span> {formatSourceMethod(profile.oracleType)}</div>
                                                                  <div><span className="text-zinc-500">Resolution authority:</span> {profile.resolutionAuthorityType ?? 'Not specified'}</div>
                                                                  <div><span className="text-zinc-500">Outcome schema:</span> {describeOutcomeSchema(profile.outcomeSchema)}</div>
                                                                  <div><span className="text-zinc-500">Venue market:</span> {profile.venueMarketId}</div>
                                                                  {sourceUrlForProfile(profile) && (
                                                                    <div>
                                                                      <span className="text-zinc-500">Source link:</span>{' '}
                                                                      <a
                                                                        href={sourceUrlForProfile(profile) ?? undefined}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="font-semibold text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition-colors hover:text-sky-200"
                                                                      >
                                                                        Open source
                                                                      </a>
                                                                    </div>
                                                                  )}
                                                                </div>
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
                                                    <div className="space-y-4 text-sm text-zinc-300 leading-relaxed max-w-3xl">
                                                        {riskState.assessments.map((assessment, index) => (
                                                          <div key={`${assessment.label}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                                                            <div className="flex items-center justify-between gap-3">
                                                              <div>
                                                                <div className="font-bold text-zinc-100">Semantic rule comparison</div>
                                                                <div className="mt-1 text-xs text-zinc-500">{semanticComparisonSummary(riskState.profiles, assessment)}</div>
                                                              </div>
                                                              <div className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">{assessment.recommendedAction}</div>
                                                            </div>
                                                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                                              {riskFactorRows(assessment).length > 0 ? riskFactorRows(assessment).map((factor) => (
                                                                <div key={factor.name} className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                  <div className="flex items-center justify-between gap-2">
                                                                    <div className="text-xs font-bold text-zinc-200">{formatRiskFactorName(factor.name)}</div>
                                                                    <div className="text-[10px] font-mono text-zinc-500">
                                                                      score {factor.score ?? 'n/a'} / conf {factor.confidence ?? 'n/a'}
                                                                    </div>
                                                                  </div>
                                                                  <p className="mt-2 text-xs text-zinc-500">{factor.reason ?? 'No mismatch returned for this semantic factor.'}</p>
                                                                </div>
                                                              )) : (
                                                                <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3 md:col-span-2">
                                                                  <div className="text-xs font-bold text-zinc-200">Backend decision reason</div>
                                                                  <div className="mt-2 space-y-2 text-xs text-zinc-400">
                                                                    {assessment.shortReasons.length > 0
                                                                      ? assessment.shortReasons.map((reason) => <p key={reason}>{reason}</p>)
                                                                      : <p>Backend did not return explanatory reasons for this assessment.</p>}
                                                                  </div>
                                                                </div>
                                                              )}
                                                            </div>
                                                            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-400">
                                                              <span className="font-bold text-zinc-200">Aggregation decision:</span> {assessment.label}. Lotus should only aggregate when the venue rules are semantically compatible and the backend recommendation allows pooling.
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
                                                                {(primaryRiskFactors.length > 0 ? primaryRiskFactors.slice(0, 3).map((factor) => `${formatRiskFactorName(factor.name)}: ${factor.reason ?? 'compatible'}`) : primaryRiskAssessment.shortReasons.slice(0, 3)).map((reason) => (
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
                     <button type="button" onClick={() => switchTicketSide('buy')} className={`pb-1 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${side === 'buy' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Buy</button>
                     <button type="button" onClick={() => switchTicketSide('sell')} className={`pb-1 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${side === 'sell' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Sell</button>
                 </div>
                 <button type="button" disabled className="text-zinc-300 text-xs font-semibold flex items-center gap-1 pr-2 cursor-not-allowed" title="Limit orders are disabled for production until the backend limit-order contract is implemented.">
                     {orderType === 'market' ? 'Market' : 'Limit'} <Lock className="w-3.5 h-3.5 text-zinc-600" />
                 </button>
             </div>

              <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => selectTicketOutcome('yes')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'yes' ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-transparent border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'}`}>
                          YES {selectedTicketOutcome?.yesPrice ?? 'Quote'}
                      </button>
                      <button type="button" onClick={() => selectTicketOutcome('no')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'no' ? 'bg-[#E52B50] text-white hover:bg-[#ff3366]' : 'bg-transparent border border-red-500/30 text-red-500 hover:bg-red-500/10'}`}>
                          NO {selectedTicketOutcome?.noPrice ?? 'Quote'}
                      </button>
                  </div>

                  <div className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-3 relative group focus-within:border-zinc-700 transition-colors">
                      <div className="text-[10px] text-zinc-500 font-medium mb-1.5 flex justify-between">
                          <span>{ticketAmountLabel}</span>
                          {side === 'sell' && <span className="text-zinc-600">Verified positions only</span>}
                      </div>
                      <div className="flex items-center justify-between">
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={ticketAmountLabel}
                            className="bg-transparent border-none text-white text-2xl font-bold font-mono outline-none w-full"
                            placeholder="0"
                            value={ticketAmount}
                            onChange={(event) => {
                              setTicketAmount(event.target.value);
                              setTicketLiveCandidates(null);
                              setTicketQuote(null);
                              setTicketQuoteAmount(null);
                              setTicketExecutionId(null);
                              setTicketSignatureBundle(null);
                              setTicketStatusMessage(null);
                              setTicketError(null);
                            }}
                          />
                          <div className="text-[10px] text-zinc-500 whitespace-nowrap">{ticketAmountUnit}</div>
                      </div>
                  </div>

                  <div className="flex flex-col gap-2">
                      <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => setTicketAmountFromPercent(0.25)} className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-xs font-semibold transition-colors">25%</button>
                          <button type="button" onClick={() => setTicketAmountFromPercent(0.5)} className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-xs font-semibold transition-colors">50%</button>
                          <button type="button" onClick={() => setTicketAmountFromPercent(1)} className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded text-xs font-semibold transition-colors">{side === 'buy' ? 'MAX' : 'SELL ALL'}</button>
                      </div>
                      <div className="text-right text-[11px] text-zinc-500">
                          {ticketAvailabilityCopy}: <span className="font-bold text-white">{ticketAvailabilityLabel}</span>
                      </div>
                  </div>

                  <div className="flex flex-col gap-2">
                      {ticketQuote && (
                        <div
                          className={`flex justify-between items-center p-2.5 rounded-lg transition-colors ${ticketRouteReady ? 'bg-emerald-500/10 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20' : 'bg-zinc-900/70 border border-zinc-800'}`}
                          onClick={() => {
                            if (ticketRouteReady) setOrderAction(orderAction === 'preview' ? 'setup' : 'preview');
                          }}
                        >
                          <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${ticketRouteReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>
                              <span className={`text-[11px] font-bold tracking-wide uppercase ${ticketRouteReady ? 'text-emerald-400' : 'text-amber-300'}`}>
                                {ticketRouteReady ? 'Smart Route Ready' : 'Backend Quote Ready'}
                              </span>
                          </div>
                          <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                            {ticketRouteReady ? 'Preview Route' : 'No route path returned'}
                            {ticketRouteReady && <ChevronRight className={`w-3.5 h-3.5 transition-transform ${orderAction === 'preview' ? 'translate-x-1' : ''}`}/>}
                          </span>
                        </div>
                      )}

                      {ticketError && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
                          {ticketError}
                        </div>
                      )}
                      {ticketStatusMessage && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-200">
                          {ticketStatusMessage}{ticketExecutionId ? ` ${ticketExecutionId}` : ''}
                        </div>
                      )}
                      {ticketBlockedRoutes.slice(0, 3).map((blocked) => (
                        <div key={`${blocked.venue}-${blocked.venueMarketId ?? blocked.reason}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[10px] font-semibold text-zinc-400">
                          {formatVenueLabel(blocked.venue)} unavailable: {readableQuoteBlocker(blocked.reason) ?? blocked.reason}
                        </div>
                      ))}
                      {ticketSignatureBundle && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-100">
                          <div className="flex items-center justify-between gap-2">
                            <span>Wallet signature required</span>
                            <span className="font-mono text-amber-200">{ticketSignatureBundle.signatureRequests.length} request(s)</span>
                          </div>
                          <div className="mt-1 text-amber-200/80">
                            Expires {new Date(ticketSignatureBundle.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Turnkey will sign the CLOB order before Lotus submits it to the venue.
                          </div>
                        </div>
                      )}

                      {orderAction === 'preview' && ticketRouteReady && ticketQuote && (
                          <div className="bg-[#0c0c0e] border border-emerald-500/20 rounded-lg p-3 animate-in slide-in-from-top-2 duration-300 space-y-3 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                                  <div className="flex items-center gap-1.5">
                                     <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                     <span className="text-[10px] font-bold text-zinc-300 tracking-wide">Backend Route Check: Live</span>
                                  </div>
                                  <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest font-mono font-bold">
                                    {ticketQuote.routeType}
                                  </span>
                              </div>
                              <div className="flex items-center gap-1 font-mono text-[9px] overflow-x-auto custom-scrollbar pb-1">
                                  {ticketQuote.legs.map((leg, index) => (
                                    <React.Fragment key={`${leg.venue}-${leg.venueMarketId ?? index}`}>
                                      {index > 0 && (
                                        <div className="flex items-center justify-center text-zinc-600">
                                          <ChevronRight className="w-3 h-3" />
                                        </div>
                                      )}
                                      <div className="min-w-[95px] flex-1 bg-[#121214] border border-zinc-800 rounded p-1.5 text-center flex flex-col justify-center">
                                        <div className="text-zinc-500 w-max mx-auto mb-0.5 text-[8px] tracking-wider uppercase font-sans font-bold">Leg {index + 1}</div>
                                        <div className="flex items-center justify-center gap-1 text-emerald-400 font-bold tracking-tighter">
                                          <VenueLogo id={normalizeVenueId(leg.venue)} label={formatVenueLabel(leg.venue)} className="h-3 w-3 rounded-full" />
                                          {formatVenueLabel(leg.venue)}
                                        </div>
                                        <div className="text-zinc-400 mt-1 pb-0.5 border-b border-zinc-800 border-dashed w-max mx-auto text-[10px]">
                                          {formatProbabilityPrice(leg.price)}
                                        </div>
                                        <div className="text-zinc-500 mt-1 text-[9px]">{routeLegShareLabel(leg)}</div>
                                      </div>
                                    </React.Fragment>
                                  ))}
                              </div>
                              {(typeof ticketQuote.estimatedSavings === 'number' || ticketShareImprovement) && (
                                <div className="bg-[#ccff00]/10 border border-[#ccff00]/20 rounded p-1.5 text-center flex items-center justify-center gap-1.5">
                                   {typeof ticketQuote.estimatedSavings === 'number' && (
                                     <span className="text-[#ccff00] font-bold text-[10px]">Estimated savings: {formatUsdc(ticketQuote.estimatedSavings)}</span>
                                   )}
                                   {ticketShareImprovement && (
                                     <span className="text-zinc-300 text-[9px]">Share improvement: +{formatSignedShares(ticketShareImprovement)}</span>
                                   )}
                                </div>
                              )}
                          </div>
                      )}
                  </div>

                  <div className="h-px bg-zinc-800/80 -mx-4 my-0.5"></div>

                  <div className="flex justify-between items-center px-1">
                      <div className="flex flex-col gap-0.5">
                          <div className="relative flex items-center gap-1 text-[11px] font-bold text-zinc-300 group/info">
                              {ticketReceiveLabel}: <Info className="w-3.5 h-3.5 text-zinc-500" />
                              <div className="pointer-events-none absolute left-0 top-5 z-30 hidden w-64 rounded-lg border border-zinc-700 bg-[#0c0c0e] p-3 text-[10px] font-semibold text-zinc-300 shadow-2xl group-hover/info:block">
                                <div>Amount: {side === 'buy' ? formatUsdc(ticketAmountValue) : formatSignedShares(ticketAmountValue)}</div>
                                <div>Trading Fee: {summarizeExpectedFees(ticketQuote)}</div>
                                <div>Expected Avg. Price: {formatProbabilityPrice(ticketEffectivePrice)}</div>
                                <div>Price Cap: {formatProbabilityPrice(ticketQuote?.expectedPrice ?? ticketEffectivePrice)}</div>
                                {side === 'buy' && <div>Expected Shares: {formatSignedShares(ticketEstimatedShares)}</div>}
                                <div>Min. Receive: {side === 'buy' ? formatSignedShares(ticketEstimatedShares) : formatUsdc(ticketReceiveEstimate)}</div>
                                {ticketShareImprovement && <div>Share improvement: +{formatSignedShares(ticketShareImprovement)}</div>}
                              </div>
                          </div>
                          <div className="text-[10px] font-medium text-zinc-500">Avg. Price: {formatProbabilityPrice(ticketEffectivePrice)}</div>
                      </div>
                      <div className={`font-mono text-xl font-black flex items-baseline gap-1 ${side === 'buy' ? 'text-emerald-500' : 'text-[#E52B50]'}`}>
                          {ticketReceiveText}
                      </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (ticketActivationRequired) {
                        void activatePolymarketFunds();
                      } else if (ticketRouteApprovalRequired) {
                        void approveRouteCollateral();
                      } else if (ticketLimitlessBalanceBlocked) {
                        setTicketStatusMessage('Lower the order amount or add Base USDC to your Limitless wallet, then preview the route again.');
                      } else if (ticketLimitlessSetupRequired) {
                        void activateLimitlessAccount();
                      } else if (ticketPredictFunAuthRequired) {
                        void refreshPredictFunAuth();
                      } else if (ticketDepositRequired) {
                        setFundingModalOpen(true);
                      } else if (ticketRequiresSignature && !ticketSignatureBundle) {
                        void prepareTicketSignature();
                      } else if (ticketSignatureBundle && ticketExecutionId) {
                        void signAndSubmitTicketSignature(ticketSignatureBundle, ticketExecutionId);
                      } else if (ticketQuote) {
                        void submitMarketOrder();
                      } else {
                        void previewMarketOrder();
                      }
                    }}
                    disabled={ticketActionDisabled}
                    className={`w-full font-bold py-3.5 rounded-lg text-sm transition-colors mt-2 ${ticketPrimaryButtonClass} ${ticketPrimaryDisabledClass}`}
                  >
                      {ticketActionLabel}
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                      <button type="button" disabled className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[10px] uppercase font-bold transition-all bg-[#0c0c0e] border-zinc-800 text-zinc-500 cursor-not-allowed">
                          <Ghost className="w-3 h-3" /> BACKEND PROTECTION
                      </button>
                      <button type="button" disabled className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[10px] uppercase font-bold transition-all bg-[#0c0c0e] border-zinc-800 text-zinc-500 cursor-not-allowed">
                          <Zap className="w-3 h-3" /> ROUTE CONTROLLED
                      </button>
                  </div>
              </div>
              {false && (side === 'buy' ? (
                 <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300">
                     <div className="grid grid-cols-2 gap-3">
                         <button type="button" onClick={() => selectTicketOutcome('yes')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'yes' ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-transparent border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'}`}>
                             YES {selectedTicketOutcome?.yesPrice ?? 'Quote'}
                         </button>
                         <button type="button" onClick={() => selectTicketOutcome('no')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'no' ? 'bg-[#E52B50] text-white hover:bg-[#ff3366]' : 'bg-transparent border border-red-500/30 text-red-500 hover:bg-red-500/10'}`}>
                             NO {selectedTicketOutcome?.noPrice ?? 'Quote'}
                         </button>
                     </div>

                     <div className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-3 relative group focus-within:border-zinc-700 transition-colors">
                         <div className="text-[10px] text-zinc-500 font-medium mb-1.5">Shares</div>
                         <div className="flex items-center justify-between">
                             <input
                               type="text"
                               inputMode="decimal"
                               aria-label="Share amount"
                               className="bg-transparent border-none text-white text-2xl font-bold font-mono outline-none w-full"
                               placeholder="0"
                               value={ticketAmount}
                               onChange={(event) => {
                                 setTicketAmount(event.target.value);
                                 setTicketLiveCandidates(null);
                                 setTicketQuote(null);
                                 setTicketQuoteAmount(null);
                                 setTicketExecutionId(null);
                                 setTicketStatusMessage(null);
                               }}
                             />
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
                             Venue-ready balance: <span className="font-bold text-white">checked on quote</span>
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
             ))}
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
                         <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Position Value</p>
                         <div className="mt-1 font-mono text-2xl font-black text-emerald-400">{positionVenueRows.length ? formatTerminalCurrency(totalPositionValue) : 'No position'}</div>
                     </div>
                     <div className="text-right">
                         <p className="text-[10px] font-semibold text-zinc-500">{totalVerifiedSize > 0 ? `${formatCompactMetric(totalVerifiedSize)} verified` : 'Verified fills only'}</p>
                         <p className={`mt-1 text-[10px] font-semibold ${totalPositionPnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                           {positionVenueRows.length ? `${totalPositionPnl >= 0 ? '+' : '-'}${formatTerminalCurrency(Math.abs(totalPositionPnl))}` : 'Avg entry pending'}
                         </p>
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
                                 <p className={`font-mono text-sm font-black ${row.pnlTone}`}>{formatTerminalCurrency(row.value)}</p>
                                 <p className="text-[10px] text-zinc-500">{row.avgEntry} → {row.mark}</p>
                             </div>
                         </div>
                     </div>
                 ))}
             </div>

             <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2 text-[10px] leading-relaxed text-zinc-500">
                 Positions appear after verified fills. Value uses the current live outcome price when available and falls back to verified entry price.
             </div>
         </div>



      </div>
      </div>

    </div>
    {fundingModalOpen && createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Deposit venue-ready funds"
        className="fixed left-0 top-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-black/60 px-4 py-6 backdrop-blur-md"
      >
        <button
          type="button"
          aria-label="Close funding modal"
          onClick={() => setFundingModalOpen(false)}
          className="absolute inset-0 cursor-default"
        />
        <div className="relative z-10 w-full max-w-[400px]">
          <FundingDeposit initialMode="deposit" modal onClose={() => setFundingModalOpen(false)} session={session} />
        </div>
      </div>,
      document.body
    )}
    </>
  );
};
