import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Lock, ShieldAlert, ShieldCheck, Info,
  Clock, BarChart2, Layers, Bookmark, Search, Maximize2, Activity, Zap, Ghost,
  Home, Terminal, PieChart, Volleyball, Settings
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { useTurnkey, type Wallet as TurnkeyWallet, type WalletAccount } from '@turnkey/react-wallet-kit';
import { JsonRpcProvider, Transaction } from 'ethers';
import { CryptoLogo, VenueLogo, resolveTopicAssetLogoId } from '@/components/icons/asset-logo';
import { LotusLogo } from '@/components/icons/lotus-icons';
import { FundingDeposit } from '@/design/mockups/FundingDeposit';
import { env, lotusMarketDiagnosticsEnabled } from '@/config/env';
import type { AuthSession } from '@/features/auth/types';
import {
  getAccountSnapshot,
  mergeVenueBalanceSnapshots,
  preparePolymarketActivation,
  preparePolymarketClobSync,
  submitPolymarketActivation,
  submitPolymarketClobSync,
  type PolymarketClobSyncPreparation,
  type PolymarketClobSyncSubmission,
  type VenueActivation,
  type VenueBalance,
} from '@/features/funding/api/funding-api';
import {
  getCanonicalResolutionRisk,
  getMarketChart,
  getMarketLivePrices,
  getMarketOrderbook,
  getMarketOutcomes,
  getVenueMarketResolutionRisk,
  type MarketChartResponse,
  type MarketChartTimeframe,
  type MarketCatalogVenueMarket,
  type MarketLivePriceItem,
  type MarketOrderbookLevel,
  type MarketOrderbookResponse,
  type MarketOrderbookStreamPayload,
  type MarketOrderbookStreamLevel,
  type MarketOrderbookVenue,
  type ResolutionRiskAssessment,
  type ResolutionRiskProfile,
} from '@/features/markets/api/market-api';
import {
  createExecutionQuote,
  getExecutionHistory,
  getExecutionOrderStatus,
  getLiveCandidates,
  getLiveReadiness,
  getOpenOrders,
  getPositions,
  placeExecutionOrder,
  prepareExitQuote,
  prepareSignatures,
  previewExecutionOrder,
  submitExecutionOrderSignatures,
  submitSignedBundle,
  submitExecutionQuote,
  type ExecutionOrderResponse,
  type ExecutionOrderSignedPayload,
  type ExecutionOrderSignatureRequest,
  type ExecutionOrderVenuePreference,
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
import { openExecutionSocket, type ExecutionTopic, type ExecutionWsState } from '@/lib/ws/execution-ws-client';

const ORDERBOOK_DISPLAY_REST_FALLBACK_DELAY_MS = 6_000;
const ORDERBOOK_REST_RECOVERY_MIN_INTERVAL_MS = 45_000;
const ORDERBOOK_STREAM_GAP_RECOVERY_DELAY_MS = 1_500;
const TERMINAL_CHART_REFRESH_INTERVAL_MS = 60_000;
const TERMINAL_ACCOUNT_REFRESH_INTERVAL_MS = 30_000;
const TERMINAL_ALL_OUTCOME_PRICE_REFRESH_INTERVAL_MS = 8_000;
const TERMINAL_FULL_OUTCOME_REFRESH_INTERVAL_MS = 120_000;
const TERMINAL_LIVE_PRICE_BATCH_SIZE = 80;

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

const isOpinionEnableTradingRequest = (
  request: VenueSetupSignatureRequest,
): request is VenueSetupSignatureRequest & { typedData: Record<string, unknown>; safeTxHash: string } =>
  request.venue.toUpperCase() === 'OPINION' &&
  request.requestType === 'OPINION_ENABLE_TRADING_SAFE_TX' &&
  typeof request.signer === 'string' &&
  request.signer.length > 0 &&
  typeof request.safeTxHash === 'string' &&
  request.safeTxHash.length > 0 &&
  Boolean(request.typedData && typeof request.typedData === 'object' && !Array.isArray(request.typedData));

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const clobSyncSignedPayload = (
  sync: PolymarketClobSyncPreparation,
  signature: string
): PolymarketClobSyncSubmission['signedPayload'] => ({
  ...recordValue(sync.signedPayloadHint),
  purpose: 'POLYMARKET_CLOB_AUTH',
  signer: sync.signer,
  account: sync.account,
  signature,
  typedData: sync.typedData,
}) as PolymarketClobSyncSubmission['signedPayload'];

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
  canonicalMarketIds?: string[];
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
    canonicalMarketIds?: string[];
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
  canonicalMarketIds: string[];
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

type OutcomeChartInput = {
  id: string;
  marketId: string | null;
  quoteOutcomeId: string;
  label: string;
  key: string;
  color: string;
  latestValue: number | null;
};

type OutcomeChartEntry = Omit<OutcomeChartInput, "latestValue"> & {
  chart: MarketChartResponse;
};

type ResolutionRuleFallback = {
  key: string;
  venue: string;
  venueMarketId: string;
  venueMarketIds: string[];
  venueMarketCount: number;
  venueTitle: string;
  marketClass: string;
  outcomes: string;
  resolutionRulesText: string | null;
  resolutionSource: string | null;
  resolutionTitle: string | null;
  sourceUrl: string | null;
  expiresAt: string | null;
  resolvesAt: string | null;
};

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

const slippageTolerancePercentToBps = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(0, Math.min(500, Math.round(parsed * 100)));
};

const isOpenExecutionPosition = (position: { verifiedSize?: string | number | null }) =>
  (parsePositiveNumber(position.verifiedSize) ?? 0) > 0;

const parseProbabilityLabel = (value: string | null | undefined): number | null => {
  if (!value || value === 'Quote') return null;
  const hasDisplayUnit = /[%c¢]/i.test(value) || value.includes('Â');
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return hasDisplayUnit || parsed > 1 ? parsed / 100 : parsed;
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

const uniqueNonEmptyStrings = (values: readonly (string | null | undefined)[]): string[] =>
  [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];

const canonicalIdsForTerminalOutcome = (
  primaryMarketId: string | null | undefined,
  explicitIds: readonly string[] | null | undefined,
  marketIds: readonly string[] | null | undefined,
  outcomeCount = 1,
): string[] => {
  const explicit = uniqueNonEmptyStrings(explicitIds ?? []);
  if (explicit.length > 0) return explicit;
  const primary = uniqueNonEmptyStrings([primaryMarketId]);
  if (outcomeCount > 1 && primary.length > 0) return primary;
  return uniqueNonEmptyStrings([...(marketIds ?? []), ...primary]);
};

const terminalOutcomeMatchesMarketAlias = (
  outcome: TerminalOutcomeRow,
  marketId: string | null | undefined,
  fallbackMarketId: string | null | undefined,
): boolean => {
  if (!marketId) return true;
  const aliases = new Set(canonicalIdsForTerminalOutcome(
    outcome.marketId ?? fallbackMarketId,
    outcome.canonicalMarketIds,
    [],
    1,
  ));
  return aliases.has(marketId);
};

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

const displayPriceLabel = (label: string | null | undefined, diagnosticsEnabled = lotusMarketDiagnosticsEnabled()): string => {
  const normalized = typeof label === 'string' ? label.trim() : '';
  if (!normalized || normalized === 'Quote' || normalized === 'Unavailable') return diagnosticsEnabled ? 'Quote' : '-';
  return normalized;
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
  if (http?.[1] === '429') return 'Venue quote provider rate limited';
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
  const rawMediaUrl = imageUrl ?? iconUrl;
  React.useEffect(() => setFailed(false), [rawMediaUrl]);
  const mediaUrl = !failed ? rawMediaUrl : null;
  const topicLogoId = resolveTopicAssetLogoId(title);
  const useTopicFallback = Boolean(topicLogoId) || icon === 'L' || !icon;

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
      ) : useTopicFallback ? (
        <CryptoLogo
          id={topicLogoId ?? title}
          label={title}
          className="h-full w-full rounded-full"
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

const scaleVenueOrderbookDisplayValue = (
  venue: string,
  value: string | number | null | undefined
): string | null => {
  const parsed = orderbookNumericValue(value);
  if (parsed === null) return null;
  if (toBackendVenueId(venue) === 'LIMITLESS' && Math.abs(parsed) >= 1_000_000) {
    return String(parsed / 1_000_000);
  }
  return String(parsed);
};

const formatBookLevelSize = (level: MarketOrderbookLevel): string =>
  formatBookSize(scaleVenueOrderbookDisplayValue(level.venue, level.size));

const formatBookLevelNotional = (level: MarketOrderbookLevel): string =>
  formatBookNotional(scaleVenueOrderbookDisplayValue(level.venue, level.cumulativeNotional));

const orderbookNumberString = (value: string | number | null | undefined): string | null => {
  if (value === null || typeof value === 'undefined') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return String(value);
};

const orderbookNumericValue = (value: string | number | null | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeStreamBlocker = (blocker: unknown): string | null => {
  if (typeof blocker === 'string') return readableQuoteBlocker(blocker) ?? blocker;
  if (!blocker || typeof blocker !== 'object') return null;
  const record = blocker as Record<string, unknown>;
  const reason = [record.reason, record.message, record.detailsCode, record.code].find((value) => typeof value === 'string');
  return typeof reason === 'string' ? readableQuoteBlocker(reason) ?? reason : null;
};

const normalizeStreamResponseBlockers = (
  payload: MarketOrderbookStreamPayload
): MarketOrderbookResponse['blockers'] => (payload.blockers ?? [])
  .reduce<MarketOrderbookResponse['blockers']>((items, blocker) => {
    const reason = normalizeStreamBlocker(blocker);
    if (!reason) return items;
    const record = blocker && typeof blocker === 'object' ? blocker as Record<string, unknown> : {};
    items.push({
      venue: typeof record.venue === 'string' ? record.venue : payload.venue ?? 'UNKNOWN',
      reason,
      venueMarketId: typeof record.venueMarketId === 'string' ? record.venueMarketId : payload.venueMarketId ?? undefined,
      venueOutcomeId: typeof record.venueOutcomeId === 'string' ? record.venueOutcomeId : payload.venueOutcomeId ?? undefined,
      detailsCode: typeof record.detailsCode === 'string' ? record.detailsCode : undefined,
    });
    return items;
  }, []);

const streamPayloadMarketId = (payload: MarketOrderbookStreamPayload): string | null =>
  payload.canonicalMarketId ?? payload.marketId ?? null;

const streamPayloadOutcomeId = (payload: MarketOrderbookStreamPayload): string | null =>
  payload.canonicalOutcomeId ?? payload.outcomeId ?? null;

const isOrderbookInitialSnapshotPayload = (payload: unknown): payload is Partial<MarketOrderbookResponse> & MarketOrderbookStreamPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return record.source === 'initial_snapshot' || (Array.isArray(record.venues) && Array.isArray(record.bids) && Array.isArray(record.asks));
};

const normalizeOrderbookInitialSnapshot = (
  payload: Partial<MarketOrderbookResponse> & MarketOrderbookStreamPayload,
  current: MarketOrderbookResponse | null,
  expectedMarketId: string,
  expectedOutcomeId: string | null,
): MarketOrderbookResponse => {
  const marketId = streamPayloadMarketId(payload) ?? expectedMarketId;
  const outcomeId = streamPayloadOutcomeId(payload) ?? expectedOutcomeId;
  return {
    marketId,
    outcomeId: outcomeId && outcomeId !== '_' ? outcomeId : null,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString(),
    depth: typeof payload.depth === 'number' ? payload.depth : current?.depth ?? 20,
    venues: Array.isArray(payload.venues) ? payload.venues : current?.venues ?? [],
    bids: Array.isArray(payload.bids) ? payload.bids : current?.bids ?? [],
    asks: Array.isArray(payload.asks) ? payload.asks : current?.asks ?? [],
    bestBid: orderbookNumberString(payload.bestBid) ?? current?.bestBid ?? null,
    bestAsk: orderbookNumberString(payload.bestAsk) ?? current?.bestAsk ?? null,
    midpoint: orderbookNumberString(payload.midpoint) ?? current?.midpoint ?? null,
    spread: orderbookNumberString(payload.spread) ?? current?.spread ?? null,
    status: payload.status === 'partial' || payload.status === 'stale' || payload.status === 'blocked' || payload.status === 'unavailable' || payload.status === 'live'
      ? payload.status
      : current?.status ?? 'live',
    blockers: Array.isArray(payload.blockers) ? payload.blockers as MarketOrderbookResponse['blockers'] : current?.blockers ?? [],
    stream: payload.stream ?? current?.stream ?? null,
  };
};

const normalizeStreamLevel = (
  level: MarketOrderbookStreamLevel,
  payload: MarketOrderbookStreamPayload
): MarketOrderbookLevel | null => {
  const price = orderbookNumberString(level.price);
  const size = orderbookNumberString(level.size);
  if (!price || !size) return null;
  const priceNumber = orderbookNumericValue(price) ?? 0;
  const sizeNumber = orderbookNumericValue(size) ?? 0;
  return {
    venue: level.venue ?? payload.venue ?? 'UNKNOWN',
    venueMarketId: level.venueMarketId ?? payload.venueMarketId ?? '',
    venueOutcomeId: typeof level.venueOutcomeId !== 'undefined' ? level.venueOutcomeId : payload.venueOutcomeId ?? null,
    price,
    size,
    cumulativeSize: orderbookNumberString(level.cumulativeSize) ?? size,
    cumulativeNotional: orderbookNumberString(level.cumulativeNotional) ?? String(priceNumber * sizeNumber),
  };
};

const sortAndCumulativeLevels = (
  levels: MarketOrderbookLevel[],
  side: 'bid' | 'ask',
  depth: number
): MarketOrderbookLevel[] => {
  let cumulativeSize = 0;
  let cumulativeNotional = 0;
  return [...levels]
    .sort((left, right) => {
      const leftPrice = orderbookNumericValue(left.price) ?? 0;
      const rightPrice = orderbookNumericValue(right.price) ?? 0;
      return side === 'bid' ? rightPrice - leftPrice : leftPrice - rightPrice;
    })
    .slice(0, depth)
    .map((level) => {
      const price = orderbookNumericValue(level.price) ?? 0;
      const size = orderbookNumericValue(level.size) ?? 0;
      cumulativeSize += size;
      cumulativeNotional += price * size;
      return {
        ...level,
        cumulativeSize: String(cumulativeSize),
        cumulativeNotional: String(cumulativeNotional),
      };
    });
};

const bookStats = (bids: MarketOrderbookLevel[], asks: MarketOrderbookLevel[]) => {
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const bid = orderbookNumericValue(bestBid);
  const ask = orderbookNumericValue(bestAsk);
  return {
    bestBid,
    bestAsk,
    midpoint: bid !== null && ask !== null ? String((bid + ask) / 2) : null,
    spread: bid !== null && ask !== null ? String(Math.max(ask - bid, 0)) : null,
  };
};

const depthTotal = (levels: MarketOrderbookLevel[]): string =>
  String(levels.reduce((sum, level) => sum + (orderbookNumericValue(level.size) ?? 0), 0));

const normalizeStreamVenueBook = (
  payload: MarketOrderbookStreamPayload,
  receivedAt: string,
  depth: number
): MarketOrderbookVenue => {
  const bids = sortAndCumulativeLevels((payload.bids ?? []).map((level) => normalizeStreamLevel(level, payload)).filter(Boolean) as MarketOrderbookLevel[], 'bid', depth);
  const asks = sortAndCumulativeLevels((payload.asks ?? []).map((level) => normalizeStreamLevel(level, payload)).filter(Boolean) as MarketOrderbookLevel[], 'ask', depth);
  const stats = bookStats(bids, asks);
  const freshnessMs = typeof payload.freshnessMs === 'number' && Number.isFinite(payload.freshnessMs) ? payload.freshnessMs : null;
  return {
    venue: payload.venue ?? 'UNKNOWN',
    venueMarketId: payload.venueMarketId ?? '',
    venueOutcomeId: payload.venueOutcomeId ?? null,
    source: 'STREAM',
    quoteQuality: payload.quoteQuality ?? payload.snapshotStatus ?? 'stream',
    sourceTimestamp: freshnessMs !== null ? new Date(Date.now() - freshnessMs).toISOString() : null,
    receivedAt,
    bestBid: orderbookNumberString(payload.bestBid) ?? stats.bestBid,
    bestAsk: orderbookNumberString(payload.bestAsk) ?? stats.bestAsk,
    midpoint: stats.midpoint,
    spread: stats.spread,
    bidDepth: orderbookNumberString(payload.bidSize) ?? depthTotal(bids),
    askDepth: orderbookNumberString(payload.askSize) ?? depthTotal(asks),
    blockers: (payload.blockers ?? []).map(normalizeStreamBlocker).filter((blocker): blocker is string => Boolean(blocker)),
    bids,
    asks,
  };
};

const applyStreamLevelDeltas = (
  existingLevels: MarketOrderbookLevel[],
  deltas: MarketOrderbookStreamLevel[] | undefined,
  payload: MarketOrderbookStreamPayload,
  side: 'bid' | 'ask',
  depth: number
): MarketOrderbookStreamLevel[] => {
  if (!deltas || deltas.length === 0) {
    return existingLevels.map((level) => ({
      venue: level.venue,
      venueMarketId: level.venueMarketId,
      venueOutcomeId: level.venueOutcomeId,
      price: level.price,
      size: level.size,
    }));
  }
  const byPrice = new Map<string, MarketOrderbookStreamLevel>();
  for (const level of existingLevels) {
    byPrice.set(level.price, {
      venue: level.venue,
      venueMarketId: level.venueMarketId,
      venueOutcomeId: level.venueOutcomeId,
      price: level.price,
      size: level.size,
    });
  }
  for (const delta of deltas) {
    const price = orderbookNumberString(delta.price);
    const size = orderbookNumberString(delta.size);
    if (!price || !size) continue;
    const sizeNumber = orderbookNumericValue(size);
    if (sizeNumber !== null && sizeNumber <= 0) {
      byPrice.delete(price);
      continue;
    }
    byPrice.set(price, {
      ...delta,
      venue: delta.venue ?? payload.venue,
      venueMarketId: delta.venueMarketId ?? payload.venueMarketId ?? undefined,
      venueOutcomeId: typeof delta.venueOutcomeId !== 'undefined' ? delta.venueOutcomeId : payload.venueOutcomeId ?? null,
      price,
      size,
    });
  }
  return sortAndCumulativeLevels(
    [...byPrice.values()].map((level) => normalizeStreamLevel(level, payload)).filter(Boolean) as MarketOrderbookLevel[],
    side,
    depth
  ).map((level) => ({
    venue: level.venue,
    venueMarketId: level.venueMarketId,
    venueOutcomeId: level.venueOutcomeId,
    price: level.price,
    size: level.size,
  }));
};

const expandOrderbookDeltaPayload = (
  current: MarketOrderbookResponse | null,
  payload: MarketOrderbookStreamPayload,
  depth: number
): MarketOrderbookStreamPayload => {
  if (
    payload.updateType !== 'delta' ||
    (!payload.bidDeltas && !payload.askDeltas) ||
    payload.bids ||
    payload.asks
  ) {
    return payload;
  }
  const payloadVenue = payload.venue ? toBackendVenueId(payload.venue) : null;
  const existingVenue = payloadVenue
    ? current?.venues.find((venue) => toBackendVenueId(venue.venue) === payloadVenue)
    : null;
  return {
    ...payload,
    bids: applyStreamLevelDeltas(existingVenue?.bids ?? [], payload.bidDeltas, payload, 'bid', depth),
    asks: applyStreamLevelDeltas(existingVenue?.asks ?? [], payload.askDeltas, payload, 'ask', depth),
  };
};

const orderbookStatusFromSnapshot = (
  snapshotStatus: MarketOrderbookStreamPayload['snapshotStatus'],
  hasLevels: boolean,
  hasOtherLiveVenues: boolean
): MarketOrderbookResponse['status'] => {
  if (snapshotStatus === 'blocked') return hasOtherLiveVenues ? 'partial' : 'unavailable';
  if (snapshotStatus === 'stale' || snapshotStatus === 'resyncing') return hasLevels ? 'stale' : 'unavailable';
  return hasLevels ? 'live' : 'unavailable';
};

const mergeOrderbookStreamUpdate = (
  current: MarketOrderbookResponse | null,
  payload: MarketOrderbookStreamPayload,
  depth = 20
): MarketOrderbookResponse => {
  const receivedAt = new Date().toISOString();
  const effectiveDepth = current?.depth ?? depth;
  const expandedPayload = expandOrderbookDeltaPayload(current, payload, effectiveDepth);
  const venueBook = normalizeStreamVenueBook(expandedPayload, receivedAt, effectiveDepth);
  const sameVenue = (venue: MarketOrderbookVenue) =>
    toBackendVenueId(venue.venue) === toBackendVenueId(venueBook.venue);
  const existingVenues = current?.venues ?? [];
  const venues = [...existingVenues.filter((venue) => !sameVenue(venue)), venueBook];
  const activeVenues = venues.filter((venue) => venue.blockers.length === 0 && (venue.bids.length > 0 || venue.asks.length > 0));
  const bids = sortAndCumulativeLevels(
    activeVenues.flatMap((venue) => venue.bids),
    'bid',
    current?.depth ?? depth
  );
  const asks = sortAndCumulativeLevels(
    activeVenues.flatMap((venue) => venue.asks),
    'ask',
    current?.depth ?? depth
  );
  const stats = bookStats(bids, asks);
  const streamBlockers = normalizeStreamResponseBlockers(expandedPayload);
  const payloadVenue = expandedPayload.venue ?? 'UNKNOWN';
  const blockers = [
    ...(current?.blockers ?? []).filter((blocker) => toBackendVenueId(blocker.venue) !== toBackendVenueId(payloadVenue)),
    ...streamBlockers,
  ];
  const hasLevels = bids.length > 0 || asks.length > 0;
  const marketId = streamPayloadMarketId(expandedPayload) ?? current?.marketId ?? '';
  const outcomeId = streamPayloadOutcomeId(expandedPayload);
  return {
    marketId,
    outcomeId: outcomeId && outcomeId !== '_' ? outcomeId : null,
    generatedAt: receivedAt,
    depth: current?.depth ?? depth,
    venues,
    bids,
    asks,
    bestBid: stats.bestBid,
    bestAsk: stats.bestAsk,
    midpoint: stats.midpoint,
    spread: stats.spread,
    status: orderbookStatusFromSnapshot(expandedPayload.snapshotStatus, hasLevels, activeVenues.length > 0),
    blockers,
  };
};

const orderbookChecksumHex = async (value: string): Promise<string | null> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const orderbookChecksumLevels = (levels: MarketOrderbookLevel[] | undefined) =>
  (levels ?? []).slice(0, 5).map((level) => ({
    price: level.price,
    size: level.size,
  }));

const streamChecksumBlockers = (payload: MarketOrderbookStreamPayload): string[] =>
  (payload.blockers ?? [])
    .map((blocker) => {
      if (typeof blocker === 'string') return blocker;
      if (!blocker || typeof blocker !== 'object') return null;
      const record = blocker as Record<string, unknown>;
      const value = [record.reason, record.message, record.detailsCode, record.code].find((item) => typeof item === 'string');
      return typeof value === 'string' ? value : null;
    })
    .filter((value): value is string => Boolean(value))
    .sort();

const validateOrderbookStreamChecksum = async (
  orderbook: MarketOrderbookResponse,
  payload: MarketOrderbookStreamPayload,
  expectedMarketId: string,
  expectedOutcomeId: string | null
): Promise<boolean> => {
  if (!payload.checksum || !payload.venue) return true;
  const backendVenue = toBackendVenueId(payload.venue);
  const venueBook = orderbook.venues.find((venue) => toBackendVenueId(venue.venue) === backendVenue);
  if (!venueBook) return true;
  const checksumOutcome = typeof payload.canonicalOutcomeId !== 'undefined'
    ? payload.canonicalOutcomeId
    : typeof payload.outcomeId !== 'undefined'
      ? payload.outcomeId
      : expectedOutcomeId;
  const body = JSON.stringify({
    market: streamPayloadMarketId(payload) ?? expectedMarketId,
    outcome: checksumOutcome ?? null,
    venue: backendVenue,
    bestBid: venueBook.bestBid ?? null,
    bestAsk: venueBook.bestAsk ?? null,
    bids: orderbookChecksumLevels(venueBook.bids),
    asks: orderbookChecksumLevels(venueBook.asks),
    blockers: streamChecksumBlockers(payload),
  });
  const hex = await orderbookChecksumHex(body);
  if (!hex) return true;
  return hex.slice(0, 16) === payload.checksum;
};

const filterOrderbookForVenue = (
  orderbook: MarketOrderbookResponse | null,
  selectedVenue: string,
): MarketOrderbookResponse | null => {
  if (!orderbook || selectedVenue === 'ALL') return orderbook;
  const backendVenue = toBackendVenueId(selectedVenue);
  const venues = orderbook.venues.filter((venue) => toBackendVenueId(venue.venue) === backendVenue);
  const activeVenues = venues.filter((venue) => venue.blockers.length === 0 && (venue.bids.length > 0 || venue.asks.length > 0));
  const bids = sortAndCumulativeLevels(activeVenues.flatMap((venue) => venue.bids), 'bid', orderbook.depth);
  const asks = sortAndCumulativeLevels(activeVenues.flatMap((venue) => venue.asks), 'ask', orderbook.depth);
  const stats = bookStats(bids, asks);
  const hasLevels = bids.length > 0 || asks.length > 0;
  return {
    ...orderbook,
    venues,
    bids,
    asks,
    bestBid: stats.bestBid,
    bestAsk: stats.bestAsk,
    midpoint: stats.midpoint,
    spread: stats.spread,
    status: hasLevels ? 'live' : 'unavailable',
    blockers: orderbook.blockers.filter((blocker) => toBackendVenueId(blocker.venue) === backendVenue),
  };
};

const isMarketOrderbookStreamPayload = (payload: unknown): payload is MarketOrderbookStreamPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  const hasMarketId = typeof record.canonicalMarketId === 'string' || typeof record.marketId === 'string';
  const isInitialSnapshot = isOrderbookInitialSnapshotPayload(payload);
  return isInitialSnapshot || (hasMarketId && typeof record.venue === 'string');
};

const normalizeStreamOutcomeId = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed === '_') return null;
  return trimmed.toUpperCase();
};

