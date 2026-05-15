import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AuthState, useTurnkey, type Wallet as TurnkeyWallet, type WalletAccount } from '@turnkey/react-wallet-kit';
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
  BarChart2, Calendar, ChevronLeft, ChevronRight, Search, Share, ShieldCheck, Copy, Check
} from 'lucide-react';
import { ChainLogo, CryptoLogo, VenueLogo } from '@/components/icons/asset-logo';
import type { AuthSession } from '@/features/auth/types';
import {
  ensureDefaultWallets,
  prepareVenueSetupBatch,
  registerTurnkeyDefaultWallets,
  type TurnkeyWalletAccountRegistration,
  type UserVenueAccount,
  type UserWallet
} from '@/features/wallets/api/wallet-api';
import {
  getExecutionHistory,
  getExecutionReceipt,
  getOpenOrders,
  getPortfolioSummary,
  getPortfolioTimeSeries,
  type ExecutionStatus,
  type PortfolioSummary,
  type PortfolioTimeSeriesResponse,
} from '@/features/trading/api/execution-api';
import {
  getFundingHistory,
  getFundingReceipt,
  getVenueActivations,
  getVenueBalances,
  getWithdrawalReceipt,
  preparePolymarketActivation,
  submitPolymarketActivation,
  type FundingHistoryRow,
  type FundingReceipt,
  type PolymarketActivationPreparation,
  type VenueActivation,
  type VenueBalance,
  type WithdrawalReceipt,
} from '@/features/funding/api/funding-api';
import { listMarkets, type MarketCatalogMarket } from '@/features/markets/api/market-api';
import { ApiClientError } from '@/lib/api/http-client';
import { openExecutionSocket } from '@/lib/ws/execution-ws-client';
import { FundingDeposit } from './FundingDeposit';
import { DepositFailedReceipt } from './DepositFailedReceipt';
import { DepositSuccessReceipt } from './DepositSuccessReceipt';

type PerformanceRange = '1D' | '7D' | '30D' | '90D' | 'ALL';
type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
const TRADE_HISTORY_PAGE_SIZE = 3;
const PORTFOLIO_TABLE_PAGE_SIZE = 3;

const notificationSettingsStorageKey = 'lotus.notification.settings';

const loadPortfolioNotificationSettings = (): { toastPosition: ToastPosition; notificationsEnabled: boolean } => {
  if (typeof window === 'undefined') {
    return { toastPosition: 'bottom-right', notificationsEnabled: true };
  }
  try {
    const raw = window.localStorage.getItem(notificationSettingsStorageKey);
    if (!raw) return { toastPosition: 'bottom-right', notificationsEnabled: true };
    const parsed = JSON.parse(raw) as { toastPosition?: unknown; notificationsEnabled?: unknown };
    const positions: ToastPosition[] = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    return {
      toastPosition: positions.includes(parsed.toastPosition as ToastPosition) ? parsed.toastPosition as ToastPosition : 'bottom-right',
      notificationsEnabled: typeof parsed.notificationsEnabled === 'boolean' ? parsed.notificationsEnabled : true,
    };
  } catch {
    return { toastPosition: 'bottom-right', notificationsEnabled: true };
  }
};

const portfolioToastPositionClass = (position: ToastPosition) => {
  switch (position) {
    case 'top-left':
      return 'left-6 top-6';
    case 'top-center':
      return 'left-1/2 top-6 -translate-x-1/2';
    case 'top-right':
      return 'right-6 top-6';
    case 'bottom-left':
      return 'bottom-16 left-6';
    case 'bottom-center':
      return 'bottom-16 left-1/2 -translate-x-1/2';
    case 'bottom-right':
    default:
      return 'bottom-16 right-6';
  }
};

type PortfolioPerformancePoint = {
  label: string;
  date: string;
  costBasis: number;
  unrealizedPnl: number;
  totalValue: number;
  positionCount: number;
  markedPositionCount: number;
  source: 'history' | 'snapshot';
};

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

const parseMoney = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const isOpenExecutionPosition = (position: { verifiedSize?: string | number | null }) =>
  (parseMoney(position.verifiedSize) ?? 0) > 0;

const formatMaybeCurrency = (value: string | number | null | undefined, fallback = 'Unavailable') => {
  const parsed = parseMoney(value);
  return parsed === null ? fallback : formatCurrency(parsed);
};

const formatMaybeSignedCurrency = (value: string | number | null | undefined) => {
  const parsed = parseMoney(value);
  return parsed === null ? 'Unavailable' : formatSignedCurrency(parsed);
};

const formatTokenAmount = (value: string | number | null | undefined) => {
  const parsed = parseMoney(value);
  if (parsed === null) return null;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: parsed >= 100 ? 2 : 4,
    minimumFractionDigits: 0,
  }).format(parsed);
};

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const polymarketActivationConfirmed = (activation: VenueActivation | null | undefined) => {
  const readinessReason = String(activation?.readinessReason ?? '').toUpperCase();
  return activation?.activationRequired === false || readinessReason === 'POLYMARKET_CLOB_COLLATERAL_CONFIRMED';
};

const polymarketActivationPollingMessage = (
  activation: VenueActivation | null | undefined,
  relayerState?: string,
  relayerReference?: string
) => {
  const readinessReason = String(activation?.readinessReason ?? '').toUpperCase();
  const bridged = formatTokenAmount(activation?.bridgedUsdcBalance ?? null);
  const pUsd = formatTokenAmount(activation?.onchainPusdBalance ?? null);
  const clobBalance = formatTokenAmount(activation?.clobCollateralBalance ?? null);
  const clobAllowance = formatTokenAmount(activation?.clobCollateralAllowance ?? null);
  const relayer = [
    relayerState ? `State: ${relayerState}.` : null,
    relayerReference ? `Relayer reference: ${relayerReference}.` : null,
  ].filter(Boolean).join(' ');

  if (polymarketActivationConfirmed(activation)) {
    return `Polymarket funds are active and ready to trade. CLOB balance: ${clobBalance ?? 'confirmed'} USDC.`;
  }
  if (readinessReason === 'POLYMARKET_USDCE_ACTIVATION_REQUIRED' || (parseMoney(activation?.bridgedUsdcBalance) ?? 0) > 0) {
    return `Polymarket activation submitted. USDC.e is delivered (${bridged ?? 'detected'}), and Lotus is polling until it becomes spendable CLOB collateral. ${relayer}`.trim();
  }
  if (readinessReason === 'POLYMARKET_CLOB_APPROVAL_REQUIRED' || (parseMoney(activation?.onchainPusdBalance) ?? 0) > 0) {
    return `Polymarket pUSD is detected (${pUsd ?? 'detected'}), and Lotus is polling until CLOB approval is confirmed. ${relayer}`.trim();
  }
  return `Polymarket activation was submitted. Lotus is polling balance and allowance readiness until trading is enabled. ${relayer}`.trim();
};

const fundingWalletBalances = (wallet: UserWallet) =>
  (wallet.balances ?? [])
    .map((balance) => {
      const amount = formatTokenAmount(balance.amount);
      const token = balance.token?.trim().toUpperCase();
      const chain = balance.chain?.trim().toUpperCase();
      return amount && token ? { token, amount, chain } : null;
    })
    .filter((balance): balance is { token: string; amount: string; chain: string | undefined } => Boolean(balance));

const fundingBalanceLogoId = (wallet: UserWallet, balance: { token: string; chain?: string }) =>
  wallet.chainFamily === 'EVM' && balance.chain ? balance.chain.trim() : balance.token;

const fundingBalanceUsesChainLogo = (wallet: UserWallet, balance: { chain?: string }) =>
  wallet.chainFamily === 'EVM' && Boolean(balance.chain);

const fundingBalanceTitle = (balance: { token: string; chain?: string }) =>
  [balance.chain, balance.token].filter(Boolean).join(' ');

const venueKey = (venue: string) => venue.toUpperCase().replace(/[\s.-]+/g, '_');

const venueLabel = (venue: string) =>
  trackedVenues.find((item) => item.backend === venueKey(venue) || item.id === venue.toLowerCase())?.label ??
  venue.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const venueLogoId = (venue: string) =>
  trackedVenues.find((item) => item.backend === venueKey(venue) || item.id === venue.toLowerCase())?.id ?? venue.toLowerCase();

const userSafeError = (error: unknown) => error instanceof Error ? error.message : 'Portfolio data is temporarily unavailable.';

const shortAddress = (value: string) => value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;

const formatPositionDateLabel = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.replace(/_/g, '-');
  const match = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const fallbackPositionMarketTitle = (marketId: string): string => {
  const withoutPrefix = marketId.replace(/^FRONTEND_CURATED:/, '');
  const withoutVenue = withoutPrefix.replace(/:[A-Z0-9_]+$/, '');
  const parts = withoutVenue.split('|');
  const [category, type, asset] = parts;
  if (type === 'ATH_BY_DATE' && asset) return `${asset.toUpperCase()} ATH by ____`;
  if (type?.includes('BY_DATE') && parts.length >= 3) {
    const topic = parts.slice(1, -1).join(' ').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
    return `${topic} by ____`;
  }
  if (type?.includes('FDV')) return `${asset ? asset.toUpperCase() : 'FDV'} threshold`;
  return withoutVenue
    .replace(`${category ?? ''}|`, '')
    .replace(/[|_]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim() || marketId;
};

const fallbackPositionOutcomeLabel = (marketId: string, outcomeId: string): string => {
  const withoutPrefix = marketId.replace(/^FRONTEND_CURATED:/, '');
  const withoutVenue = withoutPrefix.replace(/:[A-Z0-9_]+$/, '');
  const parts = withoutVenue.split('|');
  const candidate = parts[parts.length - 1];
  const dateLabel = formatPositionDateLabel(candidate);
  if (dateLabel) return dateLabel;
  if (outcomeId && outcomeId !== 'YES' && outcomeId !== 'NO') return outcomeId.replace(/[_-]+/g, ' ');
  return outcomeId;
};

const positionMarketMatchesCatalog = (positionMarketId: string, market: MarketCatalogMarket): boolean => {
  const ids = [market.eventId, market.canonicalEventId, ...market.canonicalMarketIds].filter(Boolean) as string[];
  return ids.some((id) =>
    positionMarketId === id ||
    positionMarketId.startsWith(`${id}:`) ||
    id.startsWith(`${positionMarketId}:`)
  );
};

const PositionMarketImage = ({
  title,
  imageUrl,
  iconUrl,
  venue,
}: {
  title: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  venue: string;
}) => {
  const [failed, setFailed] = useState(false);
  const mediaUrl = !failed ? imageUrl ?? iconUrl : null;
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900">
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
        <div className="flex h-full w-full items-center justify-center text-sm font-black text-zinc-300">
          {title.slice(0, 1).toUpperCase()}
        </div>
      )}
      <VenueLogo
        id={venueLogoId(venue)}
        label={venueLabel(venue)}
        className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-[#121214]"
      />
    </div>
  );
};

const formatPortfolioDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const numberFromUnknown = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const executionSide = (execution: ExecutionStatus): 'buy' | 'sell' | null => {
  const side = String(execution.route?.side ?? '').toLowerCase();
  return side === 'buy' || side === 'sell' ? side : null;
};

const executionFilledShares = (execution: ExecutionStatus): number => {
  const legSizes = execution.submittedLegs?.map((leg) => {
    const fillState = isRecord(leg.fillState) ? leg.fillState : null;
    return numberFromUnknown(fillState?.filledSize);
  }).filter((value): value is number => value !== null && value > 0) ?? [];
  if (legSizes.length > 0) {
    return legSizes.reduce((sum, value) => sum + value, 0);
  }
  return (execution.route?.legs ?? [])
    .map((leg) => parseMoney(leg.size) ?? 0)
    .reduce((sum, value) => sum + value, 0);
};

const executionAveragePrice = (execution: ExecutionStatus): number | null => {
  const filledLegs = execution.submittedLegs?.map((leg) => {
    const fillState = isRecord(leg.fillState) ? leg.fillState : null;
    const size = numberFromUnknown(fillState?.filledSize);
    const price = numberFromUnknown(fillState?.averagePrice);
    return size && price ? { size, price } : null;
  }).filter((value): value is { size: number; price: number } => value !== null) ?? [];
  if (filledLegs.length > 0) {
    const totalSize = filledLegs.reduce((sum, leg) => sum + leg.size, 0);
    if (totalSize > 0) {
      return filledLegs.reduce((sum, leg) => sum + leg.size * leg.price, 0) / totalSize;
    }
  }
  return execution.route?.effectivePrice ?? execution.route?.expectedPrice ?? null;
};

const executionFilledValue = (execution: ExecutionStatus): number => {
  const shares = executionFilledShares(execution);
  const price = executionAveragePrice(execution);
  if (shares > 0 && price !== null) return shares * price;
  return parseMoney(execution.route?.executableAmount) ?? 0;
};

const executionStatusLabel = (execution: ExecutionStatus) =>
  String(execution.userStatus ?? execution.status ?? 'UNKNOWN').replace(/_/g, ' ');

const executionDisplayStatus = (execution: ExecutionStatus) =>
  String(execution.userStatus ?? execution.status ?? '').toUpperCase();

const executionStatusTone = (execution: ExecutionStatus) => {
  const status = executionDisplayStatus(execution);
  if (['FILLED', 'SETTLED', 'COMPLETED'].includes(status)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (['PARTIAL', 'PARTIAL_FILL'].includes(status)) return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-lotus-500/30 bg-lotus-500/10 text-lotus-300';
};

const executionSettlementLabel = (execution: ExecutionStatus) =>
  String(execution.settlementStatus ?? 'Pending').replace(/_/g, ' ');

const executionRouteSummary = (execution: ExecutionStatus) =>
  execution.route?.venuePath?.map(venueLabel).join(' / ') || execution.submittedLegs?.map((leg) => venueLabel(leg.venue)).join(' / ') || '-';

const executionReceiptText = (receipt: ExecutionStatus) => {
  const side = executionSide(receipt);
  const shares = executionFilledShares(receipt);
  const price = executionAveragePrice(receipt);
  return [
    'Lotus execution receipt',
    `Execution: ${receipt.executionId}`,
    `Status: ${executionStatusLabel(receipt)}`,
    side ? `Side: ${side.toUpperCase()}` : null,
    `Filled: ${formatCurrency(executionFilledValue(receipt))}`,
    shares > 0 ? `Shares: ${formatTokenAmount(shares)}` : null,
    price !== null ? `Average price: ${(price * 100).toFixed(2)}c` : null,
    `Route: ${executionRouteSummary(receipt)}`,
    `Updated: ${receipt.updatedAt ?? receipt.submittedAt ?? '-'}`,
  ].filter(Boolean).join('\n');
};

const fundingDirectionLabel = (row: FundingHistoryRow) =>
  row.direction?.toUpperCase() === 'WITHDRAWAL' ? 'Withdrawal' : 'Deposit';

const fundingHistoryItems = (response: Awaited<ReturnType<typeof getFundingHistory>>) =>
  response.items ?? response.rows ?? response.history ?? [];

const fundingReceiptText = (direction: string, receipt: FundingReceipt | WithdrawalReceipt) => {
  const isWithdrawal = direction.toUpperCase() === 'WITHDRAWAL';
  const id = isWithdrawal ? (receipt as WithdrawalReceipt).withdrawalIntentId : (receipt as FundingReceipt).fundingIntentId;
  const amount = isWithdrawal ? (receipt as WithdrawalReceipt).amount : (receipt as FundingReceipt).sourceAmount;
  const token = isWithdrawal ? (receipt as WithdrawalReceipt).token : (receipt as FundingReceipt).sourceToken;
  const routeLegs = Array.isArray(receipt.routeLegs) ? receipt.routeLegs.length : 0;
  return [
    `Lotus ${isWithdrawal ? 'withdrawal' : 'funding'} receipt`,
    `Intent: ${id}`,
    `Status: ${receipt.currentStatus}`,
    `Amount: ${amount} ${token}`,
    `Route legs: ${routeLegs}`,
    `Updated: ${receipt.updatedAt}`,
    receipt.userSafeMessage ? `Message: ${receipt.userSafeMessage}` : null,
  ].filter(Boolean).join('\n');
};

const fundingStatusTone = (status?: string) => {
  const normalized = String(status ?? '').toUpperCase();
  if (['READY_TO_TRADE', 'COMPLETED', 'DESTINATION_CONFIRMED', 'LEG_DESTINATION_CONFIRMED'].includes(normalized)) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(normalized)) {
    return 'border-red-500/30 bg-red-500/10 text-red-300';
  }
  if (['BRIDGING', 'INDEXING_PENDING', 'LEG_BRIDGE_PENDING', 'QUOTE_READY', 'USER_SIGNATURE_REQUIRED'].includes(normalized)) {
    return 'border-lotus-500/30 bg-lotus-500/10 text-lotus-300';
  }
  return 'border-zinc-700 bg-zinc-900 text-zinc-300';
};

const fundingRouteSummary = (row: FundingHistoryRow) => {
  const venue = row.venue ? venueLabel(row.venue) : 'Venue';
  const source = row.sourceChain ? row.sourceChain.replace(/_/g, ' ') : row.direction?.toUpperCase() === 'WITHDRAWAL' ? venue : 'Source';
  const destination = row.destinationChain ? row.destinationChain.replace(/_/g, ' ') : row.direction?.toUpperCase() === 'WITHDRAWAL' ? 'Wallet' : venue;
  return `${source} -> ${destination}`;
};

const fundingReceiptId = (direction: string, receipt: FundingReceipt | WithdrawalReceipt) =>
  direction.toUpperCase() === 'WITHDRAWAL'
    ? (receipt as WithdrawalReceipt).withdrawalIntentId
    : (receipt as FundingReceipt).fundingIntentId;

const isFundingDirection = (direction: string) => direction.toUpperCase() !== 'WITHDRAWAL';

const isFailedFundingReceipt = (receipt: FundingReceipt): boolean => {
  const status = receipt.currentStatus.toUpperCase();
  if (status.includes('FAILED') || status.includes('ERROR') || status.includes('REJECTED')) return true;
  return (receipt.routeLegs ?? []).some((leg) => {
    const record = leg && typeof leg === 'object' && !Array.isArray(leg) ? leg as Record<string, unknown> : {};
    const legStatus = String(record.status ?? record.legStatus ?? record.providerStatus ?? '').toUpperCase();
    return legStatus.includes('FAILED') || legStatus.includes('ERROR') || legStatus.includes('REJECTED');
  });
};