const streamOutcomeMatches = (streamOutcomeId: string | null | undefined, selectedOutcomeId: string | null | undefined): boolean => {
  const normalizedStream = normalizeStreamOutcomeId(streamOutcomeId);
  const normalizedSelected = normalizeStreamOutcomeId(selectedOutcomeId);
  if (!normalizedStream || !normalizedSelected) return true;
  return normalizedStream === normalizedSelected;
};

const streamFreshnessLabel = (freshnessMs: number | null | undefined): string | null => {
  if (typeof freshnessMs !== 'number' || !Number.isFinite(freshnessMs)) return null;
  if (freshnessMs < 1_000) return '<1s old';
  if (freshnessMs < 60_000) return `${Math.round(freshnessMs / 1_000)}s old`;
  return `${Math.round(freshnessMs / 60_000)}m old`;
};

const streamStatusLabel = (
  status: MarketOrderbookStreamPayload['snapshotStatus'] | undefined,
  diagnosticsEnabled = lotusMarketDiagnosticsEnabled()
): string => {
  if (status === undefined) return diagnosticsEnabled ? 'Pending' : 'Updating';
  if (!diagnosticsEnabled && status !== undefined && status !== 'live') return 'Updating';
  if (status === 'stale') return 'Stale';
  if (status === 'resyncing') return 'Updating';
  if (status === 'blocked') return 'Venue unavailable';
  return 'Live';
};

const streamStatusClass = (
  status: MarketOrderbookStreamPayload['snapshotStatus'] | undefined,
  diagnosticsEnabled = lotusMarketDiagnosticsEnabled()
): string => {
  if (status === undefined) return 'border-blue-500/40 bg-blue-500/10 text-blue-200';
  if (!diagnosticsEnabled && status !== undefined && status !== 'live') return 'border-blue-500/40 bg-blue-500/10 text-blue-200';
  if (status === 'blocked') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (status === 'stale') return 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300';
  if (status === 'resyncing') return 'border-blue-500/40 bg-blue-500/10 text-blue-200';
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
};

const normalizeOrderbookStreamTopics = (topics: unknown): ExecutionTopic[] =>
  Array.isArray(topics)
    ? topics.filter((topic): topic is ExecutionTopic => typeof topic === 'string' && topic.startsWith('markets:orderbook:'))
    : [];

const encodeOrderbookTopicPart = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const orderbookTopicForSelection = (marketId: string, outcomeId: string | null | undefined): ExecutionTopic =>
  `markets:orderbook:${encodeOrderbookTopicPart(marketId)}:${encodeOrderbookTopicPart(outcomeId && outcomeId !== '_' ? outcomeId : '_')}` as ExecutionTopic;

const uniqueOrderbookTopics = (topics: readonly ExecutionTopic[]): ExecutionTopic[] => [...new Set(topics)];

const mergeOrderbookStreamTopics = (...topicGroups: readonly ExecutionTopic[][]): ExecutionTopic[] =>
  uniqueOrderbookTopics(topicGroups.flat());

const sameTopicList = (left: ExecutionTopic[], right: ExecutionTopic[]): boolean =>
  left.length === right.length && left.every((topic) => right.includes(topic));

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