const fundingReceiptAmount = (direction: string, receipt: FundingReceipt | WithdrawalReceipt) => {
  if (direction.toUpperCase() === 'WITHDRAWAL') {
    const withdrawal = receipt as WithdrawalReceipt;
    return `${formatTokenAmount(withdrawal.amount) ?? withdrawal.amount} ${withdrawal.token}`;
  }
  const funding = receipt as FundingReceipt;
  return `${formatTokenAmount(funding.sourceAmount) ?? funding.sourceAmount} ${funding.sourceToken}`;
};

const receiptLegText = (leg: unknown) => {
  const record = (leg ?? {}) as Record<string, unknown>;
  const venue = String(record.targetVenue ?? record.sourceVenue ?? record.venue ?? 'Venue');
  const status = String(record.status ?? record.bridgeStatus ?? record.destinationStatus ?? 'Pending');
  const source = String(record.sourceChain ?? record.sourceToken ?? 'Source');
  const destination = String(record.destinationChain ?? record.destinationToken ?? 'Destination');
  return `${venueLabel(venue)} - ${source} -> ${destination} - ${status.replace(/_/g, ' ')}`;
};

const evmAddressEquals = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

const findTurnkeyWalletAccount = (wallets: TurnkeyWallet[], ownerAddress: string): WalletAccount | null => {
  for (const wallet of wallets) {
    for (const account of wallet.accounts ?? []) {
      if (evmAddressEquals(account.address, ownerAddress)) {
        return account;
      }
    }
  }
  return null;
};

const turnkeyDefaultAccountParams = [
  {
    curve: 'CURVE_ED25519',
    pathFormat: 'PATH_FORMAT_BIP32',
    path: "m/44'/501'/0'/0'",
    addressFormat: 'ADDRESS_FORMAT_SOLANA',
  },
  {
    curve: 'CURVE_SECP256K1',
    pathFormat: 'PATH_FORMAT_BIP32',
    path: "m/44'/60'/0'/0/0",
    addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
  },
] as const;

const turnkeyWalletRegistrations = (wallets: TurnkeyWallet[]): TurnkeyWalletAccountRegistration[] =>
  wallets.flatMap((wallet) =>
    (wallet.accounts ?? [])
      .filter((account) =>
        account.addressFormat === 'ADDRESS_FORMAT_SOLANA' ||
        account.addressFormat === 'ADDRESS_FORMAT_ETHEREUM'
      )
      .map((account) => ({
        providerWalletId: account.walletId ?? wallet.walletId,
        providerWalletAccountId: account.walletAccountId,
        address: account.address,
        addressFormat: account.addressFormat as TurnkeyWalletAccountRegistration['addressFormat'],
      }))
  ).filter((account) =>
    Boolean(account.providerWalletId && account.providerWalletAccountId && account.address)
  );

const isWalletProvisioningUnavailable = (error: unknown) =>
  error instanceof ApiClientError && error.code === 'USER_WALLET_UNAVAILABLE';

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

const activationTypedDataPayload = (activation: PolymarketActivationPreparation) => JSON.stringify({
  ...activation.typedData,
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    ...activation.typedData.types,
  },
});

const isTurnkeyMissingSessionError = (error: unknown) =>
  error instanceof Error && /No active session found|valid session|Fetching embedded wallets/i.test(error.message);

const turnkeySessionRequiredMessage =
  'Your Lotus session is active, but the Turnkey wallet session needs to be refreshed before signing. Reconnect with Turnkey, then activate again.';

const pointFromSnapshot = (point: PortfolioTimeSeriesResponse['points'][number]): PortfolioPerformancePoint => {
  const totalValue = parseMoney(point.totalMarkValue) ?? parseMoney(point.totalCostBasis) ?? 0;
  const unrealizedPnl = parseMoney(point.totalUnrealizedPnl) ?? 0;
  return {
    label: new Date(point.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    date: point.timestamp,
    costBasis: parseMoney(point.totalCostBasis) ?? 0,
    unrealizedPnl,
    totalValue,
    positionCount: point.positionCount,
    markedPositionCount: point.markedPositionCount,
    source: 'history',
  };
};

const rangeStartLabel: Record<PerformanceRange, string> = {
  '1D': '24h ago',
  '7D': '7d ago',
  '30D': '30d ago',
  '90D': '90d ago',
  ALL: 'Start',
};

const baselinePerformanceSeries = (
  range: PerformanceRange,
  summary: PortfolioSummary | null,
  currentTotalValue: number,
): PortfolioPerformancePoint[] => {
  const generatedAt = summary?.generatedAt ?? new Date().toISOString();
  const costBasis = parseMoney(summary?.totalCostBasis) ?? 0;
  const unrealizedPnl = parseMoney(summary?.totalUnrealizedPnl) ?? 0;
  const totalValue = parseMoney(summary?.totalMarkValue) ?? currentTotalValue;
  const basePoint = {
    costBasis,
    unrealizedPnl,
    totalValue,
    positionCount: summary?.positionCount ?? 0,
    markedPositionCount: summary?.markedPositionCount ?? 0,
    source: 'snapshot' as const,
  };

  return [
    {
      ...basePoint,
      label: rangeStartLabel[range],
      date: generatedAt,
    },
    {
      ...basePoint,
      label: 'Now',
      date: generatedAt,
    },
  ];
};

const tradeDrivenPerformanceSeries = (
  range: PerformanceRange,
  history: ExecutionStatus[],
  summary: PortfolioSummary | null,
  currentTotalValue: number,
): PortfolioPerformancePoint[] => {
  const rangeMs: Record<PerformanceRange, number | null> = {
    '1D': 24 * 60 * 60 * 1000,
    '7D': 7 * 24 * 60 * 60 * 1000,
    '30D': 30 * 24 * 60 * 60 * 1000,
    '90D': 90 * 24 * 60 * 60 * 1000,
    ALL: null,
  };
  const now = Date.now();
  const cutoff = rangeMs[range] === null ? null : now - rangeMs[range]!;
  const fills = history
    .filter((execution) => executionDisplayStatus(execution) === 'FILLED')
    .filter((execution) => {
      const timestamp = Date.parse(execution.updatedAt ?? execution.submittedAt ?? '');
      return Number.isFinite(timestamp) && (cutoff === null || timestamp >= cutoff);
    })
    .sort((left, right) =>
      Date.parse(left.updatedAt ?? left.submittedAt ?? '') - Date.parse(right.updatedAt ?? right.submittedAt ?? '')
    );
  if (fills.length === 0) {
    return baselinePerformanceSeries(range, summary, currentTotalValue);
  }

  let costBasis = 0;
  let realizedPnl = 0;
  let exposure = 0;
  const points: PortfolioPerformancePoint[] = [];
  for (const execution of fills) {
    const side = executionSide(execution);
    const value = executionFilledValue(execution);
    if (!side || value <= 0) continue;
    if (side === 'buy') {
      costBasis += value;
      exposure += value;
    } else {
      realizedPnl += value;
      exposure = Math.max(0, exposure - value);
      costBasis = Math.max(0, costBasis - value);
    }
    const timestamp = execution.updatedAt ?? execution.submittedAt ?? new Date().toISOString();
    points.push({
      label: new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      date: timestamp,
      costBasis,
      unrealizedPnl: realizedPnl,
      totalValue: exposure + realizedPnl,
      positionCount: summary?.positionCount ?? 0,
      markedPositionCount: summary?.markedPositionCount ?? 0,
      source: 'history',
    });
  }

  const latestTimestamp = summary?.generatedAt ?? new Date().toISOString();
  points.push({
    label: 'Now',
    date: latestTimestamp,
    costBasis: parseMoney(summary?.totalCostBasis) ?? costBasis,
    unrealizedPnl: parseMoney(summary?.totalUnrealizedPnl) ?? realizedPnl,
    totalValue: currentTotalValue,
    positionCount: summary?.positionCount ?? 0,
    markedPositionCount: summary?.markedPositionCount ?? 0,
    source: 'snapshot',
  });

  return points;
};

const hasFilledExecutionHistory = (history: ExecutionStatus[]) =>
  history.some((execution) => executionDisplayStatus(execution) === 'FILLED');

const venueSpecificAddress = (account?: UserVenueAccount): { address?: string; kind?: string } => {
  if (!account?.venueAccountAddress) {
    return {};
  }
  const venueAddress = account.venueAccountAddress.trim();
  const ownerAddress = account.walletAddress?.trim();
  const eoaVenueUsesOwnerWallet = account.venueAccountType === 'EOA'
    && ['PREDICT_FUN', 'MYRIAD', 'LIMITLESS'].includes(venueKey(account.venue));
  if (!venueAddress || (!eoaVenueUsesOwnerWallet && venueAddress.toLowerCase() === ownerAddress?.toLowerCase())) {
    return {};
  }
  return {
    address: venueAddress,
    kind: account.venueAccountType,
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
  venueAddress?: string;
  venueAddressKind?: string;
  venueAccountStatus?: string;
};

type PortfolioDataState = {
  summary: PortfolioSummary | null;
  timeseries: PortfolioTimeSeriesResponse | null;
  balances: VenueBalance[];
  activations: VenueActivation[];
  wallets: UserWallet[];
  venueAccounts: UserVenueAccount[];
  openOrders: ExecutionStatus[];
  history: ExecutionStatus[];
  fundingHistory: FundingHistoryRow[];
  marketCatalog: MarketCatalogMarket[];
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
          <span className="text-zinc-500">Portfolio value</span>
          <span className="font-mono font-semibold text-zinc-200">{formatCurrency(point.totalValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Unrealized PnL</span>
          <span className={`font-mono font-semibold ${point.unrealizedPnl >= 0 ? 'text-[#22c55e]' : 'text-red-400'}`}>
            {formatSignedCurrency(point.unrealizedPnl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Cost basis</span>
          <span className="font-mono font-semibold text-zinc-200">{formatCurrency(point.costBasis)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Positions</span>
          <span className="font-mono font-semibold text-zinc-200">{point.markedPositionCount}/{point.positionCount}</span>
        </div>
      </div>
    </div>
  );
}

export const PortfolioMockupV2: React.FC<{ session?: AuthSession | null }> = ({ session }) => {
  const {
    authState: turnkeyAuthState,
    session: turnkeySession,
    wallets: turnkeyWallets,
    refreshWallets,
    createWallet,
    handleLogin,
    signMessage,
  } = useTurnkey();
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history' | 'funding'>('positions');
  const [fundingModal, setFundingModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [performanceRange, setPerformanceRange] = useState<PerformanceRange>('7D');
  const [positionsPage, setPositionsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [tradeHistoryPage, setTradeHistoryPage] = useState(1);
  const [fundingHistoryPage, setFundingHistoryPage] = useState(1);
  const [data, setData] = useState<PortfolioDataState>({
    summary: null,
    timeseries: null,
    balances: [],
    activations: [],
    wallets: [],
    venueAccounts: [],
    openOrders: [],
    history: [],
    fundingHistory: [],
    marketCatalog: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [activationToast, setActivationToast] = useState<string | null>(null);
  const [notificationSettings, setNotificationSettings] = useState(loadPortfolioNotificationSettings);
  const [activatingVenueId, setActivatingVenueId] = useState<string | null>(null);
  const [copiedAddressKey, setCopiedAddressKey] = useState<string | null>(null);
  const [fundingReceipt, setFundingReceipt] = useState<{ direction: string; generatedAt?: string; receipt: FundingReceipt | WithdrawalReceipt } | null>(null);
  const [executionReceipt, setExecutionReceipt] = useState<{ generatedAt?: string; receipt: ExecutionStatus } | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [copiedExecutionId, setCopiedExecutionId] = useState<string | null>(null);
  const token = session?.userJwt ?? null;

  useEffect(() => {
    const updateSettings = () => setNotificationSettings(loadPortfolioNotificationSettings());
    window.addEventListener('storage', updateSettings);
    window.addEventListener('lotus:notification-settings', updateSettings);
    return () => {
      window.removeEventListener('storage', updateSettings);
      window.removeEventListener('lotus:notification-settings', updateSettings);
    };
  }, []);

  useEffect(() => {
    if (!activationMessage || !/polymarket/i.test(activationMessage) || !notificationSettings.notificationsEnabled) {
      return;
    }
    setActivationToast(activationMessage);
    const timeout = window.setTimeout(() => setActivationToast(null), 9_000);
    return () => window.clearTimeout(timeout);
  }, [activationMessage, notificationSettings.notificationsEnabled]);

  const ensureTurnkeySessionWallets = useCallback(async (): Promise<TurnkeyWallet[]> => {
    if (turnkeyAuthState !== AuthState.Authenticated) {
      throw new Error(turnkeySessionRequiredMessage);
    }

    let activeWallets = turnkeyWallets;
    if (activeWallets.length === 0) {
      activeWallets = await refreshWallets();
    }

    if (turnkeyWalletRegistrations(activeWallets).length === 0) {
      await createWallet({
        walletName: 'Lotus Wallet',
        accounts: [...turnkeyDefaultAccountParams],
        ...(turnkeySession?.organizationId ? { organizationId: turnkeySession.organizationId } : {}),
      });
      activeWallets = await refreshWallets();
    }

    return activeWallets;
  }, [createWallet, refreshWallets, turnkeyAuthState, turnkeySession?.organizationId, turnkeyWallets]);

  const ensureBackendWallets = useCallback(async () => {
    if (!token) {
      return { wallets: [] as UserWallet[] };
    }
    try {
      return await ensureDefaultWallets(token);
    } catch (walletError) {
      if (!isWalletProvisioningUnavailable(walletError)) {
        throw walletError;
      }
      const activeWallets = await ensureTurnkeySessionWallets();
      const registrations = turnkeyWalletRegistrations(activeWallets);
      if (registrations.length === 0) {
        throw new Error('Turnkey wallet session did not return a usable Solana or EVM wallet.');
      }
      return registerTurnkeyDefaultWallets(token, registrations);
    }
  }, [ensureTurnkeySessionWallets, token]);

  const loadPortfolio = useCallback(async () => {
    if (!token) {
      setData({ summary: null, timeseries: null, balances: [], activations: [], wallets: [], venueAccounts: [], openOrders: [], history: [], fundingHistory: [], marketCatalog: [] });
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [summary, timeseries, balanceResponse, activationResponse, walletResponse, venueAccounts, openOrders, history, fundingHistory, marketCatalogResponse] = await Promise.all([
        getPortfolioSummary(token),
        getPortfolioTimeSeries(token, { range: performanceRange }),
        getVenueBalances(token),
        getVenueActivations(token),
        ensureBackendWallets(),
        prepareVenueSetupBatch(token),
        getOpenOrders(token, { limit: 50 }),
        getExecutionHistory(token, { limit: 50 }),
        getFundingHistory(token, { pageSize: 50 }),
        listMarkets({ limit: 250 }),
      ]);

      setData({
        summary,
        timeseries,
        balances: balanceResponse.balances ?? balanceResponse.venues ?? [],
        activations: activationResponse.activations ?? activationResponse.venues ?? [],
        wallets: walletResponse.wallets ?? [],
        venueAccounts: venueAccounts.accounts ?? [],
        openOrders: openOrders.items,
        history: history.items,
        fundingHistory: fundingHistoryItems(fundingHistory),
        marketCatalog: marketCatalogResponse.markets ?? [],
      });
    } catch (loadError) {
      setError(userSafeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [ensureBackendWallets, performanceRange, token]);

  useEffect(() => {
    void loadPortfolio();
    const interval = window.setInterval(() => {
      void loadPortfolio();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadPortfolio]);

  useEffect(() => {
    const clampPage = (page: number, totalItems: number) =>
      Math.min(page, Math.max(1, Math.ceil(totalItems / PORTFOLIO_TABLE_PAGE_SIZE)));

    setPositionsPage((page) => clampPage(page, data.summary?.positions?.filter(isOpenExecutionPosition).length ?? 0));
    setOrdersPage((page) => clampPage(page, data.openOrders.length));
    setTradeHistoryPage((page) => clampPage(page, data.history.length));
    setFundingHistoryPage((page) => clampPage(page, data.fundingHistory.length));
  }, [data.fundingHistory.length, data.history.length, data.openOrders.length, data.summary?.positions]);

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
      const activationStatus = String(activation?.status ?? '').toUpperCase();
      const activationRequired = activation?.activationRequired === true ||
        activation?.required === true ||
        ['REQUIRED', 'ACTION_REQUIRED', 'PENDING', 'CONFIG_REQUIRED', 'ACCOUNT_REQUIRED'].includes(activationStatus);
      const blockers = activation?.blockers ?? [];
      const copyAddress = venueSpecificAddress(account);
      const readinessReason = String(activation?.readinessReason ?? '').toUpperCase();
      const bridgedUsdcBalance = parseMoney(activation?.bridgedUsdcBalance ?? null) ?? 0;
      const inactiveStatus = readinessReason === 'POLYMARKET_USDCE_ACTIVATION_REQUIRED' || bridgedUsdcBalance > 0
        ? 'USDC.e delivered, activation required'
        : readinessReason === 'POLYMARKET_CLOB_APPROVAL_REQUIRED'
          ? 'pUSD approval required'
          : activationRequired && activationStatus === 'READY'
        ? 'Activation ready'
        : activationRequired ? 'Activation required' : 'No venue-ready USDC';
      return {
        ...venue,
        balance,
        status: balance > 0 ? 'Ready to trade' : inactiveStatus,
        activation: blockers.length > 0 ? 'blocked' : activationRequired ? 'required' : 'ready',
        blockers,
        venueAddress: copyAddress.address,
        venueAddressKind: copyAddress.kind,
        venueAccountStatus: account?.status,
      };
    });
  }, [data.activations, data.balances, data.venueAccounts]);

  const positions = (data.summary?.positions ?? []).filter(isOpenExecutionPosition);
  const positionsTotalPages = Math.max(1, Math.ceil(positions.length / PORTFOLIO_TABLE_PAGE_SIZE));
  const positionsPageStart = (positionsPage - 1) * PORTFOLIO_TABLE_PAGE_SIZE;
  const pagedPositions = positions.slice(positionsPageStart, positionsPageStart + PORTFOLIO_TABLE_PAGE_SIZE);
  const ordersTotalPages = Math.max(1, Math.ceil(data.openOrders.length / PORTFOLIO_TABLE_PAGE_SIZE));
  const ordersPageStart = (ordersPage - 1) * PORTFOLIO_TABLE_PAGE_SIZE;
  const pagedOpenOrders = data.openOrders.slice(ordersPageStart, ordersPageStart + PORTFOLIO_TABLE_PAGE_SIZE);
  const tradeHistoryTotalPages = Math.max(1, Math.ceil(data.history.length / TRADE_HISTORY_PAGE_SIZE));
  const tradeHistoryPageStart = (tradeHistoryPage - 1) * TRADE_HISTORY_PAGE_SIZE;
  const pagedTradeHistory = data.history.slice(tradeHistoryPageStart, tradeHistoryPageStart + TRADE_HISTORY_PAGE_SIZE);
  const fundingHistoryTotalPages = Math.max(1, Math.ceil(data.fundingHistory.length / PORTFOLIO_TABLE_PAGE_SIZE));
  const fundingHistoryPageStart = (fundingHistoryPage - 1) * PORTFOLIO_TABLE_PAGE_SIZE;
  const pagedFundingHistory = data.fundingHistory.slice(fundingHistoryPageStart, fundingHistoryPageStart + PORTFOLIO_TABLE_PAGE_SIZE);
  const activePagination = activeTab === 'positions'
    ? {
      itemLabel: 'positions',
      page: positionsPage,
      pageSize: PORTFOLIO_TABLE_PAGE_SIZE,
      setPage: setPositionsPage,
      start: positionsPageStart,
      totalItems: positions.length,
      totalPages: positionsTotalPages,
    }
    : activeTab === 'orders'
      ? {
        itemLabel: 'orders',
        page: ordersPage,
        pageSize: PORTFOLIO_TABLE_PAGE_SIZE,
        setPage: setOrdersPage,
        start: ordersPageStart,
        totalItems: data.openOrders.length,
        totalPages: ordersTotalPages,
      }
      : activeTab === 'history'
        ? {
          itemLabel: 'trades',
          page: tradeHistoryPage,
          pageSize: TRADE_HISTORY_PAGE_SIZE,
          setPage: setTradeHistoryPage,
          start: tradeHistoryPageStart,
          totalItems: data.history.length,
          totalPages: tradeHistoryTotalPages,
        }
        : {
          itemLabel: 'funding records',
          page: fundingHistoryPage,
          pageSize: PORTFOLIO_TABLE_PAGE_SIZE,
          setPage: setFundingHistoryPage,
          start: fundingHistoryPageStart,
          totalItems: data.fundingHistory.length,
          totalPages: fundingHistoryTotalPages,
        };
  const resolvePositionMarket = useCallback((marketId: string) =>
    data.marketCatalog.find((market) => positionMarketMatchesCatalog(marketId, market)) ?? null,
  [data.marketCatalog]);
  const totalCash = venueRows.reduce((sum, venue) => sum + venue.balance, 0);
  const positionValue = parseMoney(data.summary?.totalMarkValue) ?? parseMoney(data.summary?.totalCostBasis) ?? 0;
  const totalValue = totalCash + positionValue;
  const unrealizedPnl = parseMoney(data.summary?.totalUnrealizedPnl);
  const totalRoi = data.summary && parseMoney(data.summary.totalCostBasis)
    ? ((unrealizedPnl ?? 0) / (parseMoney(data.summary.totalCostBasis) || 1)) * 100
    : null;
  const performanceSeries = useMemo(() => {
    if (data.timeseries?.historyAvailable && data.timeseries.points.length > 1) {
      return data.timeseries.points.map(pointFromSnapshot);
    }
    return tradeDrivenPerformanceSeries(performanceRange, data.history, data.summary, totalValue);
  }, [data.history, data.summary, data.timeseries, performanceRange, totalValue]);
  const latestPerformance = performanceSeries[performanceSeries.length - 1] ?? null;
  const hasPersistedPerformanceHistory = Boolean(data.timeseries?.historyAvailable && data.timeseries.points.length > 1);
  const hasTradePerformanceHistory = hasPersistedPerformanceHistory || hasFilledExecutionHistory(data.history);
  const firstPerformance = performanceSeries[0] ?? null;
  const performanceLineTone = ((latestPerformance?.totalValue ?? 0) - (firstPerformance?.totalValue ?? 0)) < 0 ? '#f87171' : '#22c55e';
  const performanceSubtitle = hasPersistedPerformanceHistory
    ? 'Portfolio value history'
    : hasTradePerformanceHistory
      ? 'Trade-driven portfolio movement'
      : 'Waiting for filled trades';
  const activationRequiredVenues = venueRows.filter((venue) => venue.activation !== 'ready');
  const fundingWallets = useMemo(() => {
    return data.wallets
      .filter((wallet) => wallet.status === 'ACTIVE' && wallet.purpose === 'DEFAULT_FUNDING')
      .sort((a, b) => a.chainFamily.localeCompare(b.chainFamily));
  }, [data.wallets]);
  const copyAddress = useCallback((copyKey: string, address: string) => {
    void navigator.clipboard?.writeText(address).then(() => {
      setCopiedAddressKey(copyKey);
      window.setTimeout(() => {
        setCopiedAddressKey((current) => current === copyKey ? null : current);
      }, 1_500);
    });
  }, []);

  const loadFundingReceipt = useCallback(async (row: FundingHistoryRow, shareAfterLoad = false) => {
    if (!token || !row.intentId) return;
    setReceiptLoadingId(row.id);
    try {
      const result = row.direction?.toUpperCase() === 'WITHDRAWAL'
        ? await getWithdrawalReceipt(token, row.intentId)
        : await getFundingReceipt(token, row.intentId);
      const nextReceipt = { direction: row.direction, generatedAt: result.generatedAt, receipt: result.receipt };
      setFundingReceipt(nextReceipt);
      if (shareAfterLoad) {
        const text = fundingReceiptText(nextReceipt.direction, nextReceipt.receipt);
        if (navigator.share) {
          await navigator.share({ title: 'Lotus funding receipt', text });
        } else {
          await navigator.clipboard?.writeText(text);
        }
      }
    } catch (receiptError) {
      setError(userSafeError(receiptError));
    } finally {
      setReceiptLoadingId(null);
    }
  }, [token]);

  const loadExecutionReceipt = useCallback(async (execution: ExecutionStatus) => {
    if (!token || !execution.executionId) return;
    setReceiptLoadingId(execution.executionId);
    try {
      const result = await getExecutionReceipt(token, execution.executionId);
      setExecutionReceipt({ generatedAt: result.generatedAt, receipt: result.receipt });
    } catch (receiptError) {
      setError(userSafeError(receiptError));
    } finally {
      setReceiptLoadingId(null);
    }
  }, [token]);

  const copyExecutionId = useCallback((executionId: string) => {
    void navigator.clipboard?.writeText(executionId).then(() => {
      setCopiedExecutionId(executionId);
      window.setTimeout(() => {
        setCopiedExecutionId((current) => current === executionId ? null : current);
      }, 1_500);
    });
  }, []);

  const shareOpenFundingReceipt = useCallback(async () => {
    if (!fundingReceipt) return;
    const text = fundingReceiptText(fundingReceipt.direction, fundingReceipt.receipt);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Lotus funding receipt', text });
      } else {
        await navigator.clipboard?.writeText(text);
      }
    } catch {
      // The browser share sheet can be dismissed by the user; no state change needed.
    }
  }, [fundingReceipt]);

  const pollPolymarketActivationReadiness = useCallback(async (submittedActivation: {
    relayerState?: string;
    relayerTransactionId?: string;
  }) => {
    if (!token) return false;

    const relayerState = submittedActivation.relayerState;
    const relayerReference = submittedActivation.relayerTransactionId;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const [balanceResponse, activationResponse] = await Promise.all([
          getVenueBalances(token, { force: true }),
          getVenueActivations(token, { force: true }),
        ]);
        const balances = balanceResponse.balances ?? balanceResponse.venues ?? [];
        const activations = activationResponse.activations ?? activationResponse.venues ?? [];
        const polymarketActivation = activations.find((item) => venueKey(item.venue) === 'POLYMARKET');

        setData((current) => ({
          ...current,
          balances,
          activations,
        }));

        setActivationMessage(polymarketActivationPollingMessage(polymarketActivation, relayerState, relayerReference));

        if (polymarketActivationConfirmed(polymarketActivation)) {
          await loadPortfolio();
          return true;
        }
      } catch (pollError) {
        setActivationMessage(
          `Polymarket activation was submitted, but Lotus could not refresh readiness right now. ${userSafeError(pollError)}`
        );
      }

      await sleep(4_000);
    }

    setActivationMessage(
      'Polymarket activation was submitted and Lotus is still waiting for CLOB balance/allowance readiness. Keep this page open or return later; portfolio refresh will continue checking.'
    );
    await loadPortfolio();
    return false;
  }, [loadPortfolio, token]);

  const activateVenue = useCallback(async (venue: VenueCashRow) => {
    if (!token) {
      setActivationMessage('Log in before activating venue wallets.');
      return;
    }
    setActivatingVenueId(venue.id);
    setError(null);
    setActivationMessage(null);
    try {
      const setup = await prepareVenueSetupBatch(token);
      const refreshedAccount = setup.accounts.find((account) => venueKey(account.venue) === venue.backend);
      if (venue.backend !== 'POLYMARKET') {
        const pendingSignature = setup.setupRequests.length > 0;
        setActivationMessage(
          pendingSignature
            ? `${venue.label} setup is prepared. A wallet signature is required before this venue becomes fully active.`
            : `${venue.label} setup was refreshed.`
        );
        await loadPortfolio();
        return;
      }

      if (refreshedAccount?.status !== 'ACTIVE') {
        setActivationMessage('Polymarket deposit wallet activation was requested. It will unlock after relayer deployment is confirmed by the backend.');
        await loadPortfolio();
        return;
      }

      const prepared = await preparePolymarketActivation(token);
      const activation = prepared.activation;
      if (!turnkeySession || turnkeyAuthState !== AuthState.Authenticated) {
        setActivationMessage('Reconnect your Turnkey wallet session to sign Polymarket activation.');
        await handleLogin();
      }

      let activeTurnkeyWallets = turnkeyWallets;
      if (activeTurnkeyWallets.length === 0) {
        try {
          activeTurnkeyWallets = await refreshWallets();
        } catch (walletError) {
          if (isTurnkeyMissingSessionError(walletError)) {
            setActivationMessage(turnkeySessionRequiredMessage);
            await loadPortfolio();
            return;
          }
          throw walletError;
        }
      }
      const signerAccount = findTurnkeyWalletAccount(activeTurnkeyWallets, activation.ownerAddress);
      if (!signerAccount) {
        setActivationMessage('Polymarket activation is ready, but your active Turnkey session does not contain the matching EVM signer. Refresh wallets after backend provisioning completes.');
        await loadPortfolio();
        return;
      }
      const signerOrganizationId = turnkeySession?.organizationId ?? session?.turnkeyOrganizationId;

      setActivationMessage(
        activation.instructions?.[0] ??
        'Polymarket fund activation is signing with your Turnkey EVM wallet.'
      );
      const signatureResult = await signMessage({
        message: activationTypedDataPayload(activation),
        walletAccount: signerAccount,
        encoding: 'PAYLOAD_ENCODING_EIP712',
        hashFunction: 'HASH_FUNCTION_NO_OP',
        addEthereumPrefix: false,
        ...(signerOrganizationId ? { organizationId: signerOrganizationId } : {}),
      });
      setActivationMessage('Submitting Polymarket activation to the backend...');
      const submitted = await submitPolymarketActivation(token, {
        ownerAddress: activation.ownerAddress,
        depositWalletAddress: activation.depositWalletAddress,
        nonce: activation.nonce,
        deadline: activation.deadline,
        calls: activation.calls,
        signature: signatureFromTurnkeyResult(signatureResult),
      });
      await pollPolymarketActivationReadiness(submitted.activation);
    } catch (activationError) {
      const message = isTurnkeyMissingSessionError(activationError)
        ? turnkeySessionRequiredMessage
        : activationError instanceof Error ? activationError.message : `${venue.label} activation failed.`;
      setActivationMessage(/cancel/i.test(message) ? 'Activation signature cancelled.' : message);
    } finally {
      setActivatingVenueId(null);
    }
  }, [handleLogin, loadPortfolio, pollPolymarketActivationReadiness, refreshWallets, session?.turnkeyOrganizationId, signMessage, token, turnkeyAuthState, turnkeySession, turnkeyWallets]);

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 font-sans antialiased space-y-6 animate-fade-in relative">
      {activationToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed z-[2147483646] w-[min(420px,calc(100vw-32px))] rounded-xl border border-[#ccff00]/35 bg-[#162006]/95 px-4 py-3 text-sm font-semibold leading-relaxed text-[#d7ff33] shadow-[0_18px_60px_rgba(0,0,0,0.42)] backdrop-blur-md ${portfolioToastPositionClass(notificationSettings.toastPosition)}`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#ccff00] shadow-[0_0_12px_rgba(204,255,0,0.85)]" />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#ccff00]">Funding readiness</div>
              <div>{activationToast}</div>
            </div>
            <button
              type="button"
              aria-label="Dismiss funding readiness notification"
              onClick={() => setActivationToast(null)}
              className="rounded-md px-1.5 py-0.5 text-xs font-black text-[#ccff00]/70 transition hover:bg-[#ccff00]/10 hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
            >
              x
            </button>
          </div>
        </div>
      )}
      
      {/* Top Grid */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[400px_1fr]">
        
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
            {activationMessage && (
              <div className="rounded-lg border border-[#ccff00]/25 bg-[#ccff00]/10 px-3 py-2 text-xs font-semibold leading-relaxed text-[#d7ff33]">
                {activationMessage}
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

            {fundingWallets.length > 0 && (
              <div className="rounded-xl border border-zinc-800/80 bg-[#0d0d0f] p-3.5">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Lotus Funding Wallets</div>
                <div className="grid grid-cols-1 gap-2">
                  {fundingWallets.map((wallet) => {
                    const copyKey = `wallet:${wallet.chainFamily}:${wallet.address}`;
                    const balances = fundingWalletBalances(wallet);
                    return (
                      <div
                        key={wallet.walletId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-[#151518] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <div className="text-sm font-semibold text-zinc-200">{wallet.chainFamily === 'SOLANA' ? 'Solana' : 'EVM'}</div>
                            {balances.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {balances.map((balance) => {
                                  const Logo = fundingBalanceUsesChainLogo(wallet, balance) ? ChainLogo : CryptoLogo;
                                  return (
                                    <span
                                      key={`${wallet.walletId}:${balance.chain ?? wallet.chainFamily}:${balance.token}`}
                                      className="inline-flex min-h-7 items-center gap-2 rounded-full border border-zinc-800 bg-[#1b1b25] px-2.5 py-1 leading-none text-zinc-100 shadow-sm"
                                      title={`${fundingBalanceTitle(balance)} balance`}
                                    >
                                      <Logo id={fundingBalanceLogoId(wallet, balance)} label={fundingBalanceTitle(balance)} className="h-5 w-5" />
                                      <span className="font-mono text-[13px] font-black text-white">{balance.amount}</span>
                                      <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-zinc-400">{balance.token}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span
                                className="rounded-full border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-zinc-500"
                                title={wallet.balanceBlocker ?? 'Backend funding wallet balance sync is not available yet.'}
                              >
                                Balance not synced
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{shortAddress(wallet.address)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyAddress(copyKey, wallet.address)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                          aria-label={`Copy ${wallet.chainFamily} funding address`}
                          title={`Copy ${wallet.chainFamily} address ${shortAddress(wallet.address)}`}
                        >
                          {copiedAddressKey === copyKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                          {venue.venueAddress && (
                            <button
                              type="button"
                              onClick={() => copyAddress(`venue:${venue.id}:${venue.venueAddress}`, venue.venueAddress as string)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                              aria-label={`Copy ${venue.label} venue address`}
                              title={`Copy ${venue.label} ${venue.venueAddressKind?.toLowerCase() ?? 'venue'} address ${shortAddress(venue.venueAddress)}`}
                            >
                              {copiedAddressKey === `venue:${venue.id}:${venue.venueAddress}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        <div className={`text-[10px] font-semibold ${venue.balance > 0 ? 'text-emerald-400' : venue.activation === 'blocked' ? 'text-amber-300' : 'text-zinc-500'}`}>
                          {venue.status}
                        </div>
                        {venue.venueAddress && (
                          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{shortAddress(venue.venueAddress)}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right font-mono text-sm font-bold text-white">
                      {formatCurrency(venue.balance)}
                      {venue.activation !== 'ready' && (
                        <button
                          type="button"
                          onClick={() => void activateVenue(venue)}
                          disabled={activatingVenueId === venue.id || !token}
                          className="mt-1.5 flex min-h-8 items-center justify-center rounded-md border border-[#ccff00]/25 bg-[#ccff00]/10 px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#ccff00] transition-colors hover:bg-[#ccff00]/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                        >
                          {activatingVenueId === venue.id ? 'Activating' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {activationRequiredVenues.length > 0 && (
                <button
                  type="button"
                  onClick={() => void activateVenue(activationRequiredVenues[0])}
                  disabled={Boolean(activatingVenueId) || !token}
                  className="mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#ccff00]/25 bg-[#ccff00]/10 px-3 text-xs font-bold text-[#ccff00] transition-colors hover:bg-[#ccff00]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {activatingVenueId ? 'Activating venue' : 'Activate pending venue'}
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

        <div className="flex min-w-0 flex-col gap-6">
        {/* Right Panel - Performance */}
        <div className="rounded-xl border border-zinc-800 bg-[#121214] p-5 flex flex-col relative overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-5 relative z-10">
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
          <div className="grid grid-cols-2 gap-4 mb-5 relative z-10 xl:grid-cols-4">
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
                 <div className="text-sm font-bold text-white">PnL Calendar</div>
                 <div className="text-[11px] text-zinc-500">{performanceSubtitle}</div>
               </div>
             </div>
             <button type="button" disabled className="w-6 h-6 rounded-md bg-zinc-800/80 flex items-center justify-center text-zinc-500 cursor-not-allowed">
               <ChevronRight className="w-4 h-4" />
             </button>
          </div>

          <div className="h-px bg-zinc-800/50 w-full mb-4 relative z-10" />

          {/* Chart Area */}
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceSeries} margin={{ top: 10, right: 8, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="portfolioPnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={performanceLineTone} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={performanceLineTone} stopOpacity={0} />
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
                  stroke={performanceLineTone}
                  strokeWidth={3}
                  fill="url(#portfolioPnlGradient)"
                  activeDot={{ r: 5, fill: performanceLineTone, stroke: '#18181b', strokeWidth: 2 }}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
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
            <button
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'funding' ? 'bg-lotus-500 text-black' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              onClick={() => setActiveTab('funding')}
            >
              Funding History
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
                <th className="px-6 py-4 font-semibold w-[40%]">{activeTab === 'positions' ? 'Market' : activeTab === 'funding' ? 'Intent' : 'Execution'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[10%]">{activeTab === 'positions' ? 'Avg' : 'Status'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[10%]">{activeTab === 'positions' ? 'Current' : activeTab === 'funding' ? 'Asset' : 'Settlement'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[12%]">{activeTab === 'positions' ? 'Size' : 'Route'}</th>
                <th className="px-6 py-4 font-semibold text-center w-[12%]">{activeTab === 'positions' ? 'Sellable' : 'Updated'}</th>
                <th className="px-6 py-4 font-semibold text-right w-[16%]">{activeTab === 'positions' ? 'Value' : 'Receipt'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-[15px]">
              {activeTab === 'positions' && pagedPositions.map((position) => {
                const market = resolvePositionMarket(position.marketId);
                const title = market?.displayTopic ?? market?.eventTitle ?? market?.title ?? fallbackPositionMarketTitle(position.marketId);
                const outcomeLabel = market?.displayOutcome ?? fallbackPositionOutcomeLabel(position.marketId, position.outcomeId);
                const value = parseMoney(position.markValue) ?? (parseMoney(position.verifiedSize) ?? 0) * position.averageEntryPrice;
                return (
                  <tr key={position.positionId} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <PositionMarketImage
                          title={title}
                          imageUrl={market?.imageUrl}
                          iconUrl={market?.iconUrl}
                          venue={position.venue}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-bold text-zinc-200 mb-1 leading-tight text-[15px]">{title}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] text-zinc-400 font-medium">{venueLabel(position.venue)}</span>
                            <span className="text-[13px] text-zinc-500">/</span>
                            <span className="text-[13px] font-semibold text-zinc-300">{outcomeLabel}</span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${position.outcomeId === 'NO' ? 'bg-red-500/10 text-red-400' : 'bg-[#22c55e]/10 text-[#22c55e]'}`}>{position.outcomeId}</span>
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
                        <div className="font-bold text-white text-[15px] font-mono">{formatCurrency(value)}</div>
                        <div className={`text-[12px] font-bold font-mono ${(parseMoney(position.unrealizedPnl) ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-red-400'}`}>
                          {position.markFreshness === 'live' ? formatMaybeSignedCurrency(position.unrealizedPnl) : position.markBlocker ?? 'Awaiting mark'}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {activeTab === 'orders' && pagedOpenOrders.map((execution) => (
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
              {activeTab === 'history' && pagedTradeHistory.map((execution) => {
                const market = execution.route?.marketId
                  ? resolvePositionMarket(execution.route.marketId)
                  : null;
                const title = market?.displayTopic ?? market?.eventTitle ?? market?.title ?? fallbackPositionMarketTitle(execution.route?.marketId ?? 'Backend execution');
                const outcomeLabel = market?.displayOutcome ?? fallbackPositionOutcomeLabel(execution.route?.marketId ?? '', execution.route?.outcomeId ?? '');
                const side = executionSide(execution);
                const shares = executionFilledShares(execution);
                const avgPrice = executionAveragePrice(execution);
                const filledValue = executionFilledValue(execution);
                return (
                  <tr key={execution.executionId} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <PositionMarketImage
                          title={title}
                          imageUrl={market?.imageUrl}
                          iconUrl={market?.iconUrl}
                          venue={execution.route?.venuePath?.[0] ?? execution.submittedLegs?.[0]?.venue ?? 'LOTUS'}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-bold text-zinc-200 mb-1 leading-tight text-[15px]">{title}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            {side && (
                              <span className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase ${side === 'sell' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                                {side}
                              </span>
                            )}
                            <span className="text-[13px] font-semibold text-zinc-300">{outcomeLabel}</span>
                            {execution.route?.outcomeId && <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-bold text-zinc-300">{execution.route.outcomeId}</span>}
                            <span className="truncate font-mono text-[11px] text-zinc-600">{shortAddress(execution.executionId)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`inline-flex min-h-7 items-center rounded-lg border px-2.5 text-[11px] font-black uppercase tracking-[0.06em] ${executionStatusTone(execution)}`}>
                        {executionStatusLabel(execution)}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">{executionSettlementLabel(execution)}</td>
                    <td className="px-6 py-5 text-center">
                      <div className="font-mono font-semibold text-zinc-200">{shares > 0 ? formatTokenAmount(shares) : '-'}</div>
                      <div className="mt-1 text-[11px] font-semibold text-zinc-500">{avgPrice !== null ? `${(avgPrice * 100).toFixed(1)}c avg` : 'Avg pending'}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">{executionRouteSummary(execution)}</div>
                    </td>
                    <td className="px-6 py-5 text-center font-mono text-[13px] font-medium text-zinc-300">
                      {formatPortfolioDate(execution.updatedAt ?? execution.submittedAt)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <div className="font-mono text-sm font-black text-white">{formatCurrency(filledValue)}</div>
                        <button
                          type="button"
                          disabled={receiptLoadingId === execution.executionId}
                          onClick={() => void loadExecutionReceipt(execution)}
                          className="min-h-8 rounded-lg border border-zinc-700 bg-[#18181b] px-3 text-xs font-semibold text-zinc-200 hover:border-lotus-500/60 hover:text-lotus-300 disabled:cursor-wait disabled:opacity-60"
                        >
                          {receiptLoadingId === execution.executionId ? 'Loading' : 'Receipt'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {activeTab === 'funding' && pagedFundingHistory.map((row) => {
                const txHash = row.txHashes?.[0];
                const status = row.status ?? row.aggregateStatus ?? 'Unknown';
                return (
                  <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-6 py-5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-200">{fundingDirectionLabel(row)}</span>
                          {row.venue && <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] font-bold text-zinc-400">{venueLabel(row.venue)}</span>}
                        </div>
                        <div className="mt-1 truncate font-mono text-[12px] text-zinc-500">{row.intentId}</div>
                        {txHash && <div className="mt-1 truncate font-mono text-[11px] text-zinc-600">Tx {shortAddress(txHash)}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`inline-flex min-h-7 items-center rounded-lg border px-2.5 text-[11px] font-black uppercase tracking-[0.06em] ${fundingStatusTone(status)}`}>
                        {status.replace(/_/g, ' ')}
                      </span>
                      {(row.readyToTrade || row.completed) && (
                        <div className="mt-1 text-[11px] font-semibold text-emerald-300">{row.readyToTrade ? 'Ready to trade' : 'Completed'}</div>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center font-mono font-medium text-zinc-300">
                      <div>{formatTokenAmount(row.amount) ?? row.amount ?? '-'}</div>
                      <div className="text-[11px] font-semibold text-zinc-500">{row.token ?? row.asset ?? '-'}</div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="text-[13px] font-semibold text-zinc-300">{fundingRouteSummary(row)}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">
                        {row.venueConfirmed ? 'Venue confirmed' : row.destinationReceived ? 'Destination received' : row.legStatus?.replace(/_/g, ' ') ?? 'Awaiting backend update'}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center font-mono text-[13px] font-medium text-zinc-300">
                      {formatPortfolioDate(row.updatedAt ?? row.checkedAt ?? row.createdAt)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={!row.intentId || receiptLoadingId === row.id}
                          onClick={() => void loadFundingReceipt(row)}
                          className="min-h-8 rounded-lg border border-zinc-700 bg-[#18181b] px-3 text-xs font-semibold text-zinc-200 hover:border-lotus-500/60 hover:text-lotus-300 disabled:cursor-wait disabled:opacity-60"
                        >
                          {receiptLoadingId === row.id ? 'Loading' : 'Receipt'}
                        </button>
                        <button
                          type="button"
                          disabled={!row.intentId || receiptLoadingId === row.id}
                          onClick={() => void loadFundingReceipt(row, true)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-[#18181b] text-zinc-300 hover:border-lotus-500/60 hover:text-lotus-300 disabled:cursor-wait disabled:opacity-60"
                          title="Share receipt"
                        >
                          <Share className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {activeTab === 'positions' && positions.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-zinc-500">No verified positions yet. Positions appear only after backend fill evidence is verified.</td></tr>
              )}
              {activeTab === 'orders' && data.openOrders.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-zinc-500">No open orders. Submitted and partial backend executions will appear here.</td></tr>
              )}
              {activeTab === 'history' && data.history.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-zinc-500">No trade history yet. Backend-confirmed executions will appear here.</td></tr>
              )}
              {activeTab === 'funding' && data.fundingHistory.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-zinc-500">No funding history yet. Deposits and withdrawals appear here after the backend creates an intent.</td></tr>
              )}
            </tbody>
          </table>
          {activePagination.totalItems > activePagination.pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-6 py-4">
              <div className="text-xs font-semibold text-zinc-500">
                Showing {activePagination.start + 1}-{Math.min(activePagination.start + activePagination.pageSize, activePagination.totalItems)} of {activePagination.totalItems} {activePagination.itemLabel}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activePagination.page <= 1}
                  onClick={() => activePagination.setPage((page) => Math.max(1, page - 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-[#18181b] text-zinc-300 transition-colors hover:border-lotus-500/60 hover:text-lotus-300 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Previous ${activePagination.itemLabel} page`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-16 text-center font-mono text-xs font-bold text-zinc-400">
                  {activePagination.page} / {activePagination.totalPages}
                </div>
                <button
                  type="button"
                  disabled={activePagination.page >= activePagination.totalPages}
                  onClick={() => activePagination.setPage((page) => Math.min(activePagination.totalPages, page + 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-[#18181b] text-zinc-300 transition-colors hover:border-lotus-500/60 hover:text-lotus-300 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Next ${activePagination.itemLabel} page`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
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
        </div>
      </div>

      {executionReceipt && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Execution receipt"
          className="fixed left-0 top-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-black/75 px-4 py-6 backdrop-blur-md"
        >
          <button
            type="button"
            aria-label="Close execution receipt"
            onClick={() => setExecutionReceipt(null)}
            className="absolute inset-0 cursor-default"
          />
          {(() => {
            const receipt = executionReceipt.receipt;
            const side = executionSide(receipt);
            const shares = executionFilledShares(receipt);
            const avgPrice = executionAveragePrice(receipt);
            const filledValue = executionFilledValue(receipt);
            const savings = parseMoney(receipt.route?.estimatedSavings) ?? 0;
            const market = receipt.route?.marketId ? resolvePositionMarket(receipt.route.marketId) : null;
            const title = market?.displayTopic ?? market?.eventTitle ?? market?.title ?? fallbackPositionMarketTitle(receipt.route?.marketId ?? 'Backend execution');
            const outcomeLabel = market?.displayOutcome ?? fallbackPositionOutcomeLabel(receipt.route?.marketId ?? '', receipt.route?.outcomeId ?? '');
            const legs = receipt.route?.legs ?? [];
            return (
              <div className="relative z-10 w-full max-w-[560px]">
                <div className="mb-7 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                    <Check className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight text-white">Execution Complete</h3>
                  <p className="mt-2 text-sm font-medium text-zinc-500">
                    {side ? `Your ${side} order was routed and backend-confirmed.` : 'Your order was routed and backend-confirmed.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-[#18181b] shadow-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
                    <span className="text-sm font-semibold text-zinc-500">Execution ID</span>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-sm font-bold text-white">{receipt.executionId}</span>
                      <button
                        type="button"
                        onClick={() => copyExecutionId(receipt.executionId)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:border-lotus-500/60 hover:text-lotus-300"
                        title="Copy execution ID"
                      >
                        {copiedExecutionId === receipt.executionId ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6 p-5">
                    <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
                      <div className="flex items-center gap-3">
                        <PositionMarketImage
                          title={title}
                          imageUrl={market?.imageUrl}
                          iconUrl={market?.iconUrl}
                          venue={receipt.route?.venuePath?.[0] ?? receipt.submittedLegs?.[0]?.venue ?? 'LOTUS'}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-white">{title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-400">
                            {side && <span className={side === 'sell' ? 'text-red-300' : 'text-emerald-300'}>{side.toUpperCase()}</span>}
                            <span>{outcomeLabel}</span>
                            {receipt.route?.outcomeId && <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">{receipt.route.outcomeId}</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-zinc-500">Total Filled</p>
                        <p className="font-mono text-xl font-black text-white">{formatCurrency(filledValue)} USDC</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold text-zinc-500">Avg Price</p>
                        <p className="font-mono text-xl font-black text-white">{avgPrice !== null ? `${(avgPrice * 100).toFixed(2)}c` : '-'}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold text-zinc-500">{side === 'sell' ? 'Shares Sold' : 'Shares Acquired'}</p>
                        <p className="font-mono text-xl font-black text-white">{shares > 0 ? `${formatTokenAmount(shares)} ${receipt.route?.outcomeId ?? ''}` : '-'}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold text-zinc-500">Value Saved vs Direct</p>
                        <p className={`font-mono text-xl font-black ${savings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatSignedCurrency(savings)}</p>
                      </div>
                    </div>

                    <div className="border-t border-zinc-800 pt-5">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-black text-white">Execution Breakdown</h4>
                        <span className={`rounded-lg border px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${executionStatusTone(receipt)}`}>
                          {executionStatusLabel(receipt)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {legs.length === 0 ? (
                          <div className="rounded-lg border border-zinc-800 bg-black/25 px-3 py-2 text-sm font-semibold text-zinc-500">
                            No route legs recorded.
                          </div>
                        ) : legs.map((leg, index) => (
                          <div key={`${leg.venue}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-black/25 px-3 py-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2 font-semibold text-zinc-400">
                              <VenueLogo id={venueLogoId(leg.venue)} label={venueLabel(leg.venue)} className="h-4 w-4 shrink-0" />
                              <span className="truncate">{venueLabel(leg.venue)}</span>
                            </span>
                            <span className="shrink-0 font-mono font-bold text-white">{(leg.price * 100).toFixed(1)}c avg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('history');
                      setExecutionReceipt(null);
                    }}
                    className="min-h-10 rounded-lg px-4 text-sm font-black text-lotus-300 hover:text-lotus-200"
                  >
                    View trade
                  </button>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(executionReceiptText(receipt))}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-700 bg-[#18181b] px-4 text-sm font-black text-zinc-200 hover:border-zinc-600"
                  >
                    <Copy className="h-4 w-4" />
                    Copy receipt
                  </button>
                </div>
              </div>
            );
          })()}
        </div>,
        document.body
      )}

      {fundingReceipt && isFundingDirection(fundingReceipt.direction) && createPortal(
        isFailedFundingReceipt(fundingReceipt.receipt as FundingReceipt) ? (
          <DepositFailedReceipt
            modal
            receipt={fundingReceipt.receipt as FundingReceipt}
            onClose={() => setFundingReceipt(null)}
            onRetry={() => {
              setFundingReceipt(null);
              setFundingModal('deposit');
            }}
            onReturn={() => {
              setFundingReceipt(null);
              setFundingModal('deposit');
            }}
          />
        ) : (
          <DepositSuccessReceipt
            modal
            receipt={fundingReceipt.receipt as FundingReceipt}
            onClose={() => setFundingReceipt(null)}
            onViewPortfolio={() => setFundingReceipt(null)}
            onStartTrading={() => {
              setFundingReceipt(null);
              window.location.hash = '#/terminal';
            }}
          />
        ),
        document.body
      )}

      {fundingReceipt && !isFundingDirection(fundingReceipt.direction) && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Funding receipt"
          className="fixed left-0 top-0 z-[2147483647] flex h-[100dvh] w-[100dvw] items-center justify-center overflow-hidden bg-black/70 px-4 py-6 backdrop-blur-md"
        >
          <button
            type="button"
            aria-label="Close funding receipt"
            onClick={() => setFundingReceipt(null)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative z-10 w-full max-w-[520px] rounded-2xl border border-zinc-800 bg-[#121214] p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-lotus-300">Funding Receipt</div>
                <h3 className="mt-1 text-xl font-black text-white">{fundingReceipt.direction.toUpperCase() === 'WITHDRAWAL' ? 'Withdrawal audit' : 'Deposit audit'}</h3>
                <p className="mt-1 max-w-[420px] text-sm font-medium text-zinc-500">{fundingReceipt.receipt.userSafeMessage || 'Backend receipt generated from durable funding records.'}</p>
              </div>
              <button
                type="button"
                onClick={() => setFundingReceipt(null)}
                className="min-h-9 rounded-lg border border-zinc-800 px-3 text-xs font-bold text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">Amount</div>
                <div className="mt-2 font-mono text-lg font-black text-white">{fundingReceiptAmount(fundingReceipt.direction, fundingReceipt.receipt)}</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">Status</div>
                <div className="mt-2 font-mono text-lg font-black text-lotus-300">{fundingReceipt.receipt.currentStatus.replace(/_/g, ' ')}</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">Intent</div>
                <div className="mt-2 truncate font-mono text-sm font-bold text-zinc-200">{fundingReceiptId(fundingReceipt.direction, fundingReceipt.receipt)}</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">Updated</div>
                <div className="mt-2 font-mono text-sm font-bold text-zinc-200">{formatPortfolioDate(fundingReceipt.receipt.updatedAt)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">Route legs</div>
                <span className="font-mono text-xs font-bold text-zinc-400">{fundingReceipt.receipt.routeLegs.length}</span>
              </div>
              <div className="space-y-2">
                {fundingReceipt.receipt.routeLegs.length === 0 ? (
                  <div className="text-sm font-semibold text-zinc-500">No route legs recorded yet.</div>
                ) : fundingReceipt.receipt.routeLegs.map((leg, index) => (
                  <div key={index} className="rounded-lg border border-zinc-800 bg-[#18181b] px-3 py-2 text-sm font-semibold text-zinc-300">
                    {receiptLegText(leg)}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void shareOpenFundingReceipt()}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-lotus-500/40 bg-lotus-500/10 px-4 text-sm font-black text-lotus-300 hover:bg-lotus-500/15"
              >
                <Share className="h-4 w-4" />
                Share receipt
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(fundingReceiptText(fundingReceipt.direction, fundingReceipt.receipt))}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-700 bg-[#18181b] px-4 text-sm font-black text-zinc-200 hover:border-zinc-600"
              >
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
            <FundingDeposit initialMode={fundingModal} modal onClose={() => setFundingModal(null)} session={session} />
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