const polymarketBalanceConfirmsTradeReadiness = (balance: VenueBalance): boolean => {
  if (toBackendVenueId(balance.venue) !== 'POLYMARKET') return false;
  if (venueReadyBalanceAmount(balance) <= 0) return false;
  const readinessReason = String(balance.readinessReason ?? '').toUpperCase();
  const balanceSource = String(balance.balanceSource ?? '').toUpperCase();
  const usableSource = String(balance.usableBalanceSource ?? '').toUpperCase();
  return readinessReason === 'POLYMARKET_CLOB_COLLATERAL_CONFIRMED' ||
    balanceSource === 'POLYMARKET_CLOB_SYNC_CONFIRMED' ||
    usableSource === 'USER_CLOB_SYNC_CONFIRMED' ||
    usableSource === 'CLOB_COLLATERAL_ALLOWANCE';
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

const sellableSharesForPositions = (
  positions: readonly ExecutionPosition[],
  marketId: string | null,
  outcomeId: string | null
): number => positions
  .filter((position) => matchesPositionMarket(position, marketId, outcomeId))
  .reduce((sum, position) => {
    const sellable = parseFiniteNumber(position.sellableSize);
    if (sellable !== null) {
      return sum + Math.max(0, sellable);
    }
    const verified = parsePositiveNumber(position.verifiedSize) ?? 0;
    return sum + verified;
  }, 0);

const activeTerminalPositions = (
  positions: readonly ExecutionPosition[],
  marketId: string | null
): ExecutionPosition[] => positions.filter((position) =>
  isOpenExecutionPosition(position) && matchesPositionMarket(position, marketId, null)
);

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

const apiErrorCode = (error: unknown): string | null =>
  error instanceof ApiClientError && typeof error.code === 'string' ? error.code : null;

const isApiNotFound = (error: unknown, code: string): boolean =>
  error instanceof ApiClientError && error.status === 404 && apiErrorCode(error) === code;

const isApiNotFoundStatus = (error: unknown): boolean =>
  error instanceof ApiClientError && error.status === 404;

const isReadinessVenueBlocked = (venue: LiveSubmitReadinessSnapshot['venues'][number] | null | undefined): boolean =>
  Boolean(venue && venue.status === 'blocked' && venue.blockers.length > 0);

const isReadinessBlocked = (readiness: LiveSubmitReadinessSnapshot | null): boolean =>
  Boolean(readiness && (
    readiness.status !== 'fresh' ||
    readiness.venues.some((venue) => venue.status !== 'fresh' || venue.blockers.length > 0)
  ));

const POLYMARKET_PENDING_SUBMIT_READINESS_CODE = 'POLYMARKET_CLOB_SYNC_PENDING_FOR_SUBMIT';
const POLYMARKET_LIVE_READINESS_POLL_MS = 5_000;

const findPolymarketReadinessVenue = (readiness: LiveSubmitReadinessSnapshot | null) =>
  readiness?.venues.find((item) => toBackendVenueId(item.venue) === 'POLYMARKET') ?? null;

const firstReadinessBlocker = (readiness: LiveSubmitReadinessSnapshot | null): { venue: string; blocker: string } | null => {
  const venue = readiness?.venues.find((item) => isReadinessVenueBlocked(item));
  if (venue) return { venue: venue.venue, blocker: venue.blockers[0] ?? 'Live submit readiness is blocked.' };
  const stale = readiness?.venues.find((item) => item.status !== 'fresh');
  if (stale) return { venue: stale.venue, blocker: stale.blockers[0] ?? 'Live submit readiness is stale. Refresh balances and preview the route again.' };
  const blocker = readiness?.blockers[0];
  return blocker ? { venue: 'Venue', blocker } : readiness && readiness.status !== 'fresh'
    ? { venue: 'Venue', blocker: 'Live submit readiness is stale. Refresh balances and preview the route again.' }
    : null;
};

const isPolymarketClobPropagationReadiness = (readiness: LiveSubmitReadinessSnapshot | null): boolean => {
  if (polymarketReadinessConfirmsTradeReadiness(readiness)) return false;
  const venue = findPolymarketReadinessVenue(readiness);
  if (!venue) return false;
  const readinessCode = String(venue.readinessCode ?? '').toUpperCase();
  if (readinessCode === POLYMARKET_PENDING_SUBMIT_READINESS_CODE) return true;
  const blockerText = venue.blockers.join(' ').toUpperCase();
  const source = String(venue.collateral.usableBalanceSource ?? '').toUpperCase();
  return source === 'USER_CLOB_SYNC_CONFIRMED' ||
    /SYNC WAS CONFIRMED LOCALLY|LIVE CLOB SPENDABLE|SYNC PROPAGAT|PROPAGATION/.test(blockerText);
};

const isPolymarketSellShareBalanceBlocked = (readiness: LiveSubmitReadinessSnapshot | null): boolean => {
  const venue = findPolymarketReadinessVenue(readiness);
  if (!venue || !isReadinessVenueBlocked(venue)) return false;
  const blockerText = venue.blockers.join(' ').toUpperCase();
  const tokenSymbol = String(venue.collateral.tokenSymbol ?? '').toUpperCase();
  const balance = parseFiniteNumber(venue.collateral.balance ?? undefined);
  return /SHARE BALANCE|SELLABLE BALANCE|BELOW THE SELL AMOUNT/.test(blockerText) ||
    (tokenSymbol.includes('SHARE') && balance !== null && balance <= 0);
};

const polymarketReadinessConfirmsTradeReadiness = (readiness: LiveSubmitReadinessSnapshot | null): boolean => {
  if (!readiness || readiness.status !== 'fresh' || readiness.blockers.length > 0) return false;
  const venue = findPolymarketReadinessVenue(readiness);
  if (!venue || venue.status !== 'fresh' || venue.blockers.length > 0) return false;
  const source = String(venue.collateral.usableBalanceSource ?? '').toUpperCase();
  return source === 'CLOB_COLLATERAL_ALLOWANCE' || source === 'USER_CLOB_SYNC_CONFIRMED';
};

const formatReadinessTime = (value: string | number | null | undefined): string => {
  if (!value) return 'pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'pending';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const shouldLoadVenueRiskProfile = (marketId: string): boolean => {
  const normalized = marketId.trim().toUpperCase();
  return normalized.length > 0 &&
    !normalized.includes('|') &&
    !normalized.startsWith('FRONTEND_CURATED:');
};

const executionFailureMessage = (submitted: ExecutionStatus): string => {
  const failedLeg = submitted.submittedLegs?.find((leg) => leg.reasonCode || leg.reason);
  if (failedLeg?.reasonCode === 'POLYMARKET_CLOB_SYNC_REJECTED_BY_VENUE') {
    return 'Polymarket rejected this order even though live CLOB readiness was confirmed. Lotus will recheck automatically; retry after Polymarket propagation completes.';
  }
  if (failedLeg?.reasonCode === 'POLYMARKET_CLOB_SYNC_PENDING_FOR_SUBMIT') {
    return 'Polymarket CLOB sync is confirmed locally, but live submit readiness is still propagating. Lotus will keep checking automatically; no new sync is required.';
  }
  return failedLeg?.reason ? `Execution failed: ${failedLeg.reason}` : 'Execution failed after backend submit.';
};

const primaryExecutionLeg = (execution: ExecutionStatus) => execution.submittedLegs?.[0] ?? null;

const executionSettlementStatusCode = (execution: ExecutionStatus): string => {
  const legStatuses = execution.submittedLegs
    ?.map((leg) => String(leg.settlementState?.status ?? '').toUpperCase())
    .filter(Boolean) ?? [];

  if (legStatuses.includes('GHOST_FILL_CONFIRMED')) return 'GHOST_FILL_CONFIRMED';
  if (legStatuses.includes('GHOST_FILL_SUSPECTED')) return 'GHOST_FILL_SUSPECTED';
  if (legStatuses.includes('SETTLEMENT_TIMEOUT')) return 'SETTLEMENT_TIMEOUT';
  if (legStatuses.includes('SETTLEMENT_UNKNOWN')) return 'SETTLEMENT_UNKNOWN';
  if (legStatuses.length > 0 && legStatuses.every((status) =>
    status === 'SETTLEMENT_VERIFIED' || status === 'NOT_APPLICABLE' || status === 'DRY_RUN_ONLY')) {
    if (legStatuses.includes('SETTLEMENT_VERIFIED')) return 'SETTLEMENT_VERIFIED';
    if (legStatuses.every((status) => status === 'DRY_RUN_ONLY')) return 'DRY_RUN_ONLY';
    return 'NOT_APPLICABLE';
  }

  return String(execution.settlementStatus ?? 'SETTLEMENT_PENDING').toUpperCase();
};

const executionSettlementStatusLabel = (execution: ExecutionStatus): string => {
  switch (executionSettlementStatusCode(execution)) {
    case 'SETTLEMENT_VERIFIED':
      return 'Verified';
    case 'GHOST_FILL_CONFIRMED':
      return 'Verified after recovery';
    case 'GHOST_FILL_SUSPECTED':
      return 'Under review';
    case 'SETTLEMENT_TIMEOUT':
      return 'Needs review';
    case 'SETTLEMENT_UNKNOWN':
      return 'Unknown';
    case 'NOT_APPLICABLE':
      return 'Not required';
    case 'DRY_RUN_ONLY':
      return 'Dry run';
    case 'SETTLEMENT_PENDING':
    default:
      return 'Pending';
  }
};

const executionLegStatusSummary = (execution: ExecutionStatus): { title: string; detail: string; tone: 'neutral' | 'success' | 'warning' | 'danger' } => {
  const leg = primaryExecutionLeg(execution);
  if (!leg) {
    return { title: execution.userStatus ?? execution.status ?? 'Submitted', detail: 'Tracking execution status.', tone: 'neutral' };
  }
  if (leg.reason || leg.reasonCode || String(leg.status).toUpperCase() === 'FAILED') {
    return { title: 'Failed', detail: leg.reason ?? leg.reasonCode ?? 'Venue submit failed.', tone: 'danger' };
  }
  const venue = formatVenueLabel(leg.venue);
  const legStatus = String(leg.status ?? '').toUpperCase();
  const fillStatus = String(leg.fillState?.status ?? '').toUpperCase();
  const settlementStatus = String(leg.settlementState?.status ?? '').toUpperCase();
  const filledSize = parseFiniteNumber(leg.fillState?.filledSize);
  const filledLabel = filledSize !== null && filledSize > 0
    ? `${formatCompactMetric(filledSize) ?? leg.fillState?.filledSize} filled`
    : '0 filled';
  if (settlementStatus === 'SETTLEMENT_VERIFIED' || execution.userStatus === 'FILLED' || execution.status === 'FILLED') {
    return { title: 'Filled', detail: `${venue} fill verified.`, tone: 'success' };
  }
  if (fillStatus === 'FILLED') {
    return { title: 'Fill observed', detail: `${filledLabel}; waiting for verified settlement.`, tone: 'warning' };
  }
  if (fillStatus === 'PARTIAL_FILL' || legStatus === 'PARTIAL_FILL' || execution.userStatus === 'PARTIAL') {
    return { title: 'Partial fill', detail: `${filledLabel}; tracking remaining size.`, tone: 'warning' };
  }
  if (leg.fillId || leg.venueOrderId || fillStatus === 'OPEN' || legStatus === 'OPEN' || legStatus === 'SUBMITTED') {
    return { title: 'Waiting for venue fill', detail: `${venue} accepted the order; ${filledLabel} so far.`, tone: 'neutral' };
  }
  return { title: legStatus || 'Submitted', detail: 'Tracking execution status.', tone: 'neutral' };
};

const executionSubmitStatusMessage = (submitted: ExecutionStatus): string => {
  const submittedStatus = (submitted.status ?? submitted.userStatus ?? 'SUBMITTED').toUpperCase();
  if (submittedStatus === 'FILLED') return 'Market order filled.';
  if (submittedStatus === 'PARTIAL') return 'Market order partially filled. Tracking remaining size.';
  const summary = executionLegStatusSummary(submitted);
  if (summary.title === 'Waiting for venue fill') {
    return 'Order submitted to the venue. Waiting for fill confirmation.';
  }
  if (summary.title === 'Fill observed') {
    return 'Venue fill observed. Waiting for verified settlement before updating positions.';
  }
  return 'Market order submitted. Tracking execution status.';
};

const executionOrderBlockerMessage = (order: ExecutionOrderResponse | null): string | null => {
  const blocker = order?.blockers?.[0];
  if (typeof blocker === 'string') return blocker;
  if (blocker && typeof blocker === 'object') {
    const message = blocker.message ?? blocker.reason ?? blocker.code;
    return blocker.venue && message ? `${formatVenueLabel(blocker.venue)}: ${message}` : message ?? null;
  }
  const lastError = order?.lastError;
  if (typeof lastError === 'string') return lastError;
  if (lastError && typeof lastError === 'object') return lastError.message ?? lastError.code ?? null;
  return null;
};

const executionOrderStatusMessage = (order: ExecutionOrderResponse): string => {
  const blocker = executionOrderBlockerMessage(order);
  switch (order.state) {
    case 'READY_TO_PLACE':
      return 'Live market route ready. Review the venue and price before placing the order.';
    case 'NEEDS_SIGNATURE':
      return 'Wallet signature is required. Turnkey will open to sign this order.';
    case 'NEEDS_VENUE_SETUP':
      return blocker ?? 'Enable this venue before placing the order.';
    case 'WAITING_FOR_VENUE_READY':
      return blocker ?? 'Waiting for venue readiness. Lotus will keep checking automatically.';
    case 'BLOCKED_ACTION_REQUIRED':
      return blocker ?? 'Action is required before this order can be placed.';
    case 'SUBMITTING':
      return 'Submitting order through Lotus backend.';
    case 'SUBMITTED':
      return 'Order submitted. Tracking venue fill status.';
    case 'FILLED':
      return 'Order filled.';
    case 'FAILED':
      return blocker ?? 'Order failed.';
    case 'EXPIRED':
      return order.canAutoRenew
        ? 'Route expired. Refreshing route automatically.'
        : 'Route expired. Refresh the route before placing the order.';
    default:
      return blocker ?? 'Order status updated.';
  }
};

const executionOrderPollDelayMs = (order: ExecutionOrderResponse): number => {
  if (order.nextPollAt) {
    const nextMs = new Date(order.nextPollAt).getTime();
    if (Number.isFinite(nextMs)) return Math.max(750, Math.min(15_000, nextMs - Date.now()));
  }
  if (order.state === 'WAITING_FOR_VENUE_READY') return 5_000;
  if (order.state === 'SUBMITTING' || order.state === 'SUBMITTED') return 2_500;
  return 3_000;
};

const isExecutionOrderPollingState = (state: ExecutionOrderResponse['state']): boolean =>
  state === 'WAITING_FOR_VENUE_READY' || state === 'SUBMITTING' || state === 'SUBMITTED';

const isExecutionOrderTerminalState = (state: ExecutionOrderResponse['state']): boolean =>
  state === 'SUBMITTED' || state === 'FILLED' || state === 'FAILED';

const stringArrayField = (value: unknown, field: string): string[] => {
  const source = recordValue(value)[field];
  return Array.isArray(source) ? source.filter((item): item is string => typeof item === 'string') : [];
};

const numericField = (value: unknown, fields: string[]): number | null => {
  const source = recordValue(value);
  for (const field of fields) {
    const candidate = source[field];
    const parsed = typeof candidate === 'string' || typeof candidate === 'number' || candidate === null || candidate === undefined
      ? parseFiniteNumber(candidate)
      : null;
    if (parsed !== null) return parsed;
  }
  return null;
};

const textField = (value: unknown, fields: string[]): string | null => {
  const source = recordValue(value);
  for (const field of fields) {
    const candidate = source[field];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
};

type ExecutionOrderRouteLegSummary = {
  venue: string;
  price: number | null;
  size: string | null;
};

const arrayField = (value: unknown, fields: string[]): unknown[] => {
  const source = recordValue(value);
  for (const field of fields) {
    const candidate = source[field];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
};

const routeLegsFromExecutionOrder = (order: ExecutionOrderResponse | null): ExecutionOrderRouteLegSummary[] => {
  const fallbackPrice = orderEffectivePrice(order);
  const fallbackSize = orderReceiveAmount(order);
  const rawLegs = arrayField(order?.routeSummary, ['legs', 'routeLegs', 'venueLegs', 'path', 'venues']);
  const objectLegs = rawLegs
    .map((item) => {
      if (typeof item === 'string') {
        return { venue: item, price: fallbackPrice, size: fallbackSize };
      }
      const source = recordValue(item);
      const venue = textField(source, ['venue', 'venueId', 'name', 'selectedVenue']);
      if (!venue) return null;
      return {
        venue,
        price: numericField(source, ['price', 'effectivePrice', 'averagePrice', 'avgPrice', 'expectedPrice']) ?? fallbackPrice,
        size: textField(source, ['size', 'amount', 'executableAmount', 'shares', 'quantity']) ?? fallbackSize,
      };
    })
    .filter((item): item is ExecutionOrderRouteLegSummary => Boolean(item));
  if (objectLegs.length > 0) return objectLegs;

  const routePath = routePathFromExecutionOrder(order);
  const price = orderEffectivePrice(order);
  const size = orderReceiveAmount(order);
  return routePath.map((venue) => ({ venue, price, size }));
};

const routePathFromExecutionOrder = (order: ExecutionOrderResponse | null): string[] => {
  const direct = stringArrayField(order?.routeSummary, 'venuePath');
  if (direct.length > 0) return direct;
  const venues = stringArrayField(order?.routeSummary, 'venues');
  if (venues.length > 0) return venues;
  const legVenues = arrayField(order?.routeSummary, ['legs', 'routeLegs', 'venueLegs', 'path'])
    .map((item) => typeof item === 'string' ? item : textField(item, ['venue', 'venueId', 'name', 'selectedVenue']))
    .filter((item): item is string => Boolean(item));
  if (legVenues.length > 0) return legVenues;
  const venue = textField(order?.routeSummary, ['venue', 'selectedVenue']);
  if (venue) return [venue];
  const preference = typeof order?.venuePreference === 'string' && order.venuePreference !== 'BEST_ROUTE'
    ? order.venuePreference
    : null;
  return preference ? [preference] : [];
};

const orderEffectivePrice = (order: ExecutionOrderResponse | null): number | null =>
  numericField(order?.priceSummary, ['effectivePrice', 'averagePrice', 'avgPrice', 'price', 'expectedPrice']) ??
  numericField(order?.routeSummary, ['effectivePrice', 'averagePrice', 'avgPrice', 'price', 'expectedPrice']);

const orderReceiveAmount = (order: ExecutionOrderResponse | null): string | null =>
  textField(order?.priceSummary, ['toReceive', 'toWin', 'estimatedReceive', 'estimatedPayout', 'estimatedShares', 'executableAmount']) ??
  textField(order?.routeSummary, ['toReceive', 'toWin', 'estimatedReceive', 'estimatedPayout', 'estimatedShares', 'executableAmount']);

const executionOrderRouteType = (order: ExecutionOrderResponse | null): string =>
  textField(order?.routeSummary, ['routeType', 'type', 'strategy']) ??
  (order?.venuePreference === 'BEST_ROUTE' ? 'BEST_ROUTE' : 'SINGLE_VENUE');

const executionOrderEstimatedSavings = (order: ExecutionOrderResponse | null): number | null =>
  numericField(order?.priceSummary, ['estimatedSavings', 'savings', 'totalSavings']) ??
  numericField(order?.routeSummary, ['estimatedSavings', 'savings', 'totalSavings']);

const describeOutcomeSchema = (schema: Record<string, unknown> | null | undefined): string => {
  if (!schema) return 'Outcome schema not specified';
  const yes = typeof schema.yesLabel === 'string' ? schema.yesLabel : 'Yes';
  const no = typeof schema.noLabel === 'string' ? schema.noLabel : 'No';
  const shape = typeof schema.marketShape === 'string' ? schema.marketShape : 'market';
  return `${shape} - ${yes} / ${no}`;
};

const describeCatalogOutcomes = (outcomes: MarketCatalogVenueMarket["outcomes"]): string =>
  outcomes.length > 0
    ? outcomes.map((outcome) => outcome.label || outcome.id).filter(Boolean).join(" / ")
    : "Outcome schema not specified";

const mergeCatalogOutcomeLabels = (left: string, right: string): string => {
  const labels = new Set(
    [...left.split(" / "), ...right.split(" / ")]
      .map((label) => label.trim())
      .filter((label) => label && label !== "Outcome schema not specified")
  );
  return labels.size > 0 ? Array.from(labels).join(" / ") : "Outcome schema not specified";
};

const firstCatalogText = (current: string | null, next: string | null | undefined): string | null =>
  current ?? (next?.trim() || null);

const catalogRuleFallbacks = (venueMarkets: readonly MarketCatalogVenueMarket[]): ResolutionRuleFallback[] => {
  const grouped = new Map<string, ResolutionRuleFallback>();

  for (const venueMarket of venueMarkets) {
    if (!venueMarket.venue || !venueMarket.venueMarketId) continue;
    const key = normalizeVenueId(venueMarket.venue);
    const existing = grouped.get(key);
    const venueMarketId = venueMarket.venueMarketId;
    const outcomes = describeCatalogOutcomes(venueMarket.outcomes);

    if (existing) {
      if (!existing.venueMarketIds.includes(venueMarketId)) {
        existing.venueMarketIds.push(venueMarketId);
        existing.venueMarketCount += 1;
      }
      existing.outcomes = mergeCatalogOutcomeLabels(existing.outcomes, outcomes);
      existing.resolutionRulesText = firstCatalogText(existing.resolutionRulesText, venueMarket.resolutionRulesText);
      existing.resolutionSource = firstCatalogText(existing.resolutionSource, venueMarket.resolutionSource);
      existing.resolutionTitle = firstCatalogText(existing.resolutionTitle, venueMarket.resolutionTitle);
      existing.sourceUrl = firstCatalogText(existing.sourceUrl, venueMarket.sourceUrl);
      existing.expiresAt = existing.expiresAt ?? venueMarket.expiresAt;
      existing.resolvesAt = existing.resolvesAt ?? venueMarket.resolvesAt;
      continue;
    }

    grouped.set(key, {
      key,
      venue: venueMarket.venue,
      venueMarketId,
      venueMarketIds: [venueMarketId],
      venueMarketCount: 1,
      venueTitle: venueMarket.venueTitle || venueMarket.canonicalMarketTitle || "Venue market",
      marketClass: venueMarket.marketClass || "Market",
      outcomes,
      resolutionRulesText: venueMarket.resolutionRulesText?.trim() || null,
      resolutionSource: venueMarket.resolutionSource?.trim() || null,
      resolutionTitle: venueMarket.resolutionTitle?.trim() || null,
      sourceUrl: venueMarket.sourceUrl?.trim() || null,
      expiresAt: venueMarket.expiresAt,
      resolvesAt: venueMarket.resolvesAt,
    });
  }

  return Array.from(grouped.values());
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
    canonicalMarketIds: canonicalIdsForTerminalOutcome(
      outcome.marketId ?? fallbackMarketId,
      outcome.canonicalMarketIds,
      market.canonicalMarketIds,
      rows.length,
    ),
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
      <div className="flex items-center gap-2 px-3 pt-2 sm:px-4">
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

const chartPointValue = (
  value: string | null | undefined,
  options: { zeroAsMissing?: boolean } = {}
): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (options.zeroAsMissing && parsed <= 0) return null;
  return parsed * 100;
};

const OUTCOME_CHART_COLORS = ["#22C55E", "#EF4444", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899"];

const normalizeChartKey = (prefix: string, value: string): string =>
  `${prefix}_${value.replace(/[^a-zA-Z0-9_]/g, "_")}`;

const chartPercentFromDisplayLabel = (value: string | null | undefined): number | null => {
  if (!value || value === 'Quote') return null;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const isAlreadyPercentScale = /[%c]/i.test(value) || value.includes('\u00A2') || value.includes('\u00C2');
  return isAlreadyPercentScale ? parsed : parsed <= 1 ? parsed * 100 : parsed;
};

const liveOutcomeChartPercent = (outcome: TerminalOutcomeRow): number | null =>
  chartPercentFromDisplayLabel(outcome.prob) ?? chartPercentFromDisplayLabel(outcome.yesPrice);

const chartSeriesLabel = (item: { id: string; label: string }): string => {
  if (item.id === "unified") return "Lotus canonical";
  return formatVenueLabel(item.label || item.id);
};

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

const formatChartAxisTimeLabel = (timestamp: number, timeframe: MarketChartTimeframe): string => {
  if (!Number.isFinite(timestamp)) return "";
  return formatChartTimeLabel(new Date(timestamp).toISOString(), timeframe);
};

const formatChartAxisValue = (value: number): string => {
  const precision = Math.abs(value) >= 10 ? 0 : Math.abs(value) >= 1 ? 1 : 2;
  return `${value.toFixed(precision)}%`;
};

const buildChartTicks = (max: number): number[] => {
  if (!Number.isFinite(max) || max <= 0) return [0, 25, 50, 75, 100];
  const divisions = 4;
  return Array.from({ length: divisions + 1 }, (_, index) => Number(((max / divisions) * index).toFixed(max <= 2 ? 2 : max <= 10 ? 1 : 0)));
};

const buildChartYAxis = (
  rows: TerminalChartRow[],
  series: TerminalChartSeries[]
): { domain: [number, number]; ticks: number[] } => {
  const values = rows.flatMap((row) =>
    series.flatMap((item) => {
      const value = row[item.id];
      return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
    })
  );

  if (values.length === 0) return { domain: [0, 100], ticks: [0, 25, 50, 75, 100] };

  const max = Math.max(...values);
  const paddedMax = max <= 0 ? 1 : max * 1.16;
  const upper = paddedMax <= 1
    ? 1
    : paddedMax <= 2
      ? 2
      : paddedMax <= 5
        ? 5
        : paddedMax <= 10
          ? 10
          : paddedMax <= 25
            ? 25
            : paddedMax <= 50
              ? 50
              : paddedMax <= 75
                ? 75
                : 100;

  return { domain: [0, upper], ticks: buildChartTicks(upper) };
};

const toVenueChartModel = (
  chart: MarketChartResponse | null,
  timeframe: MarketChartTimeframe
): { rows: TerminalChartRow[]; series: TerminalChartSeries[]; historyStatus: MarketChartResponse["historyStatus"] | null } => {
  if (!chart) return { rows: [], series: [], historyStatus: null };
  const series = chart.series.map((item) => ({
    id: item.id,
    label: chartSeriesLabel(item),
    color: item.color,
    emphasis: item.id === "unified",
    dashed: item.id !== "unified"
  }));
  const rows = chart.points.map((point) => ({
    label: formatChartTimeLabel(point.timestamp, timeframe),
    timestamp: bucketChartTimestamp(point.timestamp),
    unified: chartPointValue(point.unified),
    ...Object.fromEntries(Object.entries(point.venues).map(([venue, value]) => [venue, chartPointValue(value)]))
  }));
  return { rows, series, historyStatus: chart.historyStatus };
};

const toOutcomeChartModel = (
  charts: OutcomeChartEntry[],
  latestValuesByKey: Map<string, number | null>,
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
      const value = chartPointValue(point.unified, { zeroAsMissing: true });
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

  const liveEntries = charts
    .map((entry) => ({ ...entry, latestValue: latestValuesByKey.get(entry.key) ?? null }))
    .filter((entry) => typeof entry.latestValue === 'number' && Number.isFinite(entry.latestValue));
  if (liveEntries.length > 0) {
    const now = new Date();
    const bucket = bucketChartTimestamp(now.toISOString());
    const liveRow = rowsByBucket.get(bucket) ?? {
      label: formatChartTimeLabel(now.toISOString(), timeframe),
      timestamp: bucket
    };
    for (const entry of liveEntries) {
      liveRow[entry.key] = entry.latestValue as number;
    }
    rowsByBucket.set(bucket, liveRow);
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
  const [activeTab, setActiveTab] = useState<MarketChartTimeframe>('1D');
  const [venueChart, setVenueChart] = useState<MarketChartResponse | null>(null);
  const [outcomeCharts, setOutcomeCharts] = useState<OutcomeChartEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFoundKey, setNotFoundKey] = useState<string | null>(null);
  const tabs: MarketChartTimeframe[] = ['1H', '6H', '1D', '1W', '1M', 'ALL'];
  const requestKey = `${marketId ?? 'none'}:${outcomeId ?? 'none'}`;
  const selectedChartOutcome = useMemo(() => {
    if (marketType !== 'binary' || outcomes.length === 0) return null;
    return outcomes.find((outcome) => outcome.id === outcomeId) ??
      outcomes.find((outcome) => marketId && outcome.marketId === marketId && streamOutcomeMatches(outcome.quoteOutcomeId, outcomeId)) ??
      outcomes.find((outcome) => marketId && outcome.marketId === marketId) ??
      outcomes.find((outcome) => streamOutcomeMatches(outcome.quoteOutcomeId, outcomeId)) ??
      outcomes[0] ??
      null;
  }, [marketId, marketType, outcomeId, outcomes]);
  const binaryOutcomeInputs = useMemo(() => {
    if (marketType !== 'binary') return [];
    const source = selectedChartOutcome
      ? [selectedChartOutcome]
      : outcomes.length > 0
      ? [outcomes[0]!]
      : [
          { id: 'YES', marketId, quoteOutcomeId: 'YES', name: 'Yes' } as TerminalOutcomeRow,
        ];
    return source.slice(0, 1).map((outcome, index): OutcomeChartInput => {
      const chartMarketId = outcome.marketId ?? marketId;
      const quoteOutcomeId = outcome.quoteOutcomeId || canonicalQuoteOutcomeId(outcome.name || outcome.id);
      return {
        id: outcome.id,
        marketId: chartMarketId,
        quoteOutcomeId,
        label: outcome.name,
        key: normalizeChartKey('outcome', `${chartMarketId ?? 'market'}_${quoteOutcomeId}_${outcome.id}_${outcome.name}`),
        color: OUTCOME_CHART_COLORS[index % OUTCOME_CHART_COLORS.length]!,
        latestValue: liveOutcomeChartPercent(outcome),
      };
    });
  }, [marketId, marketType, outcomes, selectedChartOutcome]);
  const binaryOutcomeFetchKey = useMemo(
    () => binaryOutcomeInputs
      .map((outcome) => `${outcome.id}:${outcome.marketId ?? ''}:${outcome.quoteOutcomeId}:${outcome.key}`)
      .join('|'),
    [binaryOutcomeInputs]
  );
  const binaryOutcomeChartInputs = useMemo(
    () => binaryOutcomeInputs.map(({ latestValue: _latestValue, ...outcome }) => outcome),
    [binaryOutcomeFetchKey]
  );
  const liveOutcomeValuesByKey = useMemo(
    () => new Map(binaryOutcomeInputs.map((outcome) => [outcome.key, outcome.latestValue])),
    [binaryOutcomeInputs]
  );
  const chartModel = useMemo(
    () => marketType === 'binary'
      ? toOutcomeChartModel(outcomeCharts, liveOutcomeValuesByKey, activeTab)
      : toVenueChartModel(venueChart, activeTab),
    [activeTab, liveOutcomeValuesByKey, marketType, outcomeCharts, venueChart]
  );
  const { rows, series, historyStatus } = chartModel;
  const yAxis = useMemo(() => buildChartYAxis(rows, series), [rows, series]);

  React.useEffect(() => {
    let cancelled = false;
    const loadChart = async () => {
      if (!marketId) {
        setVenueChart(null);
        setOutcomeCharts([]);
        setError(null);
        return;
      }
      if (notFoundKey === requestKey) return;
      setLoading(true);
      setError(null);
      try {
        if (marketType === 'binary') {
          const uniqueInputs = Array.from(new Map(
            binaryOutcomeChartInputs
              .filter((outcome) => outcome.marketId)
              .map((outcome) => [outcome.key, outcome])
          ).values());
          const results = await Promise.allSettled(
            uniqueInputs.map(async (outcome): Promise<OutcomeChartEntry> => {
              const chart = await getMarketChart(outcome.marketId!, { outcomeId: outcome.quoteOutcomeId, timeframe: activeTab });
              return {
                id: outcome.id,
                marketId: outcome.marketId,
                quoteOutcomeId: outcome.quoteOutcomeId,
                label: outcome.label,
                key: outcome.key,
                color: outcome.color,
                chart,
              };
            })
          );
          const fulfilled = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
          if (!cancelled) {
            setVenueChart(null);
            setOutcomeCharts(fulfilled);
            if (fulfilled.length > 0) {
              setNotFoundKey(null);
            }
            if (fulfilled.length === 0) {
              const rejected = results.find((result) => result.status === 'rejected');
              if (rejected?.reason && isApiNotFound(rejected.reason, 'MARKET_NOT_FOUND')) {
                setNotFoundKey(requestKey);
              }
              setError(safeMarketDataError(rejected?.reason, 'chart'));
            }
          }
          return;
        }

        const response = await getMarketChart(marketId, { outcomeId, timeframe: activeTab });
        if (!cancelled) {
          setOutcomeCharts([]);
          setVenueChart(response);
          setNotFoundKey(null);
        }
      } catch (err) {
        if (!cancelled) {
          setVenueChart(null);
          setOutcomeCharts([]);
          if (isApiNotFound(err, 'MARKET_NOT_FOUND')) {
            setNotFoundKey(requestKey);
          }
          setError(safeMarketDataError(err, 'chart'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadChart();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void loadChart();
    }, TERMINAL_CHART_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTab, binaryOutcomeChartInputs, marketId, marketType, notFoundKey, outcomeId, requestKey]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#18181b]/95 border border-zinc-800 rounded-lg p-3 shadow-2xl z-50 min-w-[200px]">
        <div className="text-zinc-400 text-[11px] mb-3 font-sans">
          {formatChartAxisTimeLabel(Number(label), activeTab) || String(label)}
        </div>
        <div className="flex flex-col gap-2">
          {[...payload].filter((entry: any) => typeof entry.value === 'number').sort((a: any, b: any) => b.value - a.value).map((entry: any) => (
            <div key={entry.dataKey} className="flex items-center gap-1.5 text-[13px] font-medium">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="font-bold text-white">{Number(entry.value).toFixed(Number(entry.value) >= 10 ? 1 : 2)}%</span>
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
      <div className="mt-3 overflow-x-auto px-2 sm:px-4 custom-scrollbar">
        <div className="flex w-max min-w-0 items-center rounded-md bg-transparent space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 text-sm font-bold transition-colors sm:px-3 ${
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 mt-3 text-[12px] min-h-[20px] sm:px-4 sm:text-[13px]">
        {series.slice(0, 5).map((item) => {
          const latest = [...rows].reverse().find((point) => typeof point[item.id] === 'number');
          const value = typeof latest?.[item.id] === 'number' ? latest[item.id] as number : null;
          return (
            <div key={item.id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-white font-bold">
                {item.label} {value === null ? 'pending' : `${value.toFixed(value >= 10 ? 1 : 2)}%`}
              </span>
            </div>
          );
        })}
        {historyStatus === 'accumulating' && (
          <div className="text-zinc-500 font-bold ml-2">Live history accumulating</div>
        )}
      </div>
      <div className="relative mt-4 min-h-[260px] w-full flex-1 pr-2 sm:mt-5 sm:min-h-[300px] sm:pr-4">
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
          <LineChart data={rows} margin={{ top: 12, right: 38, left: 8, bottom: 12 }}>
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#71717A', fontSize: 11 }}
              tickCount={activeTab === 'ALL' ? 7 : 5}
              minTickGap={28}
              dy={10}
              tickFormatter={(value) => formatChartAxisTimeLabel(Number(value), activeTab)}
            />
            <YAxis
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#71717A', fontSize: 11 }}
              width={42}
              dx={8}
              tickFormatter={(value) => formatChartAxisValue(Number(value))}
              ticks={yAxis.ticks}
              domain={yAxis.domain}
            />
            {yAxis.ticks.map((val) => (
              <ReferenceLine key={val} y={val} stroke="#27272A" strokeDasharray="3 3" opacity={0.6} />
            ))}
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525B', strokeWidth: 1, strokeDasharray: '3 3' }} />
            {series.map((item) => (
              <Line
                key={item.id}
                type="stepAfter"
                dataKey={item.id}
                name={item.label}
                stroke={item.color}
                strokeWidth={item.emphasis || series.length === 1 ? 2.5 : 1.8}
                dot={false}
                strokeDasharray={item.dashed ? '4 2' : undefined}
                activeDot={{ r: item.emphasis || series.length === 1 ? 5 : 4, stroke: '#18181b', strokeWidth: 2 }}
                connectNulls
              />
            ))}
            {series.length === 1 && (() => {
              const item = series[0]!;
              const latest = [...rows].reverse().find((point) => typeof point[item.id] === 'number');
              const latestValue = latest?.[item.id];
              if (typeof latest?.timestamp !== 'number' || typeof latestValue !== 'number') return null;
              return (
                <ReferenceDot
                  key={`${item.id}-latest-dot`}
                  x={latest.timestamp}
                  y={latestValue}
                  r={5}
                  fill={item.color}
                  stroke="#0c0c0c"
                  strokeWidth={2}
                />
              );
            })()}
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
  const [ticketOrchestratorOrder, setTicketOrchestratorOrder] = useState<ExecutionOrderResponse | null>(null);
  const [ticketOrchestratorAmount, setTicketOrchestratorAmount] = useState<string | null>(null);
  const [ticketOrchestratorAutoRenewFailed, setTicketOrchestratorAutoRenewFailed] = useState(false);
  const [ticketOrchestratorPlacing, setTicketOrchestratorPlacing] = useState(false);
  const [ticketOrchestratorSigning, setTicketOrchestratorSigning] = useState(false);
  const [ticketConfirmArmed, setTicketConfirmArmed] = useState(false);
  const [ticketSettingsOpen, setTicketSettingsOpen] = useState(false);
  const [ticketOrderPolicy, setTicketOrderPolicy] = useState<'FOK' | 'FAK'>('FAK');
  const [ticketSlippageTolerance, setTicketSlippageTolerance] = useState('0.50');
  const [ticketPolymarketClobSyncConfirmed, setTicketPolymarketClobSyncConfirmed] = useState(false);
  const [ticketStatusMessage, setTicketStatusMessage] = useState<string | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketActivationPolling, setTicketActivationPolling] = useState(false);
  const [ticketReadinessPolling, setTicketReadinessPolling] = useState(false);
  const [ticketReadinessNextCheckAt, setTicketReadinessNextCheckAt] = useState<number | null>(null);
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
  const [orderbookNotFoundKey, setOrderbookNotFoundKey] = useState<string | null>(null);
  const [orderbookWsState, setOrderbookWsState] = useState<ExecutionWsState>('idle');
  const [orderbookStreamTopics, setOrderbookStreamTopics] = useState<ExecutionTopic[]>([]);
  const [latestOrderbookStream, setLatestOrderbookStream] = useState<MarketOrderbookStreamPayload | null>(null);
  const lastOrderbookWsUpdateAtRef = React.useRef<number | null>(null);
  const orderbookStreamSeqRef = React.useRef<Map<string, number>>(new Map());
  const orderbookRef = React.useRef<MarketOrderbookResponse | null>(null);
  const orderbookChecksumValidationSeqRef = React.useRef(0);
  const lastOrderbookRestRecoveryAtRef = React.useRef<number | null>(null);
  const orderbookRestRecoveryInFlightRef = React.useRef(false);
  const orderbookRestRecoveryTimerRef = React.useRef<number | null>(null);
  const missingRiskProfileKeysRef = React.useRef<Set<string>>(new Set());
  const selectedOutcomeRef = React.useRef<TerminalOutcomeRow | null>(null);
  const terminalOutcomesRef = React.useRef<TerminalOutcomeRow[]>([]);
  const autoPolymarketClobSyncKeyRef = React.useRef<string | null>(null);
  const orchestratorPreviewSeqRef = React.useRef(0);
  const orchestratorPollTimeoutRef = React.useRef<number | null>(null);
  const orchestratorPlacePromiseRef = React.useRef<Promise<void> | null>(null);
  const orchestratorSignaturePromiseRef = React.useRef<Promise<ExecutionOrderResponse | null> | null>(null);
  const [localSelectedMarket, setLocalSelectedMarket] = useState<TerminalMarketSelection | null>(null);
  const executionOrchestratorEnabled = env.executionOrchestratorV1Enabled;

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
  const resolutionRuleFallbacks = useMemo(
    () => catalogRuleFallbacks(selectedVenueMarkets),
    [selectedVenueMarkets]
  );
  const catalogRuleTextCount = useMemo(
    () => resolutionRuleFallbacks.filter((rule) => Boolean(rule.resolutionRulesText)).length,
    [resolutionRuleFallbacks]
  );
  const token = session?.userJwt ?? null;

  React.useEffect(() => {
    orderbookRef.current = orderbook;
  }, [orderbook]);

  React.useEffect(() => {
    terminalOutcomesRef.current = terminalOutcomes;
  }, [terminalOutcomes]);

  React.useEffect(() => {
    setTicketPolymarketClobSyncConfirmed(false);
  }, [token]);

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
  const polymarketBalanceReady = useMemo(() => {
    if (!backendVenueList.includes('POLYMARKET')) return false;
    return fundingBalances.some(polymarketBalanceConfirmsTradeReadiness);
  }, [backendVenueList, fundingBalances]);
  const polymarketLiveReadinessReady = useMemo(() => {
    if (!backendVenueList.includes('POLYMARKET')) return false;
    return polymarketReadinessConfirmsTradeReadiness(ticketLiveReadiness);
  }, [backendVenueList, ticketLiveReadiness]);
  const polymarketClobConfirmed = polymarketBalanceReady || polymarketLiveReadinessReady || ticketPolymarketClobSyncConfirmed;
  const polymarketActivationRequired = useMemo(() => {
    if (!backendVenueList.includes('POLYMARKET')) return false;
    if (polymarketClobConfirmed) return false;
    const activation = fundingActivations.find((item) => toBackendVenueId(item.venue) === 'POLYMARKET');
    if (!activation) return false;
    const reason = String(activation.readinessReason ?? '').toUpperCase();
    const bridgedUsdc = parsePositiveNumber(activation.bridgedUsdcBalance ?? undefined) ?? 0;
    return activation.activationRequired === true &&
      (reason === 'POLYMARKET_USDCE_ACTIVATION_REQUIRED' ||
        reason === 'POLYMARKET_CLOB_APPROVAL_REQUIRED' ||
        bridgedUsdc > 0);
  }, [backendVenueList, fundingActivations, polymarketClobConfirmed]);
  const polymarketClobSyncPending = useMemo(() => {
    if (!backendVenueList.includes('POLYMARKET')) return false;
    if (polymarketClobConfirmed) return false;
    const activation = fundingActivations.find((item) => toBackendVenueId(item.venue) === 'POLYMARKET');
    return String(activation?.readinessReason ?? '').toUpperCase() === 'POLYMARKET_CLOB_SYNC_PENDING';
  }, [backendVenueList, fundingActivations, polymarketClobConfirmed]);
  const visibleOutcomeRows = showAllOutcomes ? terminalOutcomes : terminalOutcomes.slice(0, 5);
  const selectedOutcome = terminalOutcomes.find((outcome) => outcome.id === selectedOutcomeId) ?? terminalOutcomes[0] ?? null;
  const selectedOutcomeMarketId = selectedOutcome?.marketId ?? terminalMarketId;
  const selectedQuoteOutcomeId = selectedOutcome?.quoteOutcomeId ?? selectedOutcomeId;
  const selectedOutcomeRefreshKey = `${selectedOutcome?.id ?? 'none'}:${selectedOutcomeMarketId ?? 'none'}:${selectedQuoteOutcomeId ?? 'none'}`;
  const selectedOutcomeCanonicalMarketIds = useMemo(
    () => canonicalIdsForTerminalOutcome(
      selectedOutcomeMarketId,
      selectedOutcome?.canonicalMarketIds,
      terminalMarket.canonicalMarketIds,
      terminalOutcomes.length,
    ),
    [selectedOutcome?.canonicalMarketIds, selectedOutcomeMarketId, terminalMarket.canonicalMarketIds, terminalOutcomes.length],
  );
  React.useEffect(() => {
    selectedOutcomeRef.current = selectedOutcome;
  }, [selectedOutcome]);
  const orderbookActive = Boolean(selectedOutcome && expandedOutcomeId === selectedOutcome.id);
  const orderbookMarketId = orderbookActive ? selectedOutcomeMarketId ?? terminalMarketId : null;
  const orderbookQuoteOutcomeId = orderbookActive ? selectedQuoteOutcomeId ?? (marketType === 'binary' ? 'YES' : null) : null;
  const orderbookStreamMarketIds = useMemo(
    () => selectedOutcomeCanonicalMarketIds.length > 0
      ? selectedOutcomeCanonicalMarketIds
      : uniqueNonEmptyStrings([orderbookMarketId]),
    [orderbookMarketId, selectedOutcomeCanonicalMarketIds],
  );
  const selectedTicketOutcomeId = outcomeIdForTicketSide(terminalOutcomes, ticketOutcomeSide, selectedOutcomeId);
  const selectedTicketOutcome = terminalOutcomes.find((outcome) => outcome.id === selectedTicketOutcomeId) ?? selectedOutcome;
  const selectedTicketMarketId = selectedTicketOutcome?.marketId ?? selectedOutcomeMarketId ?? terminalMarketId;
  const selectedTicketQuoteOutcomeId = quoteOutcomeIdForTicketSide(selectedTicketOutcome, ticketOutcomeSide)
    ?? selectedTicketOutcomeId;
  const ticketVenuePreference = useMemo<ExecutionOrderVenuePreference>(() => {
    // The orderbook venue selector is only a display filter. Execution should
    // stay route-controlled unless a dedicated venue-lock control is added.
    return 'BEST_ROUTE';
  }, []);
  const ticketOrchestratorRoutePath = routePathFromExecutionOrder(ticketOrchestratorOrder);
  const legacyTicketRoutePath = routePath(ticketQuote);
  const ticketRoutePath = executionOrchestratorEnabled ? ticketOrchestratorRoutePath : legacyTicketRoutePath;
  const ticketRouteUsesPolymarket = executionOrchestratorEnabled
    ? ticketOrchestratorRoutePath.some((venue) => toBackendVenueId(venue) === 'POLYMARKET')
    : Boolean(ticketQuote?.legs.some((leg) => toBackendVenueId(leg.venue) === 'POLYMARKET'));
  const ticketPolymarketTokenId = ticketQuote?.legs.find((leg) =>
    toBackendVenueId(leg.venue) === 'POLYMARKET' && /^\d+$/.test(String(leg.venueOutcomeId ?? ''))
  )?.venueOutcomeId;
  const ticketEffectivePrice = executionOrchestratorEnabled
    ? orderEffectivePrice(ticketOrchestratorOrder) ?? ticketPriceForSide(selectedTicketOutcome, ticketOutcomeSide)
    : ticketQuote?.effectivePrice ?? ticketPriceForSide(selectedTicketOutcome, ticketOutcomeSide);
  const ticketEstimatedShares = estimateShares(ticketAmount, ticketEffectivePrice);
  const ticketShareImprovement = routeShareImprovement(ticketAmount, ticketQuote, ticketLiveCandidates);
  const accountEmptyCopy = !token ? 'Log in to load your Lotus execution records for this market.' : 'No backend records for this market yet.';
  const selectedSellPositions = positions.filter((position) =>
    matchesPositionMarket(position, selectedTicketMarketId, selectedTicketQuoteOutcomeId)
  );
  const ticketSellableShares = sellableSharesForPositions(positions, selectedTicketMarketId, selectedTicketQuoteOutcomeId);
  const totalVerifiedSize = positions.reduce((sum, position) => sum + (parsePositiveNumber(position.verifiedSize) ?? 0), 0);
  const totalCostBasis = positions.reduce((sum, position) => sum + (parsePositiveNumber(position.verifiedSize) ?? 0) * position.averageEntryPrice, 0);
  const averageEntry = totalVerifiedSize > 0 ? totalCostBasis / totalVerifiedSize : null;
  const positionVenueRows = positions.map((position) => {
    const outcomeRow = terminalOutcomes.find((outcome) => matchesPositionMarket(position, outcome.marketId ?? terminalMarketId, null)) ?? selectedOutcome;
    const currentPrice = parseProbabilityLabel(position.outcomeId === 'NO' ? outcomeRow?.noPrice : outcomeRow?.yesPrice) ?? position.averageEntryPrice;
    const size = parsePositiveNumber(position.verifiedSize) ?? 0;
    const value = size * currentPrice;
    return {
      key: position.positionId,
      venue: formatVenueLabel(position.venue),
      logo: normalizeVenueId(position.venue),
      size,
      shares: formatCompactMetric(position.verifiedSize) ?? position.verifiedSize,
      avgEntry: formatProbabilityPrice(position.averageEntryPrice),
      value,
    };
  });
  const totalPositionValue = positionVenueRows.reduce((sum, row) => sum + row.value, 0);
  const positionValueDisplay = totalVerifiedSize > 0 ? formatTerminalCurrency(totalPositionValue) : '$0';
  const positionShareDisplay = totalVerifiedSize > 0 ? `${formatCompactMetric(totalVerifiedSize) ?? totalVerifiedSize.toFixed(2)} shares` : '0 shares';
  const positionAverageEntryDisplay = averageEntry !== null ? formatProbabilityPrice(averageEntry) : '--';
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
  const displayOrderbook = useMemo(
    () => filterOrderbookForVenue(orderbook, orderbookVenue),
    [orderbook, orderbookVenue]
  );
  const orderbookLiveVenues = useMemo(() => {
    return (displayOrderbook?.venues ?? []).filter((venue) => {
      return venue.blockers.length === 0 && (venue.bids.length > 0 || venue.asks.length > 0 || Boolean(venue.bestBid || venue.bestAsk));
    });
  }, [displayOrderbook?.venues]);
  const orderbookLiveVenueCount = orderbookLiveVenues.length;
  const orderbookSnapshotStatus = orderbookLiveVenueCount > 0
    ? 'live'
    : latestOrderbookStream?.snapshotStatus
      ?? (displayOrderbook?.status === 'stale' ? 'stale' : displayOrderbook?.status === 'unavailable' ? 'blocked' : displayOrderbook ? 'live' : undefined);
  const orderbookFreshness = streamFreshnessLabel(latestOrderbookStream?.freshnessMs);
  const orderbookStreamBlockers = latestOrderbookStream?.blockers
    ?.map(normalizeStreamBlocker)
    .filter((blocker): blocker is string => Boolean(blocker)) ?? [];
  const marketDiagnosticsEnabled = lotusMarketDiagnosticsEnabled();
  const orderbookWsLabel = orderbookWsState === 'open'
    ? marketDiagnosticsEnabled ? 'stream' : 'live feed'
    : orderbookWsState === 'connecting'
      ? 'connecting'
      : marketDiagnosticsEnabled ? 'REST fallback' : 'backup feed';
  const orderbookStatusDetail = orderbookLiveVenueCount > 0
    ? `${orderbookLiveVenueCount} live venue${orderbookLiveVenueCount === 1 ? '' : 's'}`
    : marketDiagnosticsEnabled
      ? displayOrderbook?.status ?? 'pending'
      : 'updating';
  const selectedOutcomeBookDisplay = useMemo(() => {
    if (!orderbook) {
      return {
        yesPrice: null as string | null,
        noPrice: null as string | null,
        probability: null as string | null,
        yesVenue: null as string | null,
        noVenue: null as string | null,
      };
    }
    const bestAsk = orderbookNumericValue(orderbook.bestAsk);
    const bestBid = orderbookNumericValue(orderbook.bestBid);
    const midpoint = orderbookNumericValue(orderbook.midpoint);
    const normalizedBestBid = bestBid !== null && bestBid > 1 ? bestBid / 100 : bestBid;
    const normalizedMidpoint = midpoint !== null && midpoint > 1 ? midpoint / 100 : midpoint;
    return {
      yesPrice: bestAsk !== null ? formatProbabilityPrice(bestAsk) : null,
      noPrice: normalizedBestBid !== null && marketType === 'binary' ? formatProbabilityPrice(1 - normalizedBestBid) : null,
      probability: normalizedMidpoint !== null ? formatProbabilityPercent(normalizedMidpoint) : null,
      yesVenue: orderbook.asks[0]?.venue ?? null,
      noVenue: orderbook.bids[0]?.venue ?? null,
    };
  }, [marketType, orderbook]);

  const focusTerminalOutcomeOrderbook = useCallback((outcomeId: string) => {
    setSelectedOutcomeId(outcomeId);
    setExpandedOutcomeId(outcomeId);
    setBottomTab('Outcomes');
  }, []);

  const inlineOrderbookLiveVenueCount = useMemo(() => {
    return (orderbook?.venues ?? []).filter((venue) => {
      return venue.blockers.length === 0 && (venue.bids.length > 0 || venue.asks.length > 0 || Boolean(venue.bestBid || venue.bestAsk));
    }).length;
  }, [orderbook?.venues]);

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
        canonicalMarketIds: row.canonicalMarketIds,
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
            canonicalMarketIds: canonicalIdsForTerminalOutcome(terminalMarketId, null, terminalMarket.canonicalMarketIds, outcomeResponse.outcomes.length),
            quoteOutcomeId: canonicalQuoteOutcomeId(outcome.label),
          }))
          : seededOutcomes;

      const livePriceResponse = await getMarketLivePrices({
        items: baseOutcomes.map((outcome) => ({
          marketId: outcome.marketId ?? terminalMarketId,
          canonicalMarketIds: canonicalIdsForTerminalOutcome(
            outcome.marketId ?? terminalMarketId,
            outcome.canonicalMarketIds,
            terminalMarket.canonicalMarketIds,
            baseOutcomes.length,
          ),
          outcomeId: outcome.quoteOutcomeId ?? canonicalQuoteOutcomeId(outcome.label),
        })),
      });
      const livePriceByKey = new Map(livePriceResponse.prices.map((price) => [`${price.marketId}:${price.outcomeId ?? ''}`, price]));

      const rows = baseOutcomes.map((outcome, index): TerminalOutcomeRow => {
        const outcomeMarketId = outcome.marketId ?? terminalMarketId;
        const quoteOutcomeId = outcome.quoteOutcomeId ?? canonicalQuoteOutcomeId(outcome.label);
        const canonicalMarketIds = canonicalIdsForTerminalOutcome(
          outcomeMarketId,
          outcome.canonicalMarketIds,
          terminalMarket.canonicalMarketIds,
          baseOutcomes.length,
        );
        const venues = outcome.venues.length ? outcome.venues : marketVenueList;
        const livePrice = livePriceByKey.get(`${outcomeMarketId}:${quoteOutcomeId}`);
        const parsedPrice = orderbookNumericValue(livePrice?.price ?? livePrice?.bestAsk ?? livePrice?.midpoint ?? livePrice?.bestBid);
        const yesPrice = parsedPrice !== null ? formatProbabilityPrice(parsedPrice) : '-';
        const noPrice = parsedPrice !== null && terminalMarket.marketType === 'binary' ? formatProbabilityPrice(1 - parsedPrice) : '-';
        const quoteVenues = livePrice?.linkedVenues?.length
          ? livePrice.linkedVenues
          : livePrice?.venues?.length
            ? livePrice.venues
            : venues;
        const liveQuoteVenues = livePrice?.liveVenues?.length
          ? livePrice.liveVenues
          : livePrice?.venues ?? [];
        return {
          id: outcome.id,
          marketId: outcomeMarketId,
          canonicalMarketIds,
          quoteOutcomeId,
          name: outcome.label,
          vol: `${formatMoneyMetric(terminalMarket.volume) ?? terminalMarket.volume} Vol.`,
          platforms: quoteVenues.length || terminalMarket.venueCount,
          prob: parsedPrice !== null ? formatProbabilityPercent(parsedPrice) : '-',
          yesPrice,
          noPrice,
          primaryVenue: livePrice?.bestVenue ?? quoteVenues[0] ?? null,
          venueQuotes: livePrice?.bestVenue && parsedPrice !== null
            ? placeholderVenueQuotes(liveQuoteVenues.length ? liveQuoteVenues : [livePrice.bestVenue], yesPrice, noPrice, null)
            : placeholderVenueQuotes(quoteVenues, '-', '-', null),
          active: index === 0,
          venues: quoteVenues,
          status: parsedPrice !== null ? 'live' : 'pending',
          blocker: null,
        };
      });

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
  }, [marketVenueList, terminalMarket, terminalMarketId]);

  const refreshAllOutcomePrices = useCallback(async () => {
    const currentOutcomes = terminalOutcomesRef.current;
    if (!terminalMarketId || currentOutcomes.length === 0) return;
    const requestItems = currentOutcomes
      .map((outcome) => {
        const outcomeMarketId = outcome.marketId ?? terminalMarketId;
        const quoteOutcomeId = outcome.quoteOutcomeId ?? canonicalQuoteOutcomeId(outcome.name);
        return {
          rowId: outcome.id,
          marketId: outcomeMarketId,
          canonicalMarketIds: canonicalIdsForTerminalOutcome(
            outcomeMarketId,
            outcome.canonicalMarketIds,
            terminalMarket.canonicalMarketIds,
            currentOutcomes.length,
          ),
          outcomeId: quoteOutcomeId,
        };
      })
      .filter((item) => Boolean(item.marketId && item.outcomeId));
    try {
      const prices: MarketLivePriceItem[] = [];
      for (let index = 0; index < requestItems.length; index += TERMINAL_LIVE_PRICE_BATCH_SIZE) {
        const chunk = requestItems.slice(index, index + TERMINAL_LIVE_PRICE_BATCH_SIZE);
        const response = await getMarketLivePrices({
          items: chunk.map((item) => ({
            marketId: item.marketId,
            canonicalMarketIds: item.canonicalMarketIds,
            outcomeId: item.outcomeId,
          })),
        });
        prices.push(...response.prices);
      }
      const priceByKey = new Map(prices.map((price) => [`${price.marketId}:${price.outcomeId ?? ''}`, price]));
      setTerminalOutcomes((current) => current.map((outcome) => {
        const outcomeMarketId = outcome.marketId ?? terminalMarketId;
        const quoteOutcomeId = outcome.quoteOutcomeId ?? canonicalQuoteOutcomeId(outcome.name);
        const livePrice =
          priceByKey.get(`${outcomeMarketId}:${quoteOutcomeId}`) ??
          prices.find((price) =>
            canonicalIdsForTerminalOutcome(outcomeMarketId, outcome.canonicalMarketIds, terminalMarket.canonicalMarketIds, current.length)
              .includes(price.marketId) &&
            streamOutcomeMatches(price.outcomeId ?? quoteOutcomeId, quoteOutcomeId)
          );
        const parsedPrice = orderbookNumericValue(livePrice?.price ?? livePrice?.bestAsk ?? livePrice?.midpoint ?? livePrice?.bestBid);
        if (parsedPrice === null) return outcome;
        const yesPrice = formatProbabilityPrice(parsedPrice);
        const noPrice = terminalMarket.marketType === 'binary' ? formatProbabilityPrice(1 - parsedPrice) : '-';
        const quoteVenues = livePrice?.linkedVenues?.length
          ? livePrice.linkedVenues
          : livePrice?.venues?.length
            ? livePrice.venues
            : outcome.venues;
        const liveQuoteVenues = livePrice?.liveVenues?.length
          ? livePrice.liveVenues
          : livePrice?.venues ?? [];
        return {
          ...outcome,
          prob: formatProbabilityPercent(parsedPrice),
          yesPrice,
          noPrice,
          primaryVenue: livePrice?.bestVenue ?? outcome.primaryVenue ?? quoteVenues[0] ?? null,
          venueQuotes: livePrice?.bestVenue
            ? placeholderVenueQuotes(liveQuoteVenues.length ? liveQuoteVenues : [livePrice.bestVenue], yesPrice, noPrice, null)
            : outcome.venueQuotes,
          venues: quoteVenues.length ? quoteVenues : outcome.venues,
          status: 'live',
          blocker: null,
        };
      }));
    } catch {
      // Keep websocket/orderbook prices and last-good rows visible; the next active-market refresh will retry.
    }
  }, [terminalMarket.canonicalMarketIds, terminalMarket.marketType, terminalMarketId]);

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
    setTicketOrchestratorOrder(null);
    setTicketOrchestratorAmount(null);
    setTicketOrchestratorAutoRenewFailed(false);
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
    const backendAmount = formatRouteAmount(requestedShares);
    setTicketLoading(true);
    setTicketError(null);
    setTicketStatusMessage(side === 'sell' ? 'Checking verified sellable shares before routing the sell.' : null);
    setTicketQuote(null);
    setTicketLiveReadiness(null);
    setTicketReadinessNextCheckAt(null);
    setTicketExecutionId(null);
    setTicketSignatureBundle(null);
    try {
      if (side === 'sell') {
        const positionsResponse = await getPositions(token, { limit: 100 });
        const activePositions = activeTerminalPositions(positionsResponse.positions, terminalMarketId);
        setPositions(activePositions);
        const freshSellableShares = sellableSharesForPositions(activePositions, selectedTicketMarketId, selectedTicketQuoteOutcomeId);
        if (freshSellableShares <= 0) {
          setTicketError('No verified sellable shares are available for this outcome.');
          setTicketStatusMessage('Sell routing is disabled until backend position verification confirms venue shares for this outcome.');
          return;
        }
        if (requestedShares > freshSellableShares) {
          setTicketError(`You can sell up to ${formatSignedShares(freshSellableShares)} for this outcome.`);
          setTicketStatusMessage('Refresh positions or lower the sell amount before previewing the route.');
          return;
        }
      }
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
      const response = side === 'sell'
        ? await prepareExitQuote(token, {
          sellMode: 'SELL_ALL',
          sizeMode: 'CUSTOM_AMOUNT',
          amount: backendAmount,
          marketId: selectedTicketMarketId,
          outcomeId: selectedTicketQuoteOutcomeId,
          candidates: liveCandidates.candidates,
        })
        : await createExecutionQuote(token, {
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
        const readinessBlocker = firstReadinessBlocker(readiness);
        if (readinessBlocker) {
          if (side === 'sell' && isPolymarketSellShareBalanceBlocked(readiness)) {
            const positionsResponse = await getPositions(token, { limit: 100 });
            setPositions(activeTerminalPositions(positionsResponse.positions, terminalMarketId));
            setTicketQuote(null);
            setTicketQuoteAmount(null);
            setTicketExecutionId(null);
            setTicketSignatureBundle(null);
            setOrderAction('setup');
            setTicketError('No verified Polymarket shares are available to sell for this outcome.');
            setTicketStatusMessage('The live venue share check returned zero spendable shares, so this stale sell route was cleared.');
            return;
          }
          const blockerCopy = readinessBlocker.blocker;
          const venueLabel = formatVenueLabel(readinessBlocker.venue);
          const pendingPolymarketReadiness = isPolymarketClobPropagationReadiness(readiness);
          setTicketError(`${venueLabel}: ${blockerCopy}`);
          setTicketStatusMessage(pendingPolymarketReadiness
            ? 'Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.'
            : /ALLOWANCE|APPROVE/i.test(blockerCopy)
              ? `${venueLabel} route is priced, but collateral approval is required before signing.`
              : `${venueLabel} route is priced, but live submit is blocked until collateral readiness clears.`);
          return;
        }
      } catch {
        setTicketLiveReadiness(null);
      }
      setTicketStatusMessage('Live market quote ready. Review the route before placing the order.');
    } catch (error) {
      if (side === 'sell' && error instanceof ApiClientError && (
        error.code === 'NO_EXECUTABLE_EXIT_ROUTE' ||
        error.code === 'NO_SELLABLE_SHARES'
      )) {
        const payload = error.payload && typeof error.payload === 'object' ? error.payload as Record<string, unknown> : {};
        const readiness = payload.readiness;
        if (readiness && typeof readiness === 'object') {
          setTicketLiveReadiness(readiness as LiveSubmitReadinessSnapshot);
        }
        setTicketQuote(null);
        setTicketQuoteAmount(null);
        setTicketExecutionId(null);
        setTicketSignatureBundle(null);
        setOrderAction('setup');
        setTicketStatusMessage('Sell routing is disabled until backend position verification confirms venue shares for this outcome.');
      }
      setTicketError(error instanceof Error ? error.message : 'Live market quote failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [backendVenueList, fundingError, fundingLoading, selectedTicketMarketId, selectedTicketOutcome, selectedTicketQuoteOutcomeId, side, terminalMarketId, ticketAmount, ticketOutcomeSide, token]);

  React.useEffect(() => {
    if (side !== 'sell') return;
    if (ticketSellableShares > 0) return;
    if (!ticketQuote && !ticketExecutionId && !ticketLiveReadiness && !ticketSignatureBundle) return;
    setTicketQuote(null);
    setTicketQuoteAmount(null);
    setTicketExecutionId(null);
    setTicketSignatureBundle(null);
    setTicketLiveReadiness(null);
    setTicketReadinessNextCheckAt(null);
    setOrderAction('setup');
    if (ticketAmount.trim()) {
      setTicketStatusMessage('No verified sellable shares are available for this outcome.');
    }
  }, [
    side,
    ticketAmount,
    ticketExecutionId,
    ticketLiveReadiness,
    ticketQuote,
    ticketSellableShares,
    ticketSignatureBundle,
  ]);

  const signTicketSignatureRequests = useCallback(async (
    signatureRequests: Array<ExecutionOrderSignatureRequest | SignatureBundle['signatureRequests'][number]>,
  ): Promise<ExecutionOrderSignedPayload[]> => {
    if (signatureRequests.length === 0) {
      throw new Error('This order requires a wallet signature, but no signature request was returned.');
    }
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
    const signedPayloads: ExecutionOrderSignedPayload[] = [];
    for (const request of signatureRequests) {
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
      signedPayloads.push({
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
    return signedPayloads;
  }, [handleLogin, refreshWallets, session?.turnkeyOrganizationId, signMessage, turnkeySession?.organizationId, turnkeyWallets]);

  const signAndSubmitTicketSignature = useCallback(async (bundle: SignatureBundle, executionId: string) => {
    if (!token) return;
    if (ticketQuoteAmount !== null && ticketQuoteAmount !== ticketAmount.trim()) {
      setTicketError('The visible amount changed after this route was quoted. Preview the route again before signing.');
      setTicketStatusMessage(null);
      setTicketSignatureBundle(null);
      setTicketExecutionId(null);
      return;
    }
    if (isReadinessBlocked(ticketLiveReadiness)) {
      const blocked = firstReadinessBlocker(ticketLiveReadiness);
      setTicketError(`${formatVenueLabel(blocked?.venue ?? 'Venue')}: ${blocked?.blocker ?? 'Live submit readiness is blocked.'}`);
      setTicketStatusMessage(isPolymarketClobPropagationReadiness(ticketLiveReadiness)
        ? 'Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.'
        : 'This route must clear live readiness before wallet signing.');
      return;
    }
    const latestReadiness = await getLiveReadiness(token, executionId);
    setTicketLiveReadiness(latestReadiness);
    if (isReadinessBlocked(latestReadiness)) {
      const blocked = firstReadinessBlocker(latestReadiness);
      setTicketError(`${formatVenueLabel(blocked?.venue ?? 'Venue')}: ${blocked?.blocker ?? 'Live submit readiness is blocked.'}`);
      setTicketStatusMessage(isPolymarketClobPropagationReadiness(latestReadiness)
        ? 'Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.'
        : 'This route must clear live readiness before wallet signing.');
      return;
    }
    if (bundle.signatureRequests.length === 0) {
      setTicketError('This route requires a wallet signature, but no signature request was returned.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    try {
      const signedLegs = await signTicketSignatureRequests(bundle.signatureRequests);
      setTicketStatusMessage('Wallet signature collected. Submitting signed market order to Lotus backend.');
      const submitted = await submitSignedBundle(token, executionId, signedLegs, false);
      setTicketExecutionId(submitted.executionId);
      setTicketSignatureBundle(null);
      void getPositions(token, { limit: 100 })
        .then((positionsResponse) => {
          setPositions(activeTerminalPositions(positionsResponse.positions, terminalMarketId));
        })
        .catch(() => undefined);
      const submittedStatus = (submitted.status ?? submitted.userStatus ?? 'SUBMITTED').toUpperCase();
      if (submittedStatus === 'FAILED') {
        setTicketStatusMessage('Market order failed at venue submit.');
        setTicketError(executionFailureMessage(submitted));
        setBottomTab('Trade History');
        return;
      }
      setTicketStatusMessage(executionSubmitStatusMessage(submitted));
      setBottomTab(submittedStatus === 'SUBMITTED' || submittedStatus === 'PARTIAL' ? 'Open Orders' : 'Trade History');
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Wallet signature or signed submit failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [signTicketSignatureRequests, terminalMarketId, ticketAmount, ticketLiveReadiness, ticketQuoteAmount, token]);

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
      const readiness = await getLiveReadiness(token, executionId);
      setTicketLiveReadiness(readiness);
      if (isReadinessBlocked(readiness)) {
        if (side === 'sell' && isPolymarketSellShareBalanceBlocked(readiness)) {
          const positionsResponse = await getPositions(token, { limit: 100 });
          setPositions(activeTerminalPositions(positionsResponse.positions, terminalMarketId));
          setTicketQuote(null);
          setTicketQuoteAmount(null);
          setTicketExecutionId(null);
          setTicketSignatureBundle(null);
          setOrderAction('setup');
          setTicketError('No verified Polymarket shares are available to sell for this outcome.');
          setTicketStatusMessage('The live venue share check returned zero spendable shares, so this stale sell route was cleared.');
          return;
        }
        const blocked = firstReadinessBlocker(readiness);
        setTicketExecutionId(executionId);
        setTicketError(`${formatVenueLabel(blocked?.venue ?? 'Venue')}: ${blocked?.blocker ?? 'Live submit readiness is blocked.'}`);
        setTicketStatusMessage(isPolymarketClobPropagationReadiness(readiness)
          ? 'Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.'
          : 'This route must clear live readiness before live submit.');
        return;
      }

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
          setPositions(activeTerminalPositions(positionsResponse.positions, terminalMarketId));
        })
        .catch(() => undefined);
      const submittedStatus = (submitted.status ?? submitted.userStatus ?? 'SUBMITTED').toUpperCase();
      if (submittedStatus === 'FAILED') {
        setTicketStatusMessage('Market order failed at venue submit.');
        setTicketError(executionFailureMessage(submitted));
        setBottomTab('Trade History');
        return;
      }
      setTicketStatusMessage(executionSubmitStatusMessage(submitted));
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
  }, [side, signAndSubmitTicketSignature, terminalMarketId, ticketAmount, ticketQuote, ticketQuoteAmount, token]);

  const prepareTicketSignature = useCallback(async () => {
    if (!token || !ticketQuote) return;
    if (ticketQuoteAmount !== null && ticketQuoteAmount !== ticketAmount.trim()) {
      setTicketError('The visible amount changed after this route was quoted. Preview the route again before signing.');
      setTicketStatusMessage(null);
      setTicketSignatureBundle(null);
      setTicketExecutionId(null);
      return;
    }
    if (isReadinessBlocked(ticketLiveReadiness)) {
      const blocked = firstReadinessBlocker(ticketLiveReadiness);
      setTicketError(`${formatVenueLabel(blocked?.venue ?? 'Venue')}: ${blocked?.blocker ?? 'Live submit readiness is blocked.'}`);
      setTicketStatusMessage(isPolymarketClobPropagationReadiness(ticketLiveReadiness)
        ? 'Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.'
        : 'This route must clear live readiness before wallet signing.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    try {
      const executionId = ticketExecutionId ?? (await submitExecutionQuote(token, ticketQuote.quoteId)).executionId;
      setTicketExecutionId(executionId);
      const readiness = await getLiveReadiness(token, executionId);
      setTicketLiveReadiness(readiness);
      if (isReadinessBlocked(readiness)) {
        if (side === 'sell' && isPolymarketSellShareBalanceBlocked(readiness)) {
          const positionsResponse = await getPositions(token, { limit: 100 });
          setPositions(activeTerminalPositions(positionsResponse.positions, terminalMarketId));
          setTicketQuote(null);
          setTicketQuoteAmount(null);
          setTicketExecutionId(null);
          setTicketSignatureBundle(null);
          setOrderAction('setup');
          setTicketError('No verified Polymarket shares are available to sell for this outcome.');
          setTicketStatusMessage('The live venue share check returned zero spendable shares, so this stale sell route was cleared.');
          return;
        }
        const blocked = firstReadinessBlocker(readiness);
        setTicketError(`${formatVenueLabel(blocked?.venue ?? 'Venue')}: ${blocked?.blocker ?? 'Live submit readiness is blocked.'}`);
        setTicketStatusMessage(isPolymarketClobPropagationReadiness(readiness)
          ? 'Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.'
          : 'This route must clear live readiness before wallet signing.');
        return;
      }
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
  }, [side, terminalMarketId, ticketAmount, ticketExecutionId, ticketLiveReadiness, ticketQuote, ticketQuoteAmount, token]);

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
    setTicketOrchestratorOrder(null);
    setTicketOrchestratorAmount(null);
    setTicketOrchestratorAutoRenewFailed(false);
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

  const activateOpinionTradingSafe = useCallback(async () => {
    if (!token) {
      setTicketError('Log in before enabling Opinion trading.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    setTicketStatusMessage('Preparing Opinion enable-trading Safe transaction.');
    try {
      const prepared = await prepareVenueSetupBatch(token);
      const opinionAccount = prepared.accounts.find((account) => account.venue.toUpperCase() === 'OPINION');
      const setupRequests = [
        ...(prepared.setupRequests ?? []),
        ...(prepared.signatureRequests ?? []),
      ];
      const setupRequest = setupRequests.find(isOpinionEnableTradingRequest);

      if (!setupRequest) {
        if (opinionAccount?.status === 'ACTIVE' && (opinionAccount.readinessBlockers ?? []).length === 0) {
          setTicketStatusMessage('Opinion account is active. Refreshing the live route.');
          setTicketQuote(null);
          setTicketQuoteAmount(null);
          setTicketExecutionId(null);
          setTicketSignatureBundle(null);
          setTicketLiveReadiness(null);
          setTicketError(null);
          await previewMarketOrder();
          return;
        }
        const blocker = opinionAccount?.readinessBlockers?.[0] ?? opinionAccount?.setupInstructions?.[0];
        setTicketError(blocker ?? 'Opinion setup is not ready yet. Open Portfolio and retry venue setup.');
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
          setTicketStatusMessage('Reconnect your Turnkey wallet session to enable Opinion trading.');
          await handleLogin();
          activeWallets = await refreshWallets();
        }
      }

      const walletAccount = findTurnkeyWalletAccount(activeWallets, setupRequest.signer);
      if (!walletAccount) {
        throw new Error(`Opinion setup needs your Turnkey EVM wallet ${setupRequest.signer.slice(0, 6)}...${setupRequest.signer.slice(-4)}, but it is not loaded in this session.`);
      }

      const organizationId = turnkeySession?.organizationId ?? session?.turnkeyOrganizationId;
      setTicketStatusMessage('Sign the Opinion enable-trading Safe transaction with Turnkey.');
      const signatureResult = await signMessage({
        message: eip712PayloadForTurnkey(setupRequest.typedData),
        walletAccount,
        encoding: 'PAYLOAD_ENCODING_EIP712',
        hashFunction: 'HASH_FUNCTION_NO_OP',
        addEthereumPrefix: false,
        ...(organizationId ? { organizationId } : {}),
      });

      setTicketStatusMessage('Submitting Opinion enable-trading signature to Lotus.');
      const completed = await completeVenueSetupBatch(token, {
        opinion: {
          signer: setupRequest.signer,
          signature: signatureFromTurnkeyResult(signatureResult),
          safeTxHash: setupRequest.safeTxHash,
        },
      });
      const completedAccount = completed.accounts.find((account) => account.venue.toUpperCase() === 'OPINION');
      const blockers = completedAccount?.readinessBlockers ?? [];
      if (!completedAccount || completedAccount.status !== 'ACTIVE' || blockers.length > 0) {
        setTicketError(blockers[0] ?? 'Opinion enable-trading is still pending.');
        setTicketStatusMessage(null);
        return;
      }

      setTicketStatusMessage('Opinion trading enabled. Refreshing the live route.');
      setTicketQuote(null);
      setTicketQuoteAmount(null);
      setTicketExecutionId(null);
      setTicketSignatureBundle(null);
      setTicketLiveReadiness(null);
      setTicketError(null);
      await previewMarketOrder();
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Opinion trading enablement failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [handleLogin, previewMarketOrder, refreshWallets, session?.turnkeyOrganizationId, signMessage, token, turnkeySession?.organizationId, turnkeyWallets]);

  const approveRouteCollateral = useCallback(async () => {
    const readinessVenue = ticketLiveReadiness?.venues.find((venue) =>
      isReadinessVenueBlocked(venue) &&
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

  const refreshPolymarketClobReadiness = useCallback(async (options: { quiet?: boolean; poll?: boolean } = {}) => {
    if (!token) {
      setTicketError('Log in before refreshing Polymarket CLOB readiness.');
      return;
    }
    const readinessId = ticketQuote?.quoteId ?? ticketExecutionId;
    if (!readinessId) {
      await previewMarketOrder();
      return;
    }
    const quiet = options.quiet === true;
    if (!quiet) setTicketLoading(true);
    setTicketReadinessPolling(true);
    setTicketReadinessNextCheckAt(null);
    if (!quiet) setTicketError(null);
    try {
      setTicketStatusMessage('Checking Polymarket live submit readiness.');
      const readiness = await getLiveReadiness(token, readinessId);
      setTicketLiveReadiness(readiness);
      const blocked = firstReadinessBlocker(readiness);
      if (!blocked) {
        setTicketError(null);
        setTicketReadinessNextCheckAt(null);
        setTicketStatusMessage('Polymarket live collateral is ready. Continue with submit.');
        return;
      }
      setTicketError(`${formatVenueLabel(blocked.venue)}: ${blocked.blocker}`);
      if (!isPolymarketClobPropagationReadiness(readiness)) {
        setTicketReadinessNextCheckAt(null);
        setTicketStatusMessage('Live submit is still blocked by venue readiness.');
        return;
      }
      setTicketReadinessNextCheckAt(Date.now() + POLYMARKET_LIVE_READINESS_POLL_MS);
      setTicketStatusMessage('Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.');
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Polymarket CLOB readiness refresh failed.');
      setTicketStatusMessage(null);
    } finally {
      if (!quiet) setTicketLoading(false);
      setTicketReadinessPolling(false);
    }
  }, [previewMarketOrder, ticketExecutionId, ticketQuote?.quoteId, token]);

  const syncPolymarketClobReadiness = useCallback(async () => {
    if (!token) {
      setTicketError('Log in before syncing Polymarket CLOB readiness.');
      return;
    }
    setTicketLoading(true);
    setTicketError(null);
    setTicketStatusMessage('Preparing Polymarket CLOB sync signature.');
    try {
      const prepared = await preparePolymarketClobSync(token);
      const sync = prepared.sync;
      let activeWallets = turnkeyWallets;
      if (activeWallets.length === 0) {
        try {
          activeWallets = await refreshWallets();
        } catch (walletError) {
          if (!isTurnkeyMissingSessionError(walletError)) {
            throw walletError;
          }
          setTicketStatusMessage('Reconnect your Turnkey wallet session to sync Polymarket CLOB readiness.');
          await handleLogin();
          activeWallets = await refreshWallets();
        }
      }

      const signerAccount = findTurnkeyWalletAccount(activeWallets, sync.signer);
      if (!signerAccount) {
        throw new Error(`Polymarket CLOB sync needs your Turnkey EVM wallet ${sync.signer.slice(0, 6)}...${sync.signer.slice(-4)}, but it is not loaded in this session.`);
      }

      const organizationId = turnkeySession?.organizationId ?? session?.turnkeyOrganizationId;
      setTicketStatusMessage('Sign the Polymarket CLOB sync challenge with Turnkey.');
      const signatureResult = await signMessage({
        message: eip712PayloadForTurnkey(sync.typedData),
        walletAccount: signerAccount,
        encoding: 'PAYLOAD_ENCODING_EIP712',
        hashFunction: 'HASH_FUNCTION_NO_OP',
        addEthereumPrefix: false,
        ...(organizationId ? { organizationId } : {}),
      });

      setTicketStatusMessage('Submitting Polymarket CLOB sync to Lotus.');
      const submitted = await submitPolymarketClobSync(token, {
        signedPayload: clobSyncSignedPayload(sync, signatureFromTurnkeyResult(signatureResult)),
      });
      const accountSnapshot = await getAccountSnapshot(token, { force: true });
      setFundingBalances((current) => mergeVenueBalanceSnapshots(current, accountSnapshot.balances ?? []));
      setFundingActivations(accountSnapshot.activations ?? []);

      const readinessId = ticketQuote?.quoteId ?? ticketExecutionId;
      if (readinessId) {
        try {
          setTicketLiveReadiness(await getLiveReadiness(token, readinessId));
        } catch {
          setTicketLiveReadiness(null);
        }
      }

      setTicketExecutionId(null);
      setTicketSignatureBundle(null);
      setTicketLiveCandidates(null);
      if (submitted.sync.status === 'READY') {
        setTicketPolymarketClobSyncConfirmed(true);
        setTicketStatusMessage('Polymarket CLOB sync confirmed. Checking live collateral propagation.');
        if (readinessId) {
          await refreshPolymarketClobReadiness({ poll: true });
        } else {
          setTicketQuote(null);
          setTicketQuoteAmount(null);
          setTicketLiveReadiness(null);
          await previewMarketOrder();
        }
      } else {
        setTicketStatusMessage('Polymarket CLOB sync submitted. Retry preview after propagation completes.');
      }
    } catch (error) {
      setTicketError(error instanceof Error ? error.message : 'Polymarket CLOB sync failed.');
    } finally {
      setTicketLoading(false);
    }
  }, [
    handleLogin,
    previewMarketOrder,
    refreshWallets,
    refreshPolymarketClobReadiness,
    session?.turnkeyOrganizationId,
    signMessage,
    ticketExecutionId,
    ticketQuote?.quoteId,
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
        const nextBalances = accountSnapshot.balances ?? [];
        const nextActivations = accountSnapshot.activations ?? [];
        setFundingBalances((current) => mergeVenueBalanceSnapshots(current, nextBalances));
        setFundingActivations(nextActivations);
        const polymarket = nextActivations.find((item) => toBackendVenueId(item.venue) === 'POLYMARKET');
        if (polymarketActivationConfirmed(polymarket) || nextBalances.some(polymarketBalanceConfirmsTradeReadiness)) {
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
    const fullOutcomeInterval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refreshOutcomes();
    }, TERMINAL_FULL_OUTCOME_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(fullOutcomeInterval);
    };
  }, [refreshOutcomes]);

  React.useEffect(() => {
    if (!terminalMarketId || selectedOutcomeRefreshKey.startsWith('none:')) return;
    void refreshAllOutcomePrices();
    const activeMarketPriceInterval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refreshAllOutcomePrices();
    }, TERMINAL_ALL_OUTCOME_PRICE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(activeMarketPriceInterval);
  }, [refreshAllOutcomePrices, selectedOutcomeRefreshKey, terminalMarketId]);

  React.useEffect(() => {
    let cancelled = false;
    const requestKey = `${orderbookMarketId ?? 'none'}:${orderbookQuoteOutcomeId ?? 'none'}`;
    if (!orderbookMarketId) {
      orderbookRef.current = null;
      orderbookChecksumValidationSeqRef.current += 1;
      setOrderbook(null);
      setOrderbookError(null);
      setOrderbookStreamTopics([]);
      setOrderbookLoading(false);
      return;
    }
    if (orderbookNotFoundKey === requestKey) return;

    const localTopics = orderbookStreamMarketIds.map((marketId) => orderbookTopicForSelection(marketId, orderbookQuoteOutcomeId));
    const loadFallbackOrderbook = async () => {
      if (orderbookRestRecoveryInFlightRef.current) return;
      orderbookRestRecoveryInFlightRef.current = true;
      lastOrderbookRestRecoveryAtRef.current = Date.now();
      try {
        const response = await getMarketOrderbook(orderbookMarketId, {
          outcomeId: orderbookQuoteOutcomeId,
          depth: 20,
        });
        if (!cancelled) {
          orderbookRef.current = response;
          setOrderbook(response);
          const nextTopics = mergeOrderbookStreamTopics(localTopics, normalizeOrderbookStreamTopics(response.stream?.topics));
          setOrderbookStreamTopics((current) => sameTopicList(current, nextTopics) ? current : nextTopics);
          setOrderbookNotFoundKey(null);
          setOrderbookError(null);
          lastOrderbookWsUpdateAtRef.current = Date.now();
        }
      } catch (error) {
        if (!cancelled) {
          orderbookRef.current = null;
          setOrderbook(null);
          if (isApiNotFound(error, 'MARKET_NOT_FOUND')) {
            setOrderbookNotFoundKey(requestKey);
            setOrderbookStreamTopics([]);
          } else {
            setOrderbookStreamTopics((current) => sameTopicList(current, localTopics) ? current : localTopics);
          }
          setOrderbookError(safeMarketDataError(error, 'orderbook'));
        }
      } finally {
        orderbookRestRecoveryInFlightRef.current = false;
        if (!cancelled) setOrderbookLoading(false);
      }
    };

    const refreshOrderbook = () => {
      setLatestOrderbookStream(null);
      orderbookRef.current = null;
      orderbookChecksumValidationSeqRef.current += 1;
      setOrderbook(null);
      setOrderbookStreamTopics((current) => sameTopicList(current, localTopics) ? current : localTopics);
      setOrderbookLoading(true);
      setOrderbookError(null);
      lastOrderbookWsUpdateAtRef.current = null;
      lastOrderbookRestRecoveryAtRef.current = null;
    };
    void refreshOrderbook();
    orderbookStreamSeqRef.current.clear();
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled || lastOrderbookWsUpdateAtRef.current !== null) return;
      void loadFallbackOrderbook();
    }, ORDERBOOK_DISPLAY_REST_FALLBACK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [orderbookMarketId, orderbookNotFoundKey, orderbookQuoteOutcomeId, orderbookStreamMarketIds]);

  React.useEffect(() => {
    if (!orderbookMarketId || orderbookStreamTopics.length === 0) {
      setOrderbookWsState('idle');
      setLatestOrderbookStream(null);
      return;
    }

    let active = true;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;
    let client: ReturnType<typeof openExecutionSocket> | null = null;
    const topics = [...new Set(orderbookStreamTopics)];
    const topicSet = new Set(topics);
    const expectedMarketId = orderbookMarketId;
    const expectedMarketAliases = new Set(orderbookStreamMarketIds);
    const expectedOutcomeId = orderbookQuoteOutcomeId ?? null;
    const localTopics = orderbookStreamMarketIds.map((marketId) => orderbookTopicForSelection(marketId, expectedOutcomeId));

    const clearScheduledRestRecovery = () => {
      if (orderbookRestRecoveryTimerRef.current !== null) {
        window.clearTimeout(orderbookRestRecoveryTimerRef.current);
        orderbookRestRecoveryTimerRef.current = null;
      }
    };

    const recoverOrderbookFromRest = async () => {
      const now = Date.now();
      const lastRestRecoveryAt = lastOrderbookRestRecoveryAtRef.current;
      if (lastRestRecoveryAt !== null && now - lastRestRecoveryAt < ORDERBOOK_REST_RECOVERY_MIN_INTERVAL_MS) {
        scheduleRestRecovery(ORDERBOOK_REST_RECOVERY_MIN_INTERVAL_MS - (now - lastRestRecoveryAt));
        return;
      }
      if (orderbookRestRecoveryInFlightRef.current) return;
      orderbookRestRecoveryInFlightRef.current = true;
      lastOrderbookRestRecoveryAtRef.current = now;
      try {
        const response = await getMarketOrderbook(expectedMarketId, {
          outcomeId: expectedOutcomeId,
          depth: 20,
        });
        if (!active) return;
        orderbookRef.current = response;
        setOrderbook(response);
        const nextTopics = mergeOrderbookStreamTopics(localTopics, normalizeOrderbookStreamTopics(response.stream?.topics));
        setOrderbookStreamTopics((current) => sameTopicList(current, nextTopics) ? current : nextTopics);
        setOrderbookError(null);
        lastOrderbookWsUpdateAtRef.current = Date.now();
      } catch (error) {
        if (active) setOrderbookError(safeMarketDataError(error, 'orderbook'));
      } finally {
        orderbookRestRecoveryInFlightRef.current = false;
        if (active && !orderbookRef.current) scheduleRestRecovery(ORDERBOOK_REST_RECOVERY_MIN_INTERVAL_MS);
      }
    };

    const scheduleRestRecovery = (delayMs: number) => {
      clearScheduledRestRecovery();
      orderbookRestRecoveryTimerRef.current = window.setTimeout(() => {
        orderbookRestRecoveryTimerRef.current = null;
        void recoverOrderbookFromRest();
      }, delayMs);
    };

    const markStreamResyncing = () => {
      setLatestOrderbookStream((current) => current
        ? { ...current, snapshotStatus: 'resyncing' }
        : {
            marketId: expectedMarketId,
            outcomeId: expectedOutcomeId,
            snapshotStatus: 'resyncing',
            blockers: [],
          });
    };

    const validateStreamChecksumOrRecover = (
      nextOrderbook: MarketOrderbookResponse,
      payload: MarketOrderbookStreamPayload
    ) => {
      const validationSeq = ++orderbookChecksumValidationSeqRef.current;
      void validateOrderbookStreamChecksum(nextOrderbook, payload, expectedMarketId, expectedOutcomeId)
        .then((valid) => {
          if (!active || validationSeq !== orderbookChecksumValidationSeqRef.current || valid) return;
          markStreamResyncing();
          scheduleRestRecovery(ORDERBOOK_STREAM_GAP_RECOVERY_DELAY_MS);
        })
        .catch(() => {
          // Display checksum validation is a recovery guard; crypto/runtime failures should not break live streaming.
        });
    };

    const acceptsStreamSequence = (topic: ExecutionTopic, payload: MarketOrderbookStreamPayload): boolean => {
      if (typeof payload.seq !== 'number' || !Number.isFinite(payload.seq)) return true;
      if (payload.updateType === 'snapshot' || payload.source === 'initial_snapshot') {
        orderbookStreamSeqRef.current.set(topic, payload.seq);
        return true;
      }
      const lastSeq = orderbookStreamSeqRef.current.get(topic);
      if (typeof lastSeq === 'number' && payload.seq <= lastSeq) return false;
      if (typeof lastSeq === 'number' && payload.seq > lastSeq + 1) {
        markStreamResyncing();
        scheduleRestRecovery(ORDERBOOK_STREAM_GAP_RECOVERY_DELAY_MS);
      }
      orderbookStreamSeqRef.current.set(topic, payload.seq);
      return true;
    };

    const applyStreamPriceToOutcomes = (payload: MarketOrderbookStreamPayload) => {
      const quotePrice = orderbookNumericValue(payload.bestAsk ?? payload.bestBid);
      const diagnosticsEnabled = lotusMarketDiagnosticsEnabled();
      const blocker = (payload.blockers ?? []).map(normalizeStreamBlocker).find(Boolean) ?? null;
      if (quotePrice === null && (!blocker || !diagnosticsEnabled)) return;
      const payloadVenue = payload.venue ?? null;
      const effectiveOutcomeId = streamPayloadOutcomeId(payload) ?? expectedOutcomeId ?? (marketType === 'binary' ? 'YES' : null);
      if (!effectiveOutcomeId && marketType !== 'binary') return;
      const displayBlocker = diagnosticsEnabled ? blocker : null;
      setTerminalOutcomes((current) => current.map((outcome) => {
        const payloadMarketId = streamPayloadMarketId(payload);
        if (payloadMarketId && !terminalOutcomeMatchesMarketAlias(outcome, payloadMarketId, expectedMarketId)) return outcome;
        if (!payloadMarketId && outcome.marketId !== expectedMarketId) return outcome;
        if (!streamOutcomeMatches(effectiveOutcomeId, outcome.quoteOutcomeId)) return outcome;
        const yesPrice = quotePrice !== null ? formatProbabilityPrice(quotePrice) : '-';
        const noPrice = quotePrice !== null && marketType === 'binary' ? formatProbabilityPrice(1 - quotePrice) : '-';
        if (!payloadVenue) {
          return {
            ...outcome,
            yesPrice: quotePrice !== null ? yesPrice : outcome.yesPrice,
            noPrice: quotePrice !== null ? noPrice : outcome.noPrice,
            status: quotePrice !== null ? 'live' : outcome.status,
            blocker: displayBlocker ?? outcome.blocker,
          };
        }
        const nextVenueQuote: TerminalVenueQuote = {
          venue: payloadVenue,
          yesPrice,
          noPrice,
          blocker: displayBlocker,
        };
        const venueQuotes = [
          ...outcome.venueQuotes.filter((quote) => toBackendVenueId(quote.venue) !== toBackendVenueId(payloadVenue)),
          nextVenueQuote,
        ];
        const primaryQuote = quotePrice !== null && (!outcome.primaryVenue || toBackendVenueId(outcome.primaryVenue) === toBackendVenueId(payloadVenue))
          ? nextVenueQuote
          : null;
        return {
          ...outcome,
          yesPrice: primaryQuote?.yesPrice ?? outcome.yesPrice,
          noPrice: primaryQuote?.noPrice ?? outcome.noPrice,
          primaryVenue: outcome.primaryVenue ?? payloadVenue,
          venueQuotes,
          status: quotePrice !== null ? 'live' : outcome.status,
          blocker: displayBlocker ?? outcome.blocker,
        };
      }));
    };

    const subscribeAll = () => {
      for (const topic of topics) client?.subscribe(topic);
    };

    const subscribeOnGatewayReady = (message: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(message.data)) as { type?: string };
        if (parsed.type === 'GATEWAY_READY') subscribeAll();
      } catch {
        // Ignore non-JSON keepalive frames.
      }
    };

    const connect = () => {
      if (!active) return;
      client = openExecutionSocket({
        onStateChange: (state) => {
          if (!active) return;
          setOrderbookWsState(state);
          if (state === 'open') {
            reconnectAttempt = 0;
          }
          if (state === 'closed' || state === 'error') {
            scheduleRestRecovery(ORDERBOOK_STREAM_GAP_RECOVERY_DELAY_MS);
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            const delay = Math.min(8_000, 750 * Math.max(1, 2 ** reconnectAttempt));
            reconnectAttempt += 1;
            reconnectTimer = window.setTimeout(connect, delay);
          }
        },
        onEvent: (event) => {
          if (!active || !topicSet.has(event.topic) || !isMarketOrderbookStreamPayload(event.payload)) return;
          const payload = event.payload;
          if (!acceptsStreamSequence(event.topic, payload)) return;
          const payloadMarketId = streamPayloadMarketId(payload);
          const payloadOutcomeId = streamPayloadOutcomeId(payload);
          if (payloadMarketId && !expectedMarketAliases.has(payloadMarketId)) return;
          if (payloadOutcomeId && !streamOutcomeMatches(payloadOutcomeId, expectedOutcomeId)) return;

          lastOrderbookWsUpdateAtRef.current = Date.now();

          if (event.type === 'MARKET_ORDERBOOK_UPDATE') {
            if (isOrderbookInitialSnapshotPayload(payload)) {
              const nextOrderbook = normalizeOrderbookInitialSnapshot(
                payload,
                orderbookRef.current,
                expectedMarketId,
                expectedOutcomeId
              );
              orderbookRef.current = nextOrderbook;
              setOrderbook(nextOrderbook);
              validateStreamChecksumOrRecover(nextOrderbook, payload);
              applyStreamPriceToOutcomes(payload);
              setOrderbookLoading(false);
              setOrderbookError(null);
              return;
            }
            if (!payload.venue) return;
            setLatestOrderbookStream(payload);
            const nextOrderbook = mergeOrderbookStreamUpdate(orderbookRef.current, payload);
            orderbookRef.current = nextOrderbook;
            setOrderbook(nextOrderbook);
            validateStreamChecksumOrRecover(nextOrderbook, payload);
            applyStreamPriceToOutcomes(payload);
            setOrderbookLoading(false);
            setOrderbookError(null);
            return;
          }

          if (event.type === 'MARKET_QUOTE_UPDATE') {
            applyStreamPriceToOutcomes(payload);
          }
        },
      });
      subscribeAll();
      client.socket.addEventListener('open', subscribeAll);
      client.socket.addEventListener('message', subscribeOnGatewayReady);
      if (client.socket.readyState === WebSocket.OPEN) subscribeAll();
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      clearScheduledRestRecovery();
      if (client) {
        client.socket.removeEventListener('open', subscribeAll);
        client.socket.removeEventListener('message', subscribeOnGatewayReady);
        for (const topic of topics) client.unsubscribe(topic);
        client.socket.close();
      }
    };
  }, [marketType, orderbookMarketId, orderbookQuoteOutcomeId, orderbookStreamMarketIds, orderbookStreamTopics]);

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
      setPositions(activeTerminalPositions(positionsResponse.positions, terminalMarketId));
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
      if (document.visibilityState === 'hidden') return;
      void refreshAccountData();
    }, TERMINAL_ACCOUNT_REFRESH_INTERVAL_MS);
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
        const profileRequests = selectedVenueMarkets
          .filter((venueMarket) => venueMarket.venue && venueMarket.venueMarketId)
          .filter((venueMarket) => shouldLoadVenueRiskProfile(venueMarket.venueMarketId))
          .slice(0, 6)
          .map((venueMarket) => ({
            key: `${venueMarket.venue}:${venueMarket.venueMarketId}`,
            venue: venueMarket.venue,
            venueMarketId: venueMarket.venueMarketId,
          }))
          .filter((request) => !missingRiskProfileKeysRef.current.has(request.key));
        const profilePromises = profileRequests
          .map((request) => getVenueMarketResolutionRisk(request.venue, request.venueMarketId));
        const [canonicalResult, ...profileResults] = await Promise.allSettled([canonicalPromise, ...profilePromises]);
        if (cancelled) return;

        const canonicalAssessments: ResolutionRiskAssessment[] = [];
        const selectedMarketAssessments: ResolutionRiskAssessment[] = [];
        const profiles: ResolutionRiskProfile[] = [];
        if (canonicalResult.status === 'fulfilled' && canonicalResult.value) {
          canonicalAssessments.push(...canonicalResult.value.assessments);
        }
        const missingProfileKeys = new Set<string>();
        for (const [index, result] of profileResults.entries()) {
          if (result.status === 'fulfilled') {
            profiles.push(result.value.profile);
            selectedMarketAssessments.push(...result.value.assessments);
          } else if (isApiNotFound(result.reason, 'PROFILE_NOT_FOUND') || isApiNotFoundStatus(result.reason)) {
            const request = profileRequests[index];
            if (request) missingProfileKeys.add(request.key);
          }
        }
        if (missingProfileKeys.size > 0) {
          for (const key of missingProfileKeys) {
            missingRiskProfileKeysRef.current.add(key);
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

  const previewOrchestratorOrder = useCallback(async (
    options: { quiet?: boolean; allowAutoRenew?: boolean } = {},
  ): Promise<ExecutionOrderResponse | null> => {
    if (!executionOrchestratorEnabled) return null;
    const trimmedAmount = ticketAmount.trim();
    if (!token || !selectedTicketMarketId || !selectedTicketQuoteOutcomeId || !trimmedAmount) {
      if (!options.quiet) setTicketError(!token ? 'Log in to place a market order.' : 'Select a market outcome and enter an amount.');
      return null;
    }
    const amountValue = parsePositiveNumber(trimmedAmount);
    if (!amountValue) {
      if (!options.quiet) setTicketError(side === 'buy' ? 'Enter a USDC amount.' : 'Enter shares to sell.');
      return null;
    }
    const backendAmountValue = side === 'buy'
      ? estimateShares(trimmedAmount, ticketPriceForSide(selectedTicketOutcome, ticketOutcomeSide))
      : amountValue;
    if (!backendAmountValue) {
      if (!options.quiet) setTicketError(side === 'buy' ? 'Enter a USDC amount after a live outcome price is available.' : 'Enter shares to sell.');
      return null;
    }
    const backendAmount = formatRouteAmount(backendAmountValue);
    const previewSeq = ++orchestratorPreviewSeqRef.current;
    if (!options.quiet) setTicketLoading(true);
    setTicketOrchestratorAutoRenewFailed(false);
    try {
      const order = await previewExecutionOrder(token, {
        marketId: selectedTicketMarketId,
        outcomeId: selectedTicketQuoteOutcomeId,
        side,
        amount: backendAmount,
        venuePreference: ticketVenuePreference,
        orderPolicy: ticketOrderPolicy,
        slippageToleranceBps: slippageTolerancePercentToBps(ticketSlippageTolerance),
      });
      if (previewSeq !== orchestratorPreviewSeqRef.current) return null;
      if (order.state === 'EXPIRED' && order.canAutoRenew && options.allowAutoRenew !== false) {
        return previewOrchestratorOrder({ ...options, allowAutoRenew: false });
      }
      setTicketOrchestratorOrder(order);
      setTicketOrchestratorAmount(trimmedAmount);
      if (routePathFromExecutionOrder(order).length > 0) setOrderAction('preview');
      setTicketStatusMessage(executionOrderStatusMessage(order));
      const blocker = executionOrderBlockerMessage(order);
      setTicketError(order.state === 'FAILED' || order.state === 'BLOCKED_ACTION_REQUIRED' || order.state === 'NEEDS_VENUE_SETUP'
        ? blocker ?? executionOrderStatusMessage(order)
        : null);
      return order;
    } catch (error) {
      if (previewSeq !== orchestratorPreviewSeqRef.current) return null;
      if (!options.quiet) {
        setTicketError(error instanceof Error ? error.message : 'Order preview failed.');
        setTicketStatusMessage(null);
      }
      setTicketOrchestratorOrder(null);
      setTicketOrchestratorAmount(null);
      return null;
    } finally {
      if (!options.quiet) setTicketLoading(false);
    }
  }, [
    executionOrchestratorEnabled,
    selectedTicketMarketId,
    selectedTicketQuoteOutcomeId,
    selectedTicketOutcome,
    side,
    ticketAmount,
    ticketOrderPolicy,
    ticketSlippageTolerance,
    ticketOutcomeSide,
    ticketVenuePreference,
    token,
  ]);

  const scheduleOrchestratorStatusPoll = useCallback((order: ExecutionOrderResponse | null) => {
    if (!executionOrchestratorEnabled || !token || !order?.orderId) return;
    if (orchestratorPollTimeoutRef.current !== null) {
      window.clearTimeout(orchestratorPollTimeoutRef.current);
      orchestratorPollTimeoutRef.current = null;
    }
    if (!isExecutionOrderPollingState(order.state)) return;
    orchestratorPollTimeoutRef.current = window.setTimeout(async () => {
      try {
        const nextOrder = await getExecutionOrderStatus(token, order.orderId);
        setTicketOrchestratorOrder(nextOrder);
        setTicketStatusMessage(executionOrderStatusMessage(nextOrder));
        const blocker = executionOrderBlockerMessage(nextOrder);
        setTicketError(nextOrder.state === 'FAILED' || nextOrder.state === 'BLOCKED_ACTION_REQUIRED'
          ? blocker ?? executionOrderStatusMessage(nextOrder)
          : null);
        if (nextOrder.executionId) setTicketExecutionId(nextOrder.executionId);
        if (nextOrder.state === 'EXPIRED' && nextOrder.canAutoRenew) {
          const renewed = await previewOrchestratorOrder({ quiet: true, allowAutoRenew: false });
          if (!renewed) setTicketOrchestratorAutoRenewFailed(true);
          return;
        }
        if (isExecutionOrderTerminalState(nextOrder.state)) {
          void refreshAccountData();
          setBottomTab(nextOrder.state === 'SUBMITTED' ? 'Open Orders' : 'Trade History');
          return;
        }
        scheduleOrchestratorStatusPoll(nextOrder);
      } catch (error) {
        setTicketError(error instanceof Error ? error.message : 'Order status refresh failed.');
        scheduleOrchestratorStatusPoll(order);
      }
    }, executionOrderPollDelayMs(order));
  }, [executionOrchestratorEnabled, previewOrchestratorOrder, refreshAccountData, token]);

  const submitOrchestratorSignatures = useCallback(async (order: ExecutionOrderResponse): Promise<ExecutionOrderResponse | null> => {
    if (orchestratorSignaturePromiseRef.current) {
      return orchestratorSignaturePromiseRef.current;
    }
    if (!token) return null;
    const run = async () => {
      const signatureRequests = order.signatureRequests ?? [];
      if (signatureRequests.length === 0) {
        setTicketError('This order requires a wallet signature, but no signature request was returned.');
        return null;
      }
      setTicketOrchestratorSigning(true);
      setTicketStatusMessage('Turnkey signature requested. Review and sign to place this order.');
      const signedPayloads = await signTicketSignatureRequests(signatureRequests);
      setTicketStatusMessage('Signature collected. Lotus backend is submitting the order.');
      const signedOrder = await submitExecutionOrderSignatures(token, order.orderId, signedPayloads);
      setTicketOrchestratorOrder(signedOrder);
      setTicketStatusMessage(executionOrderStatusMessage(signedOrder));
      setTicketError(signedOrder.state === 'FAILED'
        ? executionOrderBlockerMessage(signedOrder) ?? executionOrderStatusMessage(signedOrder)
        : null);
      if (signedOrder.executionId) setTicketExecutionId(signedOrder.executionId);
      scheduleOrchestratorStatusPoll(signedOrder);
      return signedOrder;
    };
    const promise = run().finally(() => {
      orchestratorSignaturePromiseRef.current = null;
      setTicketOrchestratorSigning(false);
    });
    orchestratorSignaturePromiseRef.current = promise;
    return promise;
  }, [scheduleOrchestratorStatusPoll, signTicketSignatureRequests, token]);

  const runOrchestratorVenueSetup = useCallback(() => {
    const text = `${executionOrderBlockerMessage(ticketOrchestratorOrder) ?? ''} ${ticketOrchestratorOrder?.venuePreference ?? ''}`.toUpperCase();
    if (/OPINION/.test(text)) {
      void activateOpinionTradingSafe();
    } else if (/PREDICT/.test(text)) {
      void refreshPredictFunAuth();
    } else if (/LIMITLESS/.test(text)) {
      void activateLimitlessAccount();
    } else if (/APPROVAL|ALLOWANCE|SHARE/.test(text)) {
      void approveRouteCollateral();
    } else {
      void activatePolymarketFunds();
    }
  }, [
    activateLimitlessAccount,
    activateOpinionTradingSafe,
    activatePolymarketFunds,
    approveRouteCollateral,
    refreshPredictFunAuth,
    ticketOrchestratorOrder,
  ]);

  const placeOrchestratorOrder = useCallback(async () => {
    if (orchestratorPlacePromiseRef.current) return orchestratorPlacePromiseRef.current;
    if (!executionOrchestratorEnabled || !token) return;
    const run = async () => {
      setTicketOrchestratorPlacing(true);
      setTicketLoading(true);
      setTicketError(null);
      try {
      const currentAmount = ticketAmount.trim();
      const reusableCurrentOrder = ticketOrchestratorOrder && ticketOrchestratorAmount === currentAmount &&
        ticketOrchestratorOrder.state !== 'FAILED' &&
        ticketOrchestratorOrder.state !== 'EXPIRED' &&
        ticketOrchestratorOrder.state !== 'BLOCKED_ACTION_REQUIRED';
      let order = reusableCurrentOrder
        ? ticketOrchestratorOrder
        : await previewOrchestratorOrder({ quiet: true });
      if (!order) {
        order = await previewOrchestratorOrder({ quiet: false });
      }
      if (!order) return;
      if (order.state === 'EXPIRED') {
        const renewed = await previewOrchestratorOrder({ quiet: true, allowAutoRenew: false });
        if (renewed && renewed.state !== 'EXPIRED') order = renewed;
        else if (order.canAutoRenew) {
          setTicketOrchestratorAutoRenewFailed(true);
          setTicketError('Route expired and could not be refreshed. Try again.');
          return;
        } else {
          setTicketOrchestratorAutoRenewFailed(true);
          setTicketError('Route expired. Refresh the route before placing the order.');
          return;
        }
      }
      if (order.state === 'NEEDS_VENUE_SETUP') {
        runOrchestratorVenueSetup();
        return;
      }
      if (order.state !== 'READY_TO_PLACE') {
        setTicketOrchestratorOrder(order);
        setTicketStatusMessage(executionOrderStatusMessage(order));
        const blocker = executionOrderBlockerMessage(order);
        setTicketError(order.state === 'FAILED' || order.state === 'BLOCKED_ACTION_REQUIRED'
          ? blocker ?? executionOrderStatusMessage(order)
          : null);
        scheduleOrchestratorStatusPoll(order);
        return;
      }
      setTicketStatusMessage('Placing order through Lotus backend.');
      const placed = await placeExecutionOrder(token, order.orderId);
      setTicketOrchestratorOrder(placed);
      setTicketStatusMessage(executionOrderStatusMessage(placed));
      if (placed.executionId) setTicketExecutionId(placed.executionId);
      if (placed.state === 'NEEDS_SIGNATURE') {
        await submitOrchestratorSignatures(placed);
        return;
      }
      if (placed.state === 'EXPIRED' && placed.canAutoRenew) {
        const renewed = await previewOrchestratorOrder({ quiet: true, allowAutoRenew: false });
        if (!renewed) setTicketOrchestratorAutoRenewFailed(true);
        return;
      }
      if (isExecutionOrderTerminalState(placed.state)) {
        void refreshAccountData();
        setBottomTab(placed.state === 'SUBMITTED' ? 'Open Orders' : 'Trade History');
        return;
      }
      scheduleOrchestratorStatusPoll(placed);
      } catch (error) {
        setTicketError(error instanceof Error ? error.message : 'Order placement failed.');
      } finally {
        setTicketLoading(false);
        setTicketOrchestratorPlacing(false);
        orchestratorPlacePromiseRef.current = null;
      }
    };
    const promise = run();
    orchestratorPlacePromiseRef.current = promise;
    return promise;
  }, [
    executionOrchestratorEnabled,
    previewOrchestratorOrder,
    refreshAccountData,
    runOrchestratorVenueSetup,
    scheduleOrchestratorStatusPoll,
    submitOrchestratorSignatures,
    ticketAmount,
    ticketOrchestratorAmount,
    ticketOrchestratorOrder,
    token,
  ]);

  React.useEffect(() => {
    if (!executionOrchestratorEnabled) return;
    setTicketLiveCandidates(null);
    setTicketQuote(null);
    setTicketQuoteAmount(null);
    setTicketExecutionId(null);
    setTicketSignatureBundle(null);
    setTicketLiveReadiness(null);
    setTicketReadinessNextCheckAt(null);
    setTicketStatusMessage(null);
    setTicketError(null);
    setTicketOrchestratorOrder(null);
    setTicketOrchestratorAmount(null);
    setTicketOrchestratorAutoRenewFailed(false);
    orchestratorPreviewSeqRef.current += 1;
  }, [
    executionOrchestratorEnabled,
    selectedTicketMarketId,
    selectedTicketQuoteOutcomeId,
    side,
    ticketAmount,
    ticketVenuePreference,
  ]);

  React.useEffect(() => {
    if (!executionOrchestratorEnabled) return;
    if (!token || !selectedTicketMarketId || !selectedTicketQuoteOutcomeId || !parsePositiveNumber(ticketAmount.trim())) return;
    const timeoutId = window.setTimeout(() => {
      void previewOrchestratorOrder({ quiet: true });
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [
    executionOrchestratorEnabled,
    previewOrchestratorOrder,
    selectedTicketMarketId,
    selectedTicketQuoteOutcomeId,
    ticketAmount,
    token,
  ]);

  React.useEffect(() => {
    if (!executionOrchestratorEnabled || !ticketOrchestratorOrder) return;
    scheduleOrchestratorStatusPoll(ticketOrchestratorOrder);
    return () => {
      if (orchestratorPollTimeoutRef.current !== null) {
        window.clearTimeout(orchestratorPollTimeoutRef.current);
        orchestratorPollTimeoutRef.current = null;
      }
    };
  }, [executionOrchestratorEnabled, scheduleOrchestratorStatusPoll, ticketOrchestratorOrder]);

  const ticketAmountValue = ticketAmountNumber(ticketAmount);
  const ticketOrchestratorBlocker = executionOrderBlockerMessage(ticketOrchestratorOrder);
  const ticketOrchestratorState = ticketOrchestratorOrder?.state ?? null;
  const ticketOrchestratorRouteLegs = routeLegsFromExecutionOrder(ticketOrchestratorOrder);
  const ticketOrchestratorRouteType = executionOrderRouteType(ticketOrchestratorOrder);
  const ticketOrchestratorRouteBadge = ticketOrchestratorRouteLegs.length === 1 ? 'SINGLE_VENUE' : ticketOrchestratorRouteType;
  const ticketOrchestratorEstimatedSavings = executionOrderEstimatedSavings(ticketOrchestratorOrder);
  const ticketOrchestratorDetail = ticketOrchestratorBlocker
    ?? (ticketOrchestratorState === 'WAITING_FOR_VENUE_READY'
      ? 'Lotus is checking venue readiness in the background.'
      : ticketOrchestratorState === 'SUBMITTING'
        ? 'Lotus is submitting the order.'
        : ticketOrchestratorState === 'SUBMITTED'
          ? 'Tracking fill status.'
          : ticketOrchestratorState === 'FILLED'
            ? 'Fill verified.'
            : ticketOrchestratorState === 'EXPIRED' && !ticketOrchestratorAutoRenewFailed
              ? 'Refreshing the route automatically.'
              : null);
  const ticketOrchestratorRouteReady = Boolean(ticketOrchestratorOrder && ticketRoutePath.length > 0 && (
    ticketOrchestratorState === 'READY_TO_PLACE' ||
    ticketOrchestratorState === 'NEEDS_SIGNATURE' ||
    ticketOrchestratorState === 'SUBMITTING' ||
    ticketOrchestratorState === 'SUBMITTED' ||
    ticketOrchestratorState === 'FILLED'
  ));
  const ticketOrchestratorWaiting = executionOrchestratorEnabled && ticketOrchestratorState === 'WAITING_FOR_VENUE_READY';
  const ticketOrchestratorTerminal = Boolean(ticketOrchestratorState && isExecutionOrderTerminalState(ticketOrchestratorState));
  const ticketHasExecutableQuote = executionOrchestratorEnabled
    ? ticketOrchestratorRouteReady
    : Boolean(ticketQuote && ticketRoutePath.length > 0);
  const ticketHasFundingBlocker = !ticketHasExecutableQuote && (ticketLiveCandidates?.blocked ?? []).some((blocked) => {
    const reason = `${blocked.reason ?? ''} ${blocked.detailsCode ?? ''}`.toUpperCase();
    return reason.includes('FUND') || reason.includes('BALANCE') || reason.includes('DEPOSIT') || reason.includes('INSUFFICIENT');
  });
  const ticketPolymarketSellShareBalanceBlocked = side === 'sell' && isPolymarketSellShareBalanceBlocked(ticketLiveReadiness);
  const ticketSellApprovalRequired = side === 'sell' && Boolean(token) && ticketRouteUsesPolymarket && Boolean(ticketPolymarketTokenId) &&
    !ticketPolymarketSellShareBalanceBlocked &&
    /ALLOWANCE|SPENDER|APPROVAL|APPROVE/i.test(ticketError ?? '');
  const ticketRouteApprovalVenue = ticketLiveReadiness?.venues.find((venue) =>
    isReadinessVenueBlocked(venue) &&
    venue.blockers.some((blocker) => /ALLOWANCE|APPROVE|APPROVAL/i.test(blocker)) &&
    Boolean(venue.collateral.tokenAddress && venue.collateral.spenderAddress && venue.collateral.chainId && venue.account.ownerAddress)
  ) ?? null;
  const ticketRouteApprovalRequired = Boolean(token) && Boolean(ticketRouteApprovalVenue) &&
    /ALLOWANCE|APPROVAL|APPROVE/i.test(ticketError ?? '');
  const ticketRouteApprovalVenueLabel = ticketRouteApprovalVenue ? formatVenueLabel(ticketRouteApprovalVenue.venue) : 'Venue';
  const ticketRouteApprovalTokenLabel = ticketRouteApprovalVenue?.collateral.approvalMethod === 'ERC1155_SET_APPROVAL_FOR_ALL'
    ? 'shares'
    : ticketRouteApprovalVenue?.collateral.tokenSymbol ?? 'collateral';
  const ticketLiveReadinessBlocked = isReadinessBlocked(ticketLiveReadiness);
  const ticketLimitlessBalanceBlocked = Boolean(ticketLiveReadiness?.venues.some((venue) =>
    venue.venue.toUpperCase() === 'LIMITLESS' &&
    isReadinessVenueBlocked(venue) &&
    venue.blockers.some((blocker) => /BALANCE|TOTAL BID/i.test(blocker))
  ));
  const ticketLimitlessSetupRequired = Boolean(token) && /LIMITLESS/i.test(ticketError ?? '') &&
    /ACTIVE LINKED VENUE ACCOUNT|LINKED VENUE ACCOUNT|PROFILE|PROFILE_SETUP|PARTNER ACCOUNT|OWNERSHIP/i.test(ticketError ?? '');
  const ticketPredictFunAuthRequired = Boolean(token) && /PREDICT/i.test(ticketError ?? '') &&
    /AUTH JWT|USER AUTH|VENUE SETUP SIGNATURE|AUTH MESSAGE|JWT/i.test(ticketError ?? '');
  const ticketOpinionSetupRequired = Boolean(token) && /OPINION/i.test(ticketError ?? '') &&
    /ENABLE[-\s]?TRADING|SAFE TRANSACTION|SAFE TX|VENUE SETUP SIGNATURE|ACCOUNT SETUP|TRADING SAFE/i.test(ticketError ?? '');
  const ticketPolymarketReadinessVenue = ticketLiveReadiness?.venues.find((venue) =>
    toBackendVenueId(venue.venue) === 'POLYMARKET'
  ) ?? null;
  const ticketPolymarketClobSource = String(ticketPolymarketReadinessVenue?.collateral.usableBalanceSource ?? '').toUpperCase();
  const ticketPolymarketReadinessBlockerText = (ticketPolymarketReadinessVenue?.blockers.join(' ') ?? '').toUpperCase();
  const ticketPolymarketErrorText = String(ticketError ?? '').toUpperCase();
  const ticketPolymarketStatusText = String(ticketStatusMessage ?? '').toUpperCase();
  const ticketPolymarketSyncSignal = [
    ticketPolymarketReadinessBlockerText,
    ticketPolymarketErrorText,
  ].join(' ').toUpperCase();
  const ticketPolymarketClobPropagationPending = Boolean(token && (ticketRouteUsesPolymarket || backendVenueList.includes('POLYMARKET')) && !polymarketLiveReadinessReady && (
    polymarketClobConfirmed && /POLYMARKET CLOB SYNC|CLOB SYNC|CLOB SPENDABLE|SYNC PROPAGAT|PROPAGATION/.test(ticketPolymarketSyncSignal) ||
    ticketPolymarketClobSource === 'USER_CLOB_SYNC_CONFIRMED' ||
    String(ticketPolymarketReadinessVenue?.readinessCode ?? '').toUpperCase() === POLYMARKET_PENDING_SUBMIT_READINESS_CODE ||
    /SYNC WAS CONFIRMED LOCALLY|LIVE CLOB SPENDABLE|SYNC PROPAGAT|PROPAGATION/.test(ticketPolymarketReadinessBlockerText) ||
    /SYNC WAS CONFIRMED LOCALLY|LIVE CLOB SPENDABLE|SYNC PROPAGAT|PROPAGATION/.test(ticketPolymarketErrorText) ||
    /CLOB SYNC SUBMITTED|CLOB SYNC CONFIRMED/.test(ticketPolymarketStatusText)
  ));
  const ticketPolymarketLiveSubmitSpendable = parsePositiveNumber(ticketPolymarketReadinessVenue?.liveSubmitSpendableBalance ?? undefined);
  const ticketPolymarketLiveSubmitSpendableLabel = ticketPolymarketLiveSubmitSpendable !== null
    ? `${ticketPolymarketLiveSubmitSpendable.toLocaleString(undefined, { maximumFractionDigits: 4 })} pUSD`
    : 'Pending';
  const ticketPolymarketLocalBalanceLabel = ticketPolymarketReadinessVenue?.collateral.usableBalance
    ? `${ticketPolymarketReadinessVenue.collateral.usableBalance} pUSD`
    : 'Confirmed';
  const ticketReadinessLastCheckedLabel = formatReadinessTime(ticketPolymarketReadinessVenue?.checkedAt);
  const ticketReadinessNextCheckLabel = formatReadinessTime(ticketReadinessNextCheckAt);
  const ticketPolymarketClobSyncRequired = Boolean(token && (ticketRouteUsesPolymarket || backendVenueList.includes('POLYMARKET')) && !polymarketClobConfirmed && !ticketPolymarketClobPropagationPending && (
    polymarketClobSyncPending ||
    /POLYMARKET_CLOB_SYNC_PENDING|CLOB SYNC PENDING|SYNC_REJECTED_BY_VENUE|REFRESH CLOB SYNC/.test(ticketPolymarketSyncSignal)
  ));
  const ticketActivationRequired = Boolean(token) && (
    (side === 'buy' && polymarketActivationRequired && (ticketRouteUsesPolymarket || ticketHasFundingBlocker || venueReadyBalance <= 0)) ||
    ticketSellApprovalRequired
  );
  const ticketDepositRequired = side === 'buy' && Boolean(token) && ticketHasFundingBlocker && !ticketActivationRequired && !ticketLimitlessSetupRequired && !ticketOpinionSetupRequired;
  const ticketFundingLabel = fundingLoading
    ? 'checking...'
    : fundingError
      ? 'unavailable'
      : ticketPolymarketClobPropagationPending
        ? 'CLOB submit pending'
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
  const ticketReadinessExpiresAt = ticketQuote?.expiresAt ?? ticketLiveReadiness?.expiresAt ?? null;
  const ticketReadinessExpiryMs = ticketReadinessExpiresAt ? new Date(ticketReadinessExpiresAt).getTime() : null;
  const ticketReadinessQuoteExpired = Boolean(ticketReadinessExpiryMs && Number.isFinite(ticketReadinessExpiryMs) && Date.now() >= ticketReadinessExpiryMs);
  const ticketSellUnavailable = side === 'sell' && Boolean(token) && ticketSellableShares <= 0;
  const ticketNeedsFundingAction = ticketActivationRequired || ticketDepositRequired || ticketLimitlessSetupRequired || ticketPredictFunAuthRequired || ticketOpinionSetupRequired || ticketRouteApprovalRequired || ticketPolymarketClobSyncRequired || ticketPolymarketClobPropagationPending || ticketLimitlessBalanceBlocked;
  const ticketActionDisabled = executionOrchestratorEnabled
    ? !token || !terminalMarketId || !selectedTicketOutcomeId || ticketLoading || ticketActivationPolling ||
      ticketOrchestratorPlacing ||
      ticketOrchestratorSigning ||
      ticketSellUnavailable ||
      ticketOrchestratorWaiting ||
      ticketOrchestratorState === 'NEEDS_SIGNATURE' ||
      ticketOrchestratorState === 'BLOCKED_ACTION_REQUIRED' ||
      ticketOrchestratorState === 'SUBMITTING' ||
      ticketOrchestratorState === 'SUBMITTED' ||
      ticketOrchestratorState === 'FILLED'
    : !token || !terminalMarketId || !selectedTicketOutcomeId || ticketLoading || ticketActivationPolling ||
      ticketSellUnavailable ||
      ticketPolymarketClobSyncRequired ||
      (ticketPolymarketClobPropagationPending && ticketReadinessPolling) ||
      Boolean(ticketExecutionId && ticketQuote && !ticketRequiresSignature && !ticketNeedsFundingAction) ||
      Boolean(side === 'buy' && !ticketQuote && fundingLoading);
  const ticketActionLabel = executionOrchestratorEnabled
    ? ticketActivationPolling
      ? 'Confirming venue readiness...'
      : ticketOrchestratorSigning
        ? ticketOrchestratorState === 'NEEDS_SIGNATURE'
          ? 'Waiting for signature...'
          : 'Submitting order...'
      : ticketOrchestratorPlacing || ticketLoading
        ? ticketOrchestratorState === 'SUBMITTING'
          ? 'Submitting order...'
          : 'Placing order...'
      : ticketSellUnavailable
        ? 'No sellable shares'
      : ticketOrchestratorState === 'NEEDS_VENUE_SETUP'
        ? 'Enable venue'
      : ticketOrchestratorState === 'WAITING_FOR_VENUE_READY'
        ? 'Waiting for venue readiness...'
      : ticketOrchestratorState === 'NEEDS_SIGNATURE'
        ? 'Waiting for signature...'
      : ticketOrchestratorState === 'BLOCKED_ACTION_REQUIRED'
        ? 'Execution blocked'
      : ticketOrchestratorState === 'SUBMITTING'
        ? 'Submitting order...'
      : ticketOrchestratorState === 'SUBMITTED'
        ? 'Order submitted'
      : ticketOrchestratorState === 'FILLED'
        ? 'Filled'
      : ticketOrchestratorState === 'FAILED'
        ? 'Refresh route'
      : ticketOrchestratorState === 'EXPIRED' || ticketOrchestratorAutoRenewFailed
        ? 'Refresh route'
      : 'Place order'
    : ticketActivationPolling
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
        : ticketOpinionSetupRequired
          ? 'Enabling Opinion trading...'
          : 'Checking live route...'
    : side === 'buy' && !ticketQuote && fundingLoading
      ? 'Checking balance...'
    : ticketSellUnavailable
      ? 'No sellable shares'
    : ticketActivationRequired
      ? side === 'sell' ? 'Approve Polymarket shares' : 'Activate Polymarket funds'
    : ticketRouteApprovalRequired
      ? `Approve ${ticketRouteApprovalVenueLabel} ${ticketRouteApprovalTokenLabel}`
    : ticketPolymarketClobSyncRequired
      ? 'Checking Polymarket readiness...'
    : ticketPolymarketClobPropagationPending
      ? ticketReadinessPolling
        ? 'Checking Polymarket readiness...'
        : ticketReadinessQuoteExpired
          ? 'Preview new route'
          : 'Recheck readiness'
    : ticketLimitlessBalanceBlocked
      ? 'Reduce amount or fund Limitless'
    : ticketLimitlessSetupRequired
      ? 'Activate Limitless account'
    : ticketPredictFunAuthRequired
      ? 'Refresh Predict.fun auth'
    : ticketOpinionSetupRequired
      ? 'Enable Opinion trading'
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
  const ticketActionNeedsConfirmation = !ticketActionDisabled && (
    executionOrchestratorEnabled
      ? ticketOrchestratorState === 'READY_TO_PLACE' && Boolean(ticketOrchestratorOrder?.orderId)
      : Boolean(
        (ticketSignatureBundle && ticketExecutionId) ||
        (ticketQuote && !ticketExecutionId && !ticketRequiresSignature && !ticketNeedsFundingAction && !ticketLiveReadinessBlocked)
      )
  );
  const ticketActionDisplayLabel = ticketActionNeedsConfirmation && ticketConfirmArmed
    ? 'Press to confirm'
    : ticketActionLabel;
  const ticketRouteReady = executionOrchestratorEnabled
    ? Boolean(ticketOrchestratorOrder && ticketRoutePath.length > 0)
    : Boolean(ticketQuote && ticketRoutePath.length > 0);
  const ticketPolymarketClobReadinessKey = ticketQuote?.quoteId
    ?? ticketExecutionId
    ?? `${selectedTicketMarketId}:${selectedTicketQuoteOutcomeId}:${ticketAmount.trim() || 'empty'}`;

  React.useEffect(() => {
    if (executionOrchestratorEnabled || !token || !ticketPolymarketClobSyncRequired || ticketLoading || ticketActivationPolling) return;
    const key = `${ticketPolymarketClobReadinessKey}:sync`;
    if (autoPolymarketClobSyncKeyRef.current === key) return;
    autoPolymarketClobSyncKeyRef.current = key;
    void syncPolymarketClobReadiness();
  }, [
    syncPolymarketClobReadiness,
    executionOrchestratorEnabled,
    ticketActivationPolling,
    ticketLoading,
    ticketPolymarketClobReadinessKey,
    ticketPolymarketClobSyncRequired,
    token,
  ]);

  React.useEffect(() => {
    setTicketConfirmArmed(false);
  }, [
    selectedTicketMarketId,
    selectedTicketQuoteOutcomeId,
    side,
    ticketAmount,
    ticketOutcomeSide,
    ticketOrchestratorOrder?.orderId,
    ticketQuote?.quoteId,
    ticketSignatureBundle?.quoteId,
    ticketVenuePreference,
  ]);

  React.useEffect(() => {
    if (!ticketConfirmArmed) return undefined;
    const timeoutId = window.setTimeout(() => setTicketConfirmArmed(false), 8_000);
    return () => window.clearTimeout(timeoutId);
  }, [ticketConfirmArmed]);

  React.useEffect(() => {
    if (executionOrchestratorEnabled || !token || !ticketPolymarketClobPropagationPending || ticketLoading || ticketActivationPolling) return;
    const readinessId = ticketQuote?.quoteId ?? ticketExecutionId;
    if (!readinessId) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    const pollReadiness = async () => {
      const expiresAt = ticketQuote?.expiresAt ?? ticketLiveReadiness?.expiresAt ?? null;
      const expiryMs = expiresAt ? new Date(expiresAt).getTime() : null;
      if (expiryMs && Number.isFinite(expiryMs) && Date.now() >= expiryMs) {
        if (!cancelled) {
          setTicketReadinessNextCheckAt(null);
          setTicketStatusMessage('This route expired before Polymarket live submit readiness cleared. Preview a new route.');
        }
        return;
      }

      setTicketReadinessPolling(true);
      try {
        const readiness = await getLiveReadiness(token, readinessId);
        if (cancelled) return;
        setTicketLiveReadiness(readiness);
        const blocked = firstReadinessBlocker(readiness);
        if (!blocked) {
          setTicketError(null);
          setTicketReadinessNextCheckAt(null);
          setTicketStatusMessage('Polymarket live collateral is ready. Continue with submit.');
          return;
        }
        setTicketError(`${formatVenueLabel(blocked.venue)}: ${blocked.blocker}`);
        if (!isPolymarketClobPropagationReadiness(readiness)) {
          setTicketReadinessNextCheckAt(null);
          setTicketStatusMessage('Live submit is still blocked by venue readiness.');
          return;
        }
        const nextCheckAt = Date.now() + POLYMARKET_LIVE_READINESS_POLL_MS;
        setTicketReadinessNextCheckAt(nextCheckAt);
        setTicketStatusMessage('Polymarket CLOB sync is confirmed locally. Rechecking live submit readiness automatically.');
        timeoutId = window.setTimeout(pollReadiness, POLYMARKET_LIVE_READINESS_POLL_MS);
      } catch (error) {
        if (!cancelled) {
          setTicketError(error instanceof Error ? error.message : 'Polymarket CLOB readiness refresh failed.');
          const nextCheckAt = Date.now() + POLYMARKET_LIVE_READINESS_POLL_MS;
          setTicketReadinessNextCheckAt(nextCheckAt);
          timeoutId = window.setTimeout(pollReadiness, POLYMARKET_LIVE_READINESS_POLL_MS);
        }
      } finally {
        if (!cancelled) setTicketReadinessPolling(false);
      }
    };

    void pollReadiness();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setTicketReadinessPolling(false);
      setTicketReadinessNextCheckAt(null);
    };
  }, [
    executionOrchestratorEnabled,
    ticketActivationPolling,
    ticketExecutionId,
    ticketLiveReadiness?.expiresAt,
    ticketLoading,
    ticketPolymarketClobPropagationPending,
    ticketQuote?.expiresAt,
    ticketQuote?.quoteId,
    token,
  ]);

  const ticketBlockedRoutes = ticketLiveCandidates?.blocked ?? [];
  const ticketAmountLabel = side === 'buy' ? 'Amount' : 'Shares to Sell';
  const ticketAmountUnit = side === 'buy' ? 'USDC' : 'Shares';
  const ticketReceiveLabel = side === 'buy' ? 'To Win' : 'To Receive';
  const ticketReceiveText = side === 'buy'
    ? formatUsdc(ticketEstimatedPayout)
    : formatTradeUsdc(ticketReceiveEstimate);
  const ticketPrimaryButtonClass = ticketActionNeedsConfirmation && ticketConfirmArmed
    ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-[0_0_15px_rgba(251,191,36,0.18)]'
    : side === 'buy'
      ? 'bg-[#ccff00] hover:bg-[#b0dc00] text-black shadow-[0_0_15px_rgba(204,255,0,0.15)]'
      : 'bg-[#E52B50] hover:bg-[#ff3366] text-white shadow-[0_0_15px_rgba(229,43,80,0.15)]';
  const ticketPrimaryDisabledClass = ticketActionDisabled ? 'opacity-50 cursor-not-allowed hover:bg-zinc-700' : '';

  return (
    <>
    <div className={`lotus-terminal lotus-terminal-viewport ${darkMode ? 'lotus-terminal-dark' : 'lotus-terminal-light'} ${embedded ? 'h-[calc(100dvh-7rem)]' : 'h-[calc(100dvh-4rem)] -mx-3 -my-4 sm:-mx-4 sm:-my-6 lg:-mx-8 lg:-my-8 2xl:-mx-12 2xl:-my-12'} bg-[#09090b] text-white font-sans overflow-y-auto overflow-x-hidden custom-scrollbar`}>
      <div className="lotus-terminal-stage flex min-h-full w-full flex-col bg-[#09090b] text-white p-2 2xl:p-3 gap-2 2xl:gap-3 items-stretch xl:flex-row xl:items-start">
      
      {/* Focus Rail */}
      {!embedded && <div className="hidden w-16 bg-[#121214] border border-zinc-800 rounded-xl 2xl:flex flex-col items-center py-4 gap-6 shrink-0 z-10">
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
      <div className="w-full flex-1 flex flex-col gap-3 min-w-0">
         {/* Top Header Row */}
         <div className="bg-[#121214] border border-zinc-800 rounded-xl p-3 2xl:p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 shrink-0">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 2xl:gap-4">
                <div className="relative z-30 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setShowMarketSelector((open) => !open)}
                      aria-expanded={showMarketSelector}
                      className="group flex h-11 2xl:h-12 w-full sm:w-[min(32rem,calc(100vw-9rem))] xl:w-[clamp(280px,30vw,520px)] items-center gap-3 rounded-xl border border-zinc-800 bg-[#0c0c0e] px-3 text-left transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
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
                      <div className="lotus-terminal-event-menu absolute left-0 top-full z-50 mt-3 w-[min(480px,calc(100vw-5rem))] overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl shadow-black/40">
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
                                canonicalMarketIds: market.canonicalMarketIds,
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
                                canonicalMarketIds: outcome.canonicalMarketIds ?? market.canonicalMarketIds,
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
                                        <span className="shrink-0 font-mono text-xs font-black text-zinc-100">{displayPriceLabel(yesLabel, marketDiagnosticsEnabled)}</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <button
                                          type="button"
                                          onClick={() => selectSelectorOutcome(outcome, 'yes')}
                                          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                        >
                                          Yes {displayPriceLabel(yesLabel, marketDiagnosticsEnabled)}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => selectSelectorOutcome(outcome, 'no')}
                                          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-xs font-bold text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                        >
                                          No {displayPriceLabel(noLabel, marketDiagnosticsEnabled)}
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
                                                  Yes {displayPriceLabel(quote.yesPrice, marketDiagnosticsEnabled)}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => selectSelectorOutcome(outcome, 'no')}
                                                  className="rounded bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                                >
                                                  No {displayPriceLabel(quote.noPrice, marketDiagnosticsEnabled)}
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

            <div className="flex shrink-0 flex-wrap items-center gap-3 2xl:gap-6 text-sm">
                <div className="flex items-center gap-2 text-emerald-400 font-mono font-medium bg-emerald-500/10 px-2.5 2xl:px-3 py-1.5 rounded-md border border-emerald-500/20">
                    <Clock className="w-3.5 h-3.5" /> 50d 1h 50m
                </div>
                <div className="hidden 2xl:block text-zinc-300 font-medium">Jun 13, 2026</div>
                <div className="text-white font-mono font-bold text-base">$1.5M</div>
            </div>
         </div>
         
         {/* Chart */}
         <div className="min-h-[360px] lg:h-[440px] lg:min-h-0 2xl:h-[500px] bg-[#121214] border border-zinc-800 rounded-xl flex flex-col overflow-hidden relative shrink-0">
            
            {/* Main Chart Section */}
            <div className="min-h-[320px] flex-1 flex flex-col relative p-4 min-w-0 lg:min-h-0">
               <LiveCanonicalChart
                 marketId={selectedOutcomeMarketId}
                 outcomeId={selectedQuoteOutcomeId}
                 marketType={marketType}
                 outcomes={terminalOutcomes}
               />
            </div>

            {/* Order Book Panel (Right side of middle container) */}
            {false && (
            <div className="min-h-[320px] w-full bg-[#121214] flex flex-col text-[10px] font-mono shrink-0 lg:min-h-0 lg:w-[clamp(360px,30vw,460px)] 2xl:w-[clamp(400px,24vw,520px)]">
               <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
                   <div className="flex items-center gap-3">
                       <ChevronLeft className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-white" />
                       <span className="w-4 h-4 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-[8px] font-bold">$</span>
                       <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${streamStatusClass(orderbookSnapshotStatus, marketDiagnosticsEnabled)}`}>
                         {streamStatusLabel(orderbookSnapshotStatus, marketDiagnosticsEnabled)}
                       </span>
                       <div className="relative group">
                           <Info className="w-4 h-4 text-zinc-500 cursor-pointer hover:text-white" />
                           <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:flex flex-col w-[260px] bg-zinc-900 border border-zinc-700/50 rounded-lg p-3 shadow-xl z-50 pointer-events-none">
                               <div className="text-zinc-200 text-[11px] font-sans pb-2 border-b border-zinc-800 mb-2">
                                   <div className="flex justify-between items-center">
                                       <span className="font-semibold text-white">Spread: {formatBookPrice(displayOrderbook?.spread)}</span>
                                       <span className="text-[10px] text-zinc-500">(Combined effective spread)</span>
                                   </div>
                               </div>
                               <div className="flex justify-between text-[11px] font-sans mb-1 text-zinc-300">
                                   <span>Best Bid: <span className="text-emerald-400 font-mono font-bold">{formatBookPrice(displayOrderbook?.bestBid)}</span></span>
                                   <span>Best Ask: <span className="text-pink-400 font-mono font-bold">{formatBookPrice(displayOrderbook?.bestAsk)}</span></span>
                               </div>
                               <div className="text-[11px] font-sans text-zinc-400">
                                   Status: <span className="font-mono text-zinc-300 font-bold">{orderbookStatusDetail}</span>
                               </div>
                               <div className="text-[11px] font-sans text-zinc-400 mt-1">
                                   Feed: <span className="font-mono text-zinc-300 font-bold">{orderbookWsLabel}</span>
                                   {orderbookFreshness ? <span> · {orderbookFreshness}</span> : null}
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
                   {marketDiagnosticsEnabled && orderbookError && orderbookLiveVenueCount === 0 && (
                     <div className="mx-3 my-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">{orderbookError}</div>
                   )}
                   {marketDiagnosticsEnabled && orderbookSnapshotStatus === 'blocked' && orderbookLiveVenueCount === 0 && orderbookStreamBlockers.length > 0 && (
                     <div className="mx-3 my-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
                       {formatVenueLabel(latestOrderbookStream?.venue ?? 'Venue')} unavailable: {orderbookStreamBlockers[0]}
                     </div>
                   )}
                   {orderbookLiveVenueCount === 0 && (orderbookSnapshotStatus === 'stale' || orderbookSnapshotStatus === 'resyncing') && (
                     <div className="mx-3 my-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-100">
                       {marketDiagnosticsEnabled
                         ? `Live quotes reconnecting${orderbookFreshness ? ` (${orderbookFreshness})` : ''}.`
                         : 'Updating live prices.'}
                     </div>
                   )}
                   {!marketDiagnosticsEnabled && !orderbookLoading && orderbookLiveVenueCount === 0 && orderbookSnapshotStatus !== 'stale' && orderbookSnapshotStatus !== 'resyncing' && ((displayOrderbook?.asks.length ?? 0) === 0 && (displayOrderbook?.bids.length ?? 0) === 0) && (
                     <div className="px-4 py-6 text-center text-[11px] font-semibold text-zinc-500">
                       Updating live prices.
                     </div>
                   )}
                   {marketDiagnosticsEnabled && !orderbookLoading && !orderbookError && displayOrderbook !== null && (displayOrderbook?.asks.length ?? 0) === 0 && (displayOrderbook?.bids.length ?? 0) === 0 && (
                     <div className="px-4 py-6 text-center text-[11px] font-semibold text-zinc-500">
                       Live quotes reconnecting...
                     </div>
                   )}
                   {displayOrderbook?.asks.slice().reverse().map((level, i) => (
                     <div key={`ask-${level.venue}-${level.price}-${i}`} className={`flex justify-between px-4 py-0.5 hover:bg-zinc-800/50 ${i === 0 ? 'mb-1' : ''} ${i < 3 ? 'bg-[#E52B50]/5' : ''}`}>
                       <span className="w-12 text-pink-500 font-bold">{formatBookPrice(level.price)}</span>
                       <span className="w-16 flex items-center gap-1.5 text-zinc-500 uppercase text-[9px] font-bold tracking-wider">
                         <VenueLogo id={normalizeVenueId(level.venue)} label={formatVenueLabel(level.venue)} className={tinyVenueClass} />
                         {formatVenueLabel(level.venue)}
                       </span>
                       <span className="w-20 text-right text-zinc-200">{formatBookLevelSize(level)}</span>
                       <span className="w-24 text-right text-white font-bold">{formatBookLevelNotional(level)}</span>
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
                       <span className="font-mono">{formatBookPrice(displayOrderbook?.spread)}</span>
                   </div>

                   {displayOrderbook?.bids.map((level, i) => (
                     <div key={`bid-${level.venue}-${level.price}-${i}`} className={`flex justify-between px-4 py-0.5 hover:bg-zinc-800/50 ${i === 0 ? 'mt-1' : ''} ${i < 3 ? 'bg-[#ccff00]/5' : ''}`}>
                       <span className="w-12 text-emerald-400 font-bold">{formatBookPrice(level.price)}</span>
                       <span className="w-16 flex items-center gap-1.5 text-zinc-500 uppercase text-[9px] font-bold tracking-wider">
                         <VenueLogo id={normalizeVenueId(level.venue)} label={formatVenueLabel(level.venue)} className={tinyVenueClass} />
                         {formatVenueLabel(level.venue)}
                       </span>
                       <span className="w-20 text-right text-zinc-200">{formatBookLevelSize(level)}</span>
                       <span className="w-24 text-right text-white font-bold">{formatBookLevelNotional(level)}</span>
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
            )}
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
             </div>
             <div className="flex-1 overflow-y-auto w-full custom-scrollbar bg-[#121214] p-4">
                {bottomTab === 'Outcomes' && (
                    <div className="flex w-full flex-col gap-2">
                         {outcomesLoading && (
                           <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-xs font-semibold text-zinc-400">
                             Refreshing live outcome quotes...
                           </div>
                         )}
                         {marketDiagnosticsEnabled && outcomesError && (
                           <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200">
                             {outcomesError}
                           </div>
                         )}
                         {visibleOutcomeRows.length === 0 && emptyCopy(
                           marketDiagnosticsEnabled ? 'No outcomes loaded' : 'Prices updating',
                           marketDiagnosticsEnabled ? 'The backend has not returned outcomes for this market yet.' : 'Live prices will appear as soon as the feed has a usable quote.'
                         )}
                         {visibleOutcomeRows.map((m) => {
                           const venues = m.venues.length ? m.venues : marketVenueList;
                           const primaryVenue = m.primaryVenue ?? venues[0] ?? 'lotus';
                           const isSelectedOutcome = selectedOutcomeId ? selectedOutcomeId === m.id : m.active;
                           const rowYesPrice = isSelectedOutcome ? selectedOutcomeBookDisplay.yesPrice ?? m.yesPrice : m.yesPrice;
                           const rowNoPrice = isSelectedOutcome ? selectedOutcomeBookDisplay.noPrice ?? m.noPrice : m.noPrice;
                           const rowProbability = isSelectedOutcome ? selectedOutcomeBookDisplay.probability ?? m.prob : m.prob;
                           const rowYesVenue = isSelectedOutcome ? selectedOutcomeBookDisplay.yesVenue ?? primaryVenue : primaryVenue;
                           const rowNoVenue = isSelectedOutcome ? selectedOutcomeBookDisplay.noVenue ?? primaryVenue : primaryVenue;
                           return (
                            <div key={m.id} className="rounded-xl">
                            <div
                              className={`w-full px-5 py-2.5 rounded-xl flex items-center justify-between gap-4 transition-colors ${(isSelectedOutcome) ? 'border border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border border-transparent hover:border-zinc-800 hover:bg-zinc-900/30 bg-transparent'}`}
                            >
                                 <button
                                   type="button"
                                   onClick={() => focusTerminalOutcomeOrderbook(m.id)}
                                   className="flex min-w-0 flex-1 items-center justify-between gap-6 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                   aria-pressed={isSelectedOutcome}
                                 >
                                   <div className="flex min-w-0 items-center gap-5">
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
                                     <div className="min-w-0">
                                         <span className="block truncate text-zinc-100 font-bold text-base tracking-wide leading-tight">{m.name}</span>
                                         <span className="block truncate text-zinc-500 text-xs mt-0.5 font-medium">
                                           {m.vol} <span className="mx-1">-</span> {m.platforms} venues
                                           {marketDiagnosticsEnabled && m.blocker && <span className="ml-2 text-amber-300">{m.blocker}</span>}
                                         </span>
                                     </div>
                                   </div>
                                   <span className="shrink-0 text-white font-black text-xl w-14 text-right tracking-tight">{displayPriceLabel(rowProbability, marketDiagnosticsEnabled)}</span>
                                 </button>
                                     <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              focusTerminalOutcomeOrderbook(m.id);
                                              selectTicketOutcome('yes', m.id);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A3A34] text-[#4ade80] text-xs font-bold hover:bg-[#204941] transition-colors"
                                          >
                                               <VenueLogo id={normalizeVenueId(rowYesVenue)} label={formatVenueLabel(rowYesVenue)} className="h-3.5 w-3.5 rounded-full" /> Yes {displayPriceLabel(rowYesPrice, marketDiagnosticsEnabled)}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              focusTerminalOutcomeOrderbook(m.id);
                                              selectTicketOutcome('no', m.id);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3F1D24] text-[#f87171] text-xs font-bold hover:bg-[#52252f] transition-colors"
                                          >
                                               <VenueLogo id={normalizeVenueId(rowNoVenue)} label={formatVenueLabel(rowNoVenue)} className="h-3.5 w-3.5 rounded-full" /> No {displayPriceLabel(rowNoPrice, marketDiagnosticsEnabled)}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setExpandedOutcomeId((current) => {
                                                if (current === m.id) return null;
                                                setSelectedOutcomeId(m.id);
                                                return m.id;
                                              });
                                            }}
                                            aria-label={`Open ${m.name} outcome details`}
                                            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                            aria-expanded={expandedOutcomeId === m.id}
                                          >
                                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedOutcomeId === m.id ? 'rotate-180' : ''}`} />
                                          </button>
                                     </div>
                             </div>
                             {expandedOutcomeId === m.id && (
                               <div className="mx-5 mb-3 overflow-hidden rounded-xl border border-zinc-800 bg-[#151517]">
                                 <div className="flex border-b border-zinc-800 bg-[#121214]">
                                   <button
                                     type="button"
                                     className="h-12 border-b-2 border-orange-500 px-6 text-sm font-semibold text-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                   >
                                     Order Book
                                   </button>
                                   <button
                                     type="button"
                                     className="h-12 border-b-2 border-transparent px-6 text-sm font-semibold text-zinc-200 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                                     onClick={() => focusTerminalOutcomeOrderbook(m.id)}
                                   >
                                     Graph
                                   </button>
                                 </div>
                                 <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] border-b border-zinc-800 bg-[#141416] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                                   <span>Trade Yes</span>
                                   <span>Price</span>
                                   <span className="text-right">Shares</span>
                                   <span className="text-right">Total</span>
                                 </div>
                                 <div className="max-h-[420px] overflow-y-auto py-2 font-mono custom-scrollbar">
                                   {orderbookLoading && !orderbook && (
                                     <div className="px-4 py-8 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Loading live book</div>
                                   )}
                                   {marketDiagnosticsEnabled && orderbookError && inlineOrderbookLiveVenueCount === 0 && (
                                     <div className="mx-4 my-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">{orderbookError}</div>
                                   )}
                                   {!marketDiagnosticsEnabled && !orderbookLoading && inlineOrderbookLiveVenueCount === 0 && (!orderbook || (orderbook.asks.length === 0 && orderbook.bids.length === 0)) && (
                                     <div className="px-4 py-8 text-center text-[11px] font-semibold text-zinc-500">Updating live prices.</div>
                                   )}
                                   {orderbook?.asks.slice().reverse().map((level, i) => (
                                     <div key={`inline-ask-${level.venue}-${level.price}-${i}`} className={`grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] items-center px-4 py-2 text-sm hover:bg-zinc-800/50 ${i < 4 ? 'bg-[#E52B50]/5' : ''}`}>
                                       <span>{i === 0 && <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-300">Asks</span>}</span>
                                       <span className="flex items-center gap-2 font-bold text-pink-400">
                                         {formatBookPrice(level.price)}
                                         <VenueLogo id={normalizeVenueId(level.venue)} label={formatVenueLabel(level.venue)} className={tinyVenueClass} />
                                       </span>
                                       <span className="text-right font-semibold text-zinc-200">{formatBookLevelSize(level)}</span>
                                       <span className="text-right font-bold text-zinc-100">{formatBookLevelNotional(level)}</span>
                                     </div>
                                   ))}
                                   <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] border-y border-zinc-800 bg-[#121214] px-4 py-2 text-sm font-semibold text-zinc-200">
                                     <span>Last: Yes {formatBookPrice(orderbook?.midpoint)}</span>
                                     <span>Spread: {formatBookPrice(orderbook?.spread)}</span>
                                     <span />
                                     <span />
                                   </div>
                                   {orderbook?.bids.map((level, i) => (
                                     <div key={`inline-bid-${level.venue}-${level.price}-${i}`} className={`grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] items-center px-4 py-2 text-sm hover:bg-zinc-800/50 ${i < 4 ? 'bg-emerald-500/5' : ''}`}>
                                       <span>{i === 0 && <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">Bids</span>}</span>
                                       <span className="flex items-center gap-2 font-bold text-emerald-400">
                                         {formatBookPrice(level.price)}
                                         <VenueLogo id={normalizeVenueId(level.venue)} label={formatVenueLabel(level.venue)} className={tinyVenueClass} />
                                       </span>
                                       <span className="text-right font-semibold text-zinc-200">{formatBookLevelSize(level)}</span>
                                       <span className="text-right font-bold text-zinc-100">{formatBookLevelNotional(level)}</span>
                                     </div>
                                   ))}
                                 </div>
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
                                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
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
                                                ) : resolutionRuleFallbacks.length > 0 ? (
                                                    <div className="space-y-4 max-w-3xl">
                                                        <div className={`rounded-xl border p-4 ${catalogRuleTextCount > 0 ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-amber-500/25 bg-amber-500/10'}`}>
                                                            <div className="flex items-start gap-3">
                                                                {catalogRuleTextCount > 0
                                                                    ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                                                    : <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
                                                                <div>
                                                                    <div className={`text-sm font-bold ${catalogRuleTextCount > 0 ? 'text-emerald-100' : 'text-amber-100'}`}>
                                                                        {catalogRuleTextCount > 0 ? 'Catalog resolution rules loaded' : 'Backend rule profile pending'}
                                                                    </div>
                                                                    <p className={`mt-1 text-xs leading-relaxed ${catalogRuleTextCount > 0 ? 'text-emerald-100/75' : 'text-amber-100/75'}`}>
                                                                        {catalogRuleTextCount > 0
                                                                            ? 'Lotus is showing the resolution rules ingested with the market catalog. Backend risk profiles may add richer source metadata when available.'
                                                                            : 'Lotus has catalog metadata for these venue markets, but no rule text has been returned yet. Treat this as context only, not a pooling approval.'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {resolutionRuleFallbacks.map((rule) => (
                                                            <div key={rule.key} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                                    <div className="flex min-w-0 items-center gap-2">
                                                                        <VenueLogo id={normalizeVenueId(rule.venue)} label={formatVenueLabel(rule.venue)} className="h-5 w-5 rounded-full" />
                                                                        <div className="min-w-0">
                                                                            <div className="text-sm font-bold text-zinc-100">{formatVenueLabel(rule.venue)}</div>
                                                                            <div className="truncate text-xs text-zinc-500">
                                                                                {rule.venueMarketCount > 1 ? `${rule.venueMarketCount} catalog markets covered` : rule.venueTitle}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                                                                        {rule.marketClass}
                                                                    </div>
                                                                </div>
                                                                <div className="grid gap-3 text-xs text-zinc-400 md:grid-cols-2">
                                                                    <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3 md:col-span-2">
                                                                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Resolution rule text</div>
                                                                        <div className="mt-2 leading-relaxed text-zinc-200">
                                                                            {rule.resolutionRulesText
                                                                                ? renderLinkedText(rule.resolutionRulesText)
                                                                                : <p className="text-zinc-500">Catalog has not returned explicit event-level rule text for this venue.</p>}
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Outcome schema</div>
                                                                        <div className="mt-2 font-medium text-zinc-200">{rule.outcomes}</div>
                                                                    </div>
                                                                    <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Resolution source</div>
                                                                        <div className="mt-2 space-y-1">
                                                                            <div><span className="text-zinc-500">Source:</span> {rule.resolutionSource ?? formatVenueLabel(rule.venue)}</div>
                                                                            <div><span className="text-zinc-500">Title:</span> {rule.resolutionTitle ?? rule.venueTitle}</div>
                                                                            {rule.sourceUrl && (
                                                                                <div>
                                                                                    <span className="text-zinc-500">Link:</span>{' '}
                                                                                    <a
                                                                                        href={rule.sourceUrl}
                                                                                        target="_blank"
                                                                                        rel="noreferrer"
                                                                                        className="font-semibold text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition-colors hover:text-sky-200"
                                                                                    >
                                                                                        Open market
                                                                                    </a>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Timing</div>
                                                                        <div className="mt-2 space-y-1">
                                                                            <div><span className="text-zinc-500">Expires:</span> {formatDateTime(rule.expiresAt)}</div>
                                                                            <div><span className="text-zinc-500">Resolves:</span> {formatDateTime(rule.resolvesAt)}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3 md:col-span-2">
                                                                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Catalog coverage</div>
                                                                        <div className="mt-2 text-zinc-300">
                                                                            This event-level rule card covers {rule.venueMarketCount} {rule.venueMarketCount === 1 ? 'catalog market' : 'catalog markets'} for {formatVenueLabel(rule.venue)}.
                                                                        </div>
                                                                        {rule.venueMarketCount === 1 && (
                                                                            <div className="mt-2 break-all font-mono text-[11px] text-zinc-500">{rule.venueMarketId}</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    emptyCopy('No rules returned', 'The backend has not returned venue resolution profiles for this selected market, and no catalog venue rule context is available.')
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
                                                    <div className="max-w-3xl rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                                                        <div className="flex items-start gap-3">
                                                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                                            <div>
                                                                <div className="text-sm font-bold text-zinc-100">Aggregation pending</div>
                                                                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                                                                    Backend has not returned a canonical pooling assessment for this market yet. Lotus should not treat venue markets as semantically equivalent until that assessment is available.
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-4 grid gap-3 text-xs text-zinc-400 md:grid-cols-3">
                                                            <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Venues scanned</div>
                                                                <div className="mt-2 font-bold text-zinc-100">{marketVenueList.length || terminalMarket.venueCount}</div>
                                                            </div>
                                                            <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Rule profiles</div>
                                                                <div className="mt-2 font-bold text-zinc-100">{riskState.profiles.length}</div>
                                                            </div>
                                                            <div className="rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Catalog venues</div>
                                                                <div className="mt-2 font-bold text-zinc-100">{resolutionRuleFallbacks.length}</div>
                                                            </div>
                                                        </div>
                                                        {resolutionRuleFallbacks.length > 0 && (
                                                            <div className="mt-4 rounded-lg border border-zinc-800 bg-[#0c0c0e] p-3">
                                                                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Available venue context</div>
                                                                <div className="mt-2 flex flex-wrap gap-2">
                                                                    {resolutionRuleFallbacks.map((rule) => (
                                                                        <span key={rule.key} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-2 py-1 text-[11px] font-semibold text-zinc-300">
                                                                            <VenueLogo id={normalizeVenueId(rule.venue)} label={formatVenueLabel(rule.venue)} className="h-3.5 w-3.5 rounded-full" />
                                                                            {formatVenueLabel(rule.venue)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
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
                                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
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
                            <div className="grid grid-cols-3 gap-3 text-right sm:gap-6">
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
                      {openOrders.map((order) => {
                        const summary = executionLegStatusSummary(order);
                        const summaryTone = summary.tone === 'warning'
                          ? 'text-amber-300'
                          : summary.tone === 'danger'
                            ? 'text-rose-300'
                            : summary.tone === 'success'
                              ? 'text-emerald-300'
                              : 'text-zinc-300';
                        return (
                          <div key={order.executionId} className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-5 py-3">
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-bold text-zinc-100">{order.openStatus}</div>
                                  <div className={`text-xs font-bold ${summaryTone}`}>{summary.title}</div>
                                </div>
                                <div className="mt-0.5 truncate text-xs font-medium text-zinc-500">{order.executionId}</div>
                                <div className="mt-1 text-xs font-semibold text-zinc-400">{summary.detail}</div>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-right sm:gap-6">
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
                        );
                      })}
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
                            <div className="grid grid-cols-3 gap-3 text-right sm:gap-6">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Route</div>
                                <div className="text-xs font-bold text-zinc-200">{execution.route?.venuePath?.map(formatVenueLabel).join(' / ') || 'Pending'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Settlement</div>
                                <div className="text-xs font-bold text-zinc-300">{executionSettlementStatusLabel(execution)}</div>
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
      <div className="w-full flex flex-col gap-2 2xl:gap-3 shrink-0 overflow-visible xl:max-h-[calc(100dvh-8rem)] xl:w-[360px] xl:overflow-hidden 2xl:w-[clamp(380px,21vw,460px)]">
         {/* Trade Block */}
         <div className="bg-[#121214] border border-zinc-800 rounded-xl flex flex-col shrink-0 min-h-0 transition-all duration-300 xl:flex-1 xl:overflow-hidden">
             <div className="flex justify-between items-center p-3 border-b border-zinc-800/80">
                 <div className="flex gap-4 items-center pl-2">
                     <button type="button" onClick={() => switchTicketSide('buy')} className={`pb-1 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${side === 'buy' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Buy</button>
                     <button type="button" onClick={() => switchTicketSide('sell')} className={`pb-1 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${side === 'sell' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Sell</button>
                 </div>
                 <div className="relative flex items-center gap-1.5 pr-1">
                   <button
                     type="button"
                     onClick={() => setTicketSettingsOpen((open) => !open)}
                     className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketSettingsOpen ? 'border-[#ccff00]/40 bg-[#ccff00]/10 text-[#ccff00]' : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'}`}
                     aria-label="Order settings"
                     aria-expanded={ticketSettingsOpen}
                   >
                     <Settings className="h-3.5 w-3.5" />
                   </button>
                   <button type="button" disabled className="text-zinc-300 text-xs font-semibold flex items-center gap-1 cursor-not-allowed" title="Limit orders are disabled for production until the backend limit-order contract is implemented.">
                       {orderType === 'market' ? 'Market' : 'Limit'} <Lock className="w-3.5 h-3.5 text-zinc-600" />
                   </button>
                   {ticketSettingsOpen && (
                     <div className="absolute right-0 top-9 z-40 w-[330px] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-800 bg-[#151517] p-2.5 shadow-2xl shadow-black/40">
                       <div className="mb-2 flex items-center justify-between border-b border-zinc-800/70 px-1 pb-2">
                         <div>
                           <div className="text-xs font-black text-white">Order settings</div>
                           <div className="text-[10px] font-semibold text-zinc-500">Applies to this trade ticket</div>
                         </div>
                         <div className="rounded-full border border-[#ccff00]/20 bg-[#ccff00]/10 px-2 py-1 font-mono text-[10px] font-bold text-[#ccff00]">
                           {ticketOrderPolicy}
                         </div>
                       </div>

                       <div className="space-y-2">
                         {([
                           {
                             id: 'FAK' as const,
                             title: 'Fill and Kill (FAK) Order',
                             copy: 'Fills as much as possible at the best available prices and cancels any remaining unfilled portion.',
                           },
                           {
                             id: 'FOK' as const,
                             title: 'Fill or Kill (FOK) Order',
                             copy: 'Executes the entire order immediately at specified price or cancels it completely.',
                           },
                        ]).map((option) => {
                           const active = ticketOrderPolicy === option.id;
                           return (
                             <button
                               key={option.id}
                               type="button"
                               onClick={() => {
                                 setTicketOrderPolicy(option.id);
                               }}
                               className={`flex w-full gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/60 ${active ? 'border-[#ccff00]/30 bg-[#ccff00]/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900'}`}
                             >
                               <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-[#ccff00] bg-[#ccff00]/10' : 'border-zinc-600'}`}>
                                 {active && <span className="h-2.5 w-2.5 rounded-full bg-[#ccff00]" />}
                               </span>
                               <span>
                                 <span className="flex items-center gap-2 text-sm font-black text-zinc-100">
                                   {option.title}
                                 </span>
                                 <span className="mt-1 block text-xs font-medium leading-relaxed text-zinc-400">{option.copy}</span>
                               </span>
                             </button>
                           );
                         })}
                       </div>

                       <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                         <div className="mb-2 flex items-center justify-between gap-3">
                           <span className="text-sm font-black text-zinc-200">Slippage Tolerance</span>
                           <label className="flex items-center gap-1 rounded-full bg-[#2b2b3d] px-3 py-1.5 font-mono text-sm font-black text-cyan-300">
                             <span>Auto:</span>
                             <input
                               value={ticketSlippageTolerance}
                               onChange={(event) => {
                                 const next = event.target.value.replace(/[^\d.]/g, '').slice(0, 5);
                                 setTicketSlippageTolerance(next);
                               }}
                               className="w-12 bg-transparent text-right outline-none"
                               inputMode="decimal"
                               aria-label="Slippage tolerance percent"
                             />
                             <span>%</span>
                           </label>
                         </div>
                         <div className="grid grid-cols-4 gap-1.5">
                           {['0.10', '0.50', '1.00', '2.00'].map((value) => (
                             <button
                               key={value}
                               type="button"
                               onClick={() => setTicketSlippageTolerance(value)}
                               className={`rounded-md border px-2 py-1.5 font-mono text-[11px] font-bold transition-colors ${ticketSlippageTolerance === value ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'}`}
                             >
                               {value}%
                             </button>
                           ))}
                         </div>
                       </div>

                     </div>
                   )}
                 </div>
             </div>

              <div className="flex flex-col gap-3 p-3 animate-in fade-in duration-300 2xl:p-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-3 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => selectTicketOutcome('yes')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'yes' ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-transparent border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'}`}>
                          YES {displayPriceLabel(selectedTicketOutcome?.yesPrice, marketDiagnosticsEnabled)}
                      </button>
                      <button type="button" onClick={() => selectTicketOutcome('no')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'no' ? 'bg-[#E52B50] text-white hover:bg-[#ff3366]' : 'bg-transparent border border-red-500/30 text-red-500 hover:bg-red-500/10'}`}>
                          NO {displayPriceLabel(selectedTicketOutcome?.noPrice, marketDiagnosticsEnabled)}
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
                              setTicketOrchestratorOrder(null);
                              setTicketOrchestratorAmount(null);
                              setTicketOrchestratorAutoRenewFailed(false);
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
                      {executionOrchestratorEnabled && ticketRouteReady && ticketOrchestratorOrder && ticketOrchestratorRouteLegs.length > 0 && (
                        <div className="rounded-lg border border-emerald-500/20 bg-[#0c0c0e] p-2.5 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                          <div className="flex items-center justify-between gap-3 border-b border-zinc-800/60 pb-1.5">
                            <span className="h-px min-w-0 flex-1 bg-zinc-800/70" aria-hidden />
                            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-emerald-400">
                              {ticketOrchestratorRouteBadge}
                            </span>
                            <span className="h-px min-w-0 flex-1 bg-zinc-800/70" aria-hidden />
                          </div>
                          <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1 font-mono text-[9px] custom-scrollbar">
                            {ticketOrchestratorRouteLegs.map((leg, index) => (
                              <React.Fragment key={`${leg.venue}-${index}`}>
                                {index > 0 && (
                                  <div className="flex items-center justify-center text-zinc-600">
                                    <ChevronRight className="h-3 w-3" aria-hidden />
                                  </div>
                                )}
                                <div className="min-w-[120px] flex-1 rounded border border-zinc-800 bg-[#121214] p-1.5 text-center">
                                  <div className="mx-auto mb-0.5 w-max font-sans text-[8px] font-bold uppercase tracking-wider text-zinc-500">
                                    Leg {index + 1}
                                  </div>
                                  <div className="flex items-center justify-center gap-1 font-bold tracking-tighter text-emerald-400">
                                    <VenueLogo id={normalizeVenueId(leg.venue)} label={formatVenueLabel(leg.venue)} className="h-3 w-3 rounded-full" />
                                    {formatVenueLabel(leg.venue)}
                                  </div>
                                  <div className="mx-auto mt-1 w-max border-b border-dashed border-zinc-800 pb-0.5 text-[10px] text-zinc-300">
                                    {formatProbabilityPrice(leg.price ?? ticketEffectivePrice)}
                                  </div>
                                  {leg.size && (
                                    <div className="mt-1 text-[9px] text-zinc-500">
                                      {(formatCompactMetric(leg.size) ?? leg.size)} shares
                                    </div>
                                  )}
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                          {ticketOrchestratorEstimatedSavings !== null && (
                            <div className="mt-1.5 rounded border border-[#ccff00]/20 bg-[#ccff00]/10 p-1.5 text-center">
                              <span className="text-[10px] font-bold text-[#ccff00]">
                                Estimated savings: {formatUsdc(ticketOrchestratorEstimatedSavings)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {!executionOrchestratorEnabled && ticketQuote && (
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

                      {ticketError && !executionOrchestratorEnabled && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
                          {ticketError}
                        </div>
                      )}
                      {ticketStatusMessage && !executionOrchestratorEnabled && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-200">
                          {ticketStatusMessage}{ticketExecutionId ? ` ${ticketExecutionId}` : ''}
                        </div>
                      )}
                      {ticketPolymarketClobPropagationPending && !executionOrchestratorEnabled && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-100">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-100">
                              <Clock className="h-3.5 w-3.5" aria-hidden />
                              Polymarket readiness
                            </span>
                            <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-amber-100">
                              {ticketReadinessPolling ? 'checking' : 'pending'}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-1.5 text-amber-100/90">
                            <div className="flex items-center justify-between gap-3">
                              <span>CLOB sync confirmed locally</span>
                              <span className="shrink-0 font-mono text-amber-50">{ticketPolymarketLocalBalanceLabel}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Live submit spendable</span>
                              <span className="shrink-0 font-mono text-amber-50">{ticketPolymarketLiveSubmitSpendableLabel}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Last checked</span>
                              <span className="shrink-0 font-mono text-amber-50">{ticketReadinessLastCheckedLabel}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>{ticketReadinessQuoteExpired ? 'Quote status' : 'Next check'}</span>
                              <span className="shrink-0 font-mono text-amber-50">
                                {ticketReadinessQuoteExpired ? 'Expired' : ticketReadinessNextCheckLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {!executionOrchestratorEnabled && ticketBlockedRoutes.slice(0, 3).map((blocked) => (
                        <div key={`${blocked.venue}-${blocked.venueMarketId ?? blocked.reason}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[10px] font-semibold text-zinc-400">
                          {formatVenueLabel(blocked.venue)} unavailable: {readableQuoteBlocker(blocked.reason) ?? blocked.reason}
                        </div>
                      ))}
                      {ticketSignatureBundle && !executionOrchestratorEnabled && (
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

                      {!executionOrchestratorEnabled && orderAction === 'preview' && ticketRouteReady && ticketQuote && (
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
                      if (ticketActionNeedsConfirmation && !ticketConfirmArmed) {
                        setTicketConfirmArmed(true);
                        return;
                      }
                      setTicketConfirmArmed(false);
                      if (executionOrchestratorEnabled) {
                        void placeOrchestratorOrder();
                      } else if (ticketActivationRequired) {
                        void activatePolymarketFunds();
                      } else if (ticketRouteApprovalRequired) {
                        void approveRouteCollateral();
                      } else if (ticketLimitlessBalanceBlocked) {
                        setTicketStatusMessage('Lower the order amount or add Base USDC to your Limitless wallet, then preview the route again.');
                      } else if (ticketLimitlessSetupRequired) {
                        void activateLimitlessAccount();
                      } else if (ticketPredictFunAuthRequired) {
                        void refreshPredictFunAuth();
                      } else if (ticketOpinionSetupRequired) {
                        void activateOpinionTradingSafe();
                      } else if (ticketDepositRequired) {
                        setFundingModalOpen(true);
                      } else if (ticketPolymarketClobPropagationPending) {
                        if (ticketReadinessQuoteExpired) {
                          void previewMarketOrder();
                        } else {
                          void refreshPolymarketClobReadiness();
                        }
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
                    className={`w-full font-bold py-3.5 rounded-lg text-sm transition-colors mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${ticketPrimaryButtonClass} ${ticketPrimaryDisabledClass}`}
                  >
                      {ticketActionDisplayLabel}
                  </button>

                  {!executionOrchestratorEnabled && <div className="grid grid-cols-2 gap-2 pt-1">
                      {ticketPolymarketClobPropagationPending ? (
                        <button
                          type="button"
                          onClick={() => void previewMarketOrder()}
                          disabled={ticketLoading || ticketReadinessPolling}
                          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-[10px] font-bold uppercase text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
                        >
                          <ChevronRight className="h-3 w-3" aria-hidden /> Preview new route
                        </button>
                      ) : (
                        <button type="button" disabled className="flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-[#0c0c0e] px-3 text-[10px] font-bold uppercase text-zinc-500 transition-all cursor-not-allowed">
                            <Ghost className="w-3 h-3" /> BACKEND PROTECTION
                        </button>
                      )}
                      <button type="button" disabled className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-[10px] uppercase font-bold transition-all bg-[#0c0c0e] border-zinc-800 text-zinc-500 cursor-not-allowed">
                          <Zap className="w-3 h-3" /> ROUTE CONTROLLED
                      </button>
                  </div>}
              </div>
              {false && (side === 'buy' ? (
                 <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300">
                     <div className="grid grid-cols-2 gap-3">
                         <button type="button" onClick={() => selectTicketOutcome('yes')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'yes' ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-transparent border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'}`}>
                             YES {displayPriceLabel(selectedTicketOutcome?.yesPrice, marketDiagnosticsEnabled)}
                         </button>
                         <button type="button" onClick={() => selectTicketOutcome('no')} className={`font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70 ${ticketOutcomeSide === 'no' ? 'bg-[#E52B50] text-white hover:bg-[#ff3366]' : 'bg-transparent border border-red-500/30 text-red-500 hover:bg-red-500/10'}`}>
                             NO {displayPriceLabel(selectedTicketOutcome?.noPrice, marketDiagnosticsEnabled)}
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
                             YES {displayPriceLabel(selectedOutcome?.yesPrice, marketDiagnosticsEnabled)}
                         </button>
                         <button className="bg-[#E52B50] hover:bg-[#ff3366] text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors text-lg">
                             NO {displayPriceLabel(selectedOutcome?.noPrice, marketDiagnosticsEnabled)}
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

         <div className="bg-[#121214] border border-zinc-800 rounded-xl p-2.5 2xl:p-3 flex flex-col gap-2 shrink-0 xl:max-h-[240px] xl:overflow-y-auto custom-scrollbar">
             <div className="flex items-start justify-between gap-3">
                 <div>
                     <div className="flex items-center gap-2">
                         <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                         <h3 className="text-sm font-black text-white">Open Position</h3>
                     </div>
                     <p className="mt-1 text-[10px] text-zinc-500">Auto-refreshes after venue fills</p>
                 </div>
                 <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-300">
                     live
                 </span>
             </div>

             <div className="rounded-xl border border-[#ccff00]/20 bg-[#ccff00]/[0.055] p-2.5">
                 <div className="flex items-end justify-between gap-3">
                     <div>
                         <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Position Value</p>
                         <div className="mt-1 font-mono text-2xl font-black text-emerald-400">{positionValueDisplay}</div>
                     </div>
                     <div className="text-right">
                         <p className="text-[10px] font-semibold text-zinc-500">Share amount</p>
                         <p className="mt-1 text-[10px] font-semibold text-emerald-300">{positionShareDisplay}</p>
                         <p className="mt-1 text-[10px] font-semibold text-zinc-400">Avg entry {positionAverageEntryDisplay}</p>
                     </div>
                 </div>
                 <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-zinc-900">
                     {totalVerifiedSize > 0 ? (
                       positionVenueRows.slice(0, 4).map((row, index) => (
                         <div
                           key={row.key}
                           className={`h-full ${index === 0 ? 'bg-blue-500' : index === 1 ? 'bg-[#ccff00]' : index === 2 ? 'bg-purple-500' : 'bg-emerald-500'}`}
                           style={{ width: `${Math.max(8, (row.size / totalVerifiedSize) * 100)}%` }}
                         />
                       ))
                     ) : (
                       <div className="h-full w-full bg-zinc-800" />
                     )}
                 </div>
             </div>

             <div className="space-y-2">
                 {positionVenueRows.map((row) => (
                     <div key={row.key} className="rounded-lg border border-zinc-800 bg-[#0c0c0e] px-3 py-2">
                         <div className="flex items-center justify-between gap-3">
                             <div className="flex min-w-0 items-center gap-2">
                                 <VenueLogo id={row.logo} label={row.venue} className="h-5 w-5 rounded-full" />
                                 <div className="min-w-0">
                                     <p className="truncate text-xs font-bold text-zinc-200">{row.venue}</p>
                                     <p className="text-[10px] font-medium text-zinc-500">{row.shares} shares</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="font-mono text-sm font-black text-emerald-400">{formatTerminalCurrency(row.value)}</p>
                                 <p className="text-[10px] text-zinc-500">Avg {row.avgEntry}</p>
                             </div>
                         </div>
                     </div>
                 ))}
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
