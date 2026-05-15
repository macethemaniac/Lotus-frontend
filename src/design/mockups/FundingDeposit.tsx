import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Check, Copy, Info, ChevronDown, Loader2, X } from 'lucide-react';
import { useTurnkey, type Wallet as TurnkeyWallet, type WalletAccount } from '@turnkey/react-wallet-kit';
import type { EthTransaction, SolanaTransaction } from '@turnkey/core';
import { ChainLogo, CryptoLogo, VenueLogo } from '@/components/icons/asset-logo';
import type { AuthSession } from '@/features/auth/types';
import { DepositSuccessReceipt } from './DepositSuccessReceipt';
import { DepositFailedReceipt } from './DepositFailedReceipt';
import {
    createWithdrawalIntent,
    createFundingIntent,
    getFundingIntentStatus,
    getFundingReceipt,
    getVenueBalances,
    getVenueCapabilities,
    mergeVenueBalanceSnapshots,
    quoteWithdrawalIntent,
    quoteFundingIntent,
    submitSignedSolanaFundingRouteLeg,
    submitFundingRouteLeg,
    type FundingReceipt,
type FundingIntentResponse,
    type FundingRouteLeg,
    type FundingTransactionRequest,
    type VenueBalance,
    type VenueCapability,
type WithdrawalIntentResponse
} from '@/features/funding/api/funding-api';
import {
    ensureDefaultWallets,
    listVenueAccounts,
    mergeUserWalletBalanceSnapshots,
    prepareVenueSetupBatch,
    type UserVenueAccount,
    type UserWallet
} from '@/features/wallets/api/wallet-api';
import { shortAddress } from '@/lib/formatting/format';

const formatTokenAmount = (value: number) => {
    if (!Number.isFinite(value)) return '0.00';
    return value.toLocaleString(undefined, {
        minimumFractionDigits: value >= 1 ? 2 : 0,
        maximumFractionDigits: value >= 1 ? 2 : 6,
    });
};

const walletAddressEquals = (left?: string | null, right?: string | null): boolean => {
    if (!left || !right) return false;
    if (left.startsWith('0x') && right.startsWith('0x')) {
        return left.toLowerCase() === right.toLowerCase();
    }
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

const normalizeFundingChain = (value: string): string => {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'MATIC' || normalized === '137') return 'POLYGON';
    if (normalized === '8453') return 'BASE';
    if (normalized === 'SOL') return 'SOLANA';
    if (normalized === 'BNB' || normalized === '56') return 'BSC';
    return normalized;
};

const venueDestinationSupports = (
    capability: VenueCapability | undefined,
    chain: string,
    token: string
): boolean => {
    if (!capability) return false;
    const destinations = capability.withdrawalDestinations;
    const normalizedChain = normalizeFundingChain(chain);
    const normalizedToken = token.trim().toUpperCase();
    if (Array.isArray(destinations) && destinations.length > 0) {
        return destinations.some((destination) =>
            destination.supported !== false &&
            normalizeFundingChain(destination.chain) === normalizedChain &&
            destination.token.trim().toUpperCase() === normalizedToken
        );
    }
    return Boolean(capability.supportsWithdrawal ?? capability.withdrawalSupported);
};

const evmCaip2ByChainId: Record<number, EthTransaction['caip2']> = {
    1: 'eip155:1',
    11155111: 'eip155:11155111',
    8453: 'eip155:8453',
    84532: 'eip155:84532',
    137: 'eip155:137',
    80002: 'eip155:80002',
};

const evmCaip2ByChainName: Record<string, EthTransaction['caip2']> = {
    ETHEREUM: 'eip155:1',
    ETH: 'eip155:1',
    BASE: 'eip155:8453',
    POLYGON: 'eip155:137',
    MATIC: 'eip155:137',
};

const solanaCaip2ByChainName: Record<string, SolanaTransaction['caip2']> = {
    SOLANA: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    SOL: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
};

const resolveEvmCaip2 = (request: FundingTransactionRequest, sourceChain: string): EthTransaction['caip2'] | null => {
    if (request.chainId && evmCaip2ByChainId[request.chainId]) return evmCaip2ByChainId[request.chainId];
    return evmCaip2ByChainName[sourceChain.trim().toUpperCase()] ?? null;
};

const resolveSolanaCaip2 = (sourceChain: string): SolanaTransaction['caip2'] | null =>
    solanaCaip2ByChainName[sourceChain.trim().toUpperCase()] ?? null;

const isSolanaFundingRequest = (request: FundingTransactionRequest, sourceChain: string): boolean =>
    Boolean(request.unsignedTransaction) || sourceChain.trim().toUpperCase() === 'SOLANA' || sourceChain.trim().toUpperCase() === 'SOL';

const base64ToHex = (base64Value: string): string | null => {
    try {
        const binary = window.atob(base64Value);
        let hex = '';
        for (let index = 0; index < binary.length; index += 1) {
            hex += binary.charCodeAt(index).toString(16).padStart(2, '0');
        }
        return hex;
    } catch {
        return null;
    }
};

const normalizeSolanaUnsignedTransactionHex = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const cleanHex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (/^[a-fA-F0-9]+$/.test(cleanHex) && cleanHex.length % 2 === 0) return cleanHex;
    return base64ToHex(trimmed);
};

const hexToBase64 = (hexValue: string): string | null => {
    const cleanHex = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
    if (!/^[a-fA-F0-9]+$/.test(cleanHex) || cleanHex.length % 2 !== 0) return null;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let index = 0; index < cleanHex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(cleanHex.slice(index, index + 2), 16);
    }
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return window.btoa(binary);
};

const normalizeSolanaUnsignedTransaction = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('0x')) return hexToBase64(trimmed);
    return trimmed;
};

const solanaUnsignedTransactionFromRequest = (request: FundingTransactionRequest, sourceChain: string): string | null => {
    if (request.unsignedTransaction) return normalizeSolanaUnsignedTransaction(request.unsignedTransaction);
    if (sourceChain.trim().toUpperCase() === 'SOLANA' || sourceChain.trim().toUpperCase() === 'SOL') {
        return request.data ? normalizeSolanaUnsignedTransaction(request.data) : null;
    }
    return null;
};

const solanaUnsignedTransactionHexFromRequest = (request: FundingTransactionRequest, sourceChain: string): string | null => {
    if (request.unsignedTransaction) return normalizeSolanaUnsignedTransactionHex(request.unsignedTransaction);
    if (sourceChain.trim().toUpperCase() === 'SOLANA' || sourceChain.trim().toUpperCase() === 'SOL') {
        return request.data ? normalizeSolanaUnsignedTransactionHex(request.data) : null;
    }
    return null;
};

const formatFundingActionError = (error: unknown): string => {
    const messages: string[] = [];
    let cursor: unknown = error;
    for (let depth = 0; depth < 4 && cursor; depth += 1) {
        if (cursor instanceof Error && cursor.message && !messages.includes(cursor.message)) {
            messages.push(cursor.message);
        } else if (typeof cursor === 'string' && cursor && !messages.includes(cursor)) {
            messages.push(cursor);
        }
        cursor = cursor instanceof Error && 'cause' in cursor ? cursor.cause : null;
    }
    const message = messages.length ? messages.join(' ') : 'Funding transaction signing failed.';
    if (/blockhash not found|expired blockhash|block height exceeded|route quote is stale/i.test(message)) {
        return 'The Solana funding transaction expired before broadcast. Lotus refreshed the route; press Sign txn again to review a fresh transaction.';
    }
    return message;
};

const extractTurnkeyTxHash = (status: unknown): string | null => {
    if (!status || typeof status !== 'object') return null;
    const record = status as Record<string, unknown>;
    const eth = record.eth && typeof record.eth === 'object' ? record.eth as Record<string, unknown> : null;
    const solana = record.solana && typeof record.solana === 'object' ? record.solana as Record<string, unknown> : null;
    const candidates = [
        record.txHash,
        record.transactionHash,
        record.signature,
        eth?.txHash,
        eth?.transactionHash,
        solana?.signature,
        solana?.txHash,
    ];
    const match = candidates.find((value): value is string => typeof value === 'string' && value.length > 0);
    return match ?? null;
};

const fundingLegNeedsSignature = (leg: FundingRouteLeg): boolean =>
    !leg.txHashes?.length &&
    !['LEG_SUBMITTED', 'LEG_BRIDGE_PENDING', 'LEG_DESTINATION_RECEIVED', 'LEG_VENUE_CREDIT_PENDING', 'LEG_READY_TO_TRADE'].includes(leg.status);

const fundingTerminalStatuses = new Set(['READY_TO_TRADE', 'FAILED', 'CANCELLED', 'PARTIALLY_FAILED']);
const fundingSubmittedStatuses = new Set([
    'ROUTES_SUBMITTED',
    'BRIDGING',
    'PARTIALLY_READY_TO_TRADE',
    'READY_TO_TRADE',
    'FAILED',
    'CANCELLED',
    'PARTIALLY_FAILED',
]);

const fundingRouteNeedsPolling = (status?: string | null): boolean =>
    Boolean(status && fundingSubmittedStatuses.has(status) && !fundingTerminalStatuses.has(status));

const fundingRouteSubmitted = (status?: string | null): boolean =>
    Boolean(status && fundingSubmittedStatuses.has(status));

const fundingReceiptBridgeSucceeded = (receipt: FundingReceipt | null): boolean => {
    if (!receipt) return false;
    if (receipt.currentStatus === 'READY_TO_TRADE' || receipt.currentStatus === 'PARTIALLY_READY_TO_TRADE') {
        return true;
    }
    const legs = receipt.routeLegs ?? [];
    if (legs.length === 0) return false;
    return legs.every((entry) => {
        const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
        const status = String(record.status ?? '').toUpperCase();
        const bridgeStatus = String(record.bridgeStatus ?? record.bridge_status ?? '').toUpperCase();
        const destinationStatus = String(record.destinationStatus ?? record.destination_status ?? '').toUpperCase();
        return status === 'LEG_VENUE_CREDIT_PENDING' ||
            status === 'LEG_READY_TO_TRADE' ||
            bridgeStatus === 'DONE' ||
            destinationStatus === 'CONFIRMED';
    });
};

const fundingReceiptFailed = (receipt: FundingReceipt | null): boolean => {
    if (!receipt) return false;
    const status = receipt.currentStatus.toUpperCase();
    if (status.includes('FAILED') || status.includes('ERROR') || status.includes('REJECTED') || status.includes('CANCELLED')) return true;
    return (receipt.routeLegs ?? []).some((entry) => {
        const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
        const legStatus = String(record.status ?? record.legStatus ?? record.providerStatus ?? '').toUpperCase();
        return legStatus.includes('FAILED') || legStatus.includes('ERROR') || legStatus.includes('REJECTED') || legStatus.includes('CANCELLED');
    });
};

const fundingLegHasSupportedWalletTransaction = (leg: FundingRouteLeg): boolean => {
    const request = leg.routeQuote?.transactionRequest;
    if (!request) return false;
    if (isSolanaFundingRequest(request, leg.sourceChain)) {
        return Boolean(solanaUnsignedTransactionHexFromRequest(request, leg.sourceChain) && resolveSolanaCaip2(leg.sourceChain));
    }
    return Boolean(request.to && resolveEvmCaip2(request, leg.sourceChain));
};

type FundingTransactionSubmitResult = {
    txHash: string;
    submittedIntent?: FundingIntentResponse;
};

export const FundingDeposit = ({
    initialMode = 'deposit',
    modal = false,
    onClose,
    session,
}: {
    initialMode?: 'deposit' | 'withdraw';
    modal?: boolean;
    onClose?: () => void;
    session?: AuthSession | null;
}) => {
    const turnkey = useTurnkey();
    const [mode, setMode] = useState<'deposit' | 'withdraw'>(initialMode);
    const [asset, setAsset] = useState('USDC');
    const [network, setNetwork] = useState('Solana');
    const [receiveAsset, setReceiveAsset] = useState('USDC');
    const [receiveNetwork, setReceiveNetwork] = useState('Solana');
    const [openMenu, setOpenMenu] = useState<'depositAsset' | 'depositNetwork' | 'receiveAsset' | 'receiveNetwork' | null>(null);
    const [amount, setAmount] = useState('');
    
    // Deposit state
    const [allocationMode, setAllocationMode] = useState<'auto' | 'single' | 'split'>('auto');
    const [selectedVenue, setSelectedVenue] = useState('polymarket');
    const [showInfo, setShowInfo] = useState(false);
    const [allocations, setAllocations] = useState<{ [key: string]: string }>({
        polymarket: '0', limitless: '0', predict: '0', myriad: '0', opinion: '0'
    });
    const [wallets, setWallets] = useState<UserWallet[]>([]);
    const [venueAccounts, setVenueAccounts] = useState<UserVenueAccount[]>([]);
    const [venueBalances, setVenueBalances] = useState<VenueBalance[]>([]);
    const [capabilities, setCapabilities] = useState<VenueCapability[]>([]);
    const [setupLoading, setSetupLoading] = useState(false);
    const [routeLoading, setRouteLoading] = useState(false);
    const [fundingActionLoading, setFundingActionLoading] = useState(false);
    const [fundingStatusLoading, setFundingStatusLoading] = useState(false);
    const [fundingError, setFundingError] = useState<string | null>(null);
    const [fundingMessage, setFundingMessage] = useState<string | null>(null);
    const [quotePreview, setQuotePreview] = useState<FundingIntentResponse | null>(null);
    const [fundingReceipt, setFundingReceipt] = useState<FundingReceipt | null>(null);
    const [successReceiptOpen, setSuccessReceiptOpen] = useState(false);
    const [successReceiptSeenIntent, setSuccessReceiptSeenIntent] = useState<string | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copiedAddress, setCopiedAddress] = useState(false);

    // Withdraw state
    const [withdrawMode, setWithdrawMode] = useState<'single' | 'multiple'>('single');
    const [withdrawVenue, setWithdrawVenue] = useState('polymarket');
    const [withdrawAllocations, setWithdrawAllocations] = useState<{ [key: string]: string }>({
        polymarket: '0', limitless: '0', predict: '0', myriad: '0', opinion: '0'
    });
    const [destinationAddress, setDestinationAddress] = useState('');
    const [withdrawalPreview, setWithdrawalPreview] = useState<WithdrawalIntentResponse | null>(null);
    const [withdrawalLoading, setWithdrawalLoading] = useState(false);
    const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
    const [withdrawalMessage, setWithdrawalMessage] = useState<string | null>(null);

    const assets = [
        { id: 'USDC', name: 'USDC' },
        { id: 'USDT', name: 'USDT' },
        { id: 'SOL', name: 'SOL' }
    ];
    const withdrawalAssets = [
        { id: 'USDC', name: 'USDC' },
        { id: 'USDT', name: 'USDT' },
        { id: 'pUSD', name: 'pUSD' },
        { id: 'USD1', name: 'USD1' }
    ];

    const sourceNetworks = [
        { id: 'Solana', name: 'Solana', min: '$3' },
        { id: 'Polygon', name: 'Polygon', min: '$3' },
        { id: 'BSC', name: 'BSC', min: '$3' },
        { id: 'Base', name: 'Base', min: '$3' },
        { id: 'Arbitrum', name: 'Arbitrum', min: '$3' },
        { id: 'Ethereum', name: 'Ethereum', min: '$10' },
        { id: 'Optimism', name: 'Optimism', min: '$3' }
    ];

    const receiveNetworks = [
        { id: 'Solana', name: 'Solana', min: '$3' },
        { id: 'Polygon', name: 'Polygon', min: '$3' },
        { id: 'BSC', name: 'BSC', min: '$3' },
        { id: 'Base', name: 'Base', min: '$3' },
        { id: 'Arbitrum', name: 'Arbitrum', min: '$3' },
        { id: 'Ethereum', name: 'Ethereum', min: '$10' },
        { id: 'Optimism', name: 'Optimism', min: '$3' }
    ];
    
    const venues = [
        { id: 'polymarket', name: 'Polymarket', rail: 'Polygon USDC' },
        { id: 'limitless', name: 'Limitless', rail: 'Base USDC' },
        { id: 'predict', name: 'Predict.fun', rail: 'BNB Chain USDT' },
        { id: 'myriad', name: 'Myriad', rail: 'Venue-ready balance' },
        { id: 'opinion', name: 'Opinion', rail: 'Blocked pending backend support' }
    ];
    const venueIdToBackend: Record<string, string> = {
        polymarket: 'POLYMARKET',
        limitless: 'LIMITLESS',
        predict: 'PREDICT_FUN',
        myriad: 'MYRIAD',
        opinion: 'OPINION',
    };

    const selectedAsset = assets.find(item => item.id === asset) ?? assets[0];
    const selectedNetwork = sourceNetworks.find(item => item.id === network) ?? sourceNetworks[0];
    const selectedReceiveAsset = withdrawalAssets.find(item => item.id === receiveAsset) ?? withdrawalAssets[0];
    const selectedReceiveNetwork = receiveNetworks.find(item => item.id === receiveNetwork) ?? receiveNetworks[0];
    const isMenuOpen = (menu: typeof openMenu) => openMenu === menu;
    const normalizedNetwork = network.toUpperCase();
    const sourceWallet = useMemo(() => {
        const chainFamily = normalizedNetwork === 'SOLANA' ? 'SOLANA' : 'EVM';
        return wallets.find(wallet =>
            wallet.status === 'ACTIVE' &&
            wallet.purpose === 'DEFAULT_FUNDING' &&
            wallet.chainFamily.toUpperCase() === chainFamily
        ) ?? null;
    }, [normalizedNetwork, wallets]);
    const sourceWalletAddress = sourceWallet?.address ?? null;
    const activeVenueAccounts = useMemo(() =>
        venueAccounts.filter(account => account.status === 'ACTIVE'),
        [venueAccounts]
    );
    const capabilityByVenue = useMemo(() =>
        new Map(capabilities.map(capability => [String(capability.venue ?? '').toUpperCase(), capability])),
        [capabilities]
    );
    const supportedFundingVenues = useMemo(() => {
        return venues.filter(venue => {
            const capability = capabilityByVenue.get(venueIdToBackend[venue.id]);
            return capability?.fundingSupported !== false && capability?.supported !== false && capability?.status !== 'DISABLED';
        });
    }, [capabilityByVenue, venues]);
    const displayedVenues = supportedFundingVenues.length > 0 ? supportedFundingVenues : venues;
    const withdrawalVenueRows = useMemo(() => {
        return venues.map((venue) => {
            const backendVenue = venueIdToBackend[venue.id];
            const capability = capabilityByVenue.get(backendVenue);
            const balance = venueBalances.find((candidate) =>
                String(candidate.venue).toUpperCase() === backendVenue &&
                String(candidate.token ?? candidate.asset ?? '').toUpperCase() === receiveAsset.toUpperCase()
            );
            const availableAmount = Number(balance?.availableAmount ?? balance?.readyAmount ?? 0);
            const supportsWithdrawal = capability?.supportsWithdrawal ?? capability?.withdrawalSupported ?? false;
            const blocked = venue.id === 'opinion' || !supportsWithdrawal;
            return {
                ...venue,
                backendVenue,
                availableAmount,
                balanceLabel: `${formatTokenAmount(availableAmount)} ${receiveAsset}`,
                rail: capability?.preferredChain && capability?.preferredToken
                    ? `${capability.preferredChain} ${capability.preferredToken}`
                    : venue.rail,
                blocked,
                blocker: venue.id === 'opinion'
                    ? 'Blocked'
                    : supportsWithdrawal
                        ? availableAmount > 0 ? null : 'No venue-ready balance'
                        : 'Withdrawals disabled',
            };
        });
    }, [capabilityByVenue, receiveAsset, venueBalances, venues]);
    const selectedWithdrawalVenue = withdrawalVenueRows.find((venue) => venue.id === withdrawVenue) ?? withdrawalVenueRows[0];
    const receiveNetworkRows = useMemo(() => {
        const activeSourceRows = withdrawMode === 'single'
            ? [selectedWithdrawalVenue]
            : withdrawalVenueRows.filter((venue) => Number(withdrawAllocations[venue.id] ?? 0) > 0);
        return receiveNetworks.map((networkOption) => {
            const supportedBy = activeSourceRows.filter((venue) =>
                venue && !venue.blocked && venueDestinationSupports(capabilityByVenue.get(venue.backendVenue), networkOption.id, receiveAsset)
            );
            const hasExplicitCapability = activeSourceRows.some((venue) =>
                Array.isArray(capabilityByVenue.get(venue.backendVenue)?.withdrawalDestinations)
            );
            const supported = activeSourceRows.length === 0
                ? networkOption.id === receiveNetwork
                : supportedBy.length > 0 && (hasExplicitCapability || supportedBy.length === activeSourceRows.length);
            return {
                ...networkOption,
                supported,
                supportLabel: supported
                    ? supportedBy.length > 0 ? `${supportedBy.length} venue${supportedBy.length === 1 ? '' : 's'}` : 'Selected'
                    : 'Unsupported'
            };
        });
    }, [capabilityByVenue, receiveAsset, receiveNetwork, receiveNetworks, selectedWithdrawalVenue, withdrawAllocations, withdrawMode, withdrawalVenueRows]);
    const selectedReceiveNetworkSupported = receiveNetworkRows.find((row) => row.id === receiveNetwork)?.supported ?? false;
    const quoteReady = Boolean(session?.userJwt && sourceWallet && amount && Number(amount) > 0);
    const numAmount = parseFloat(amount) || 0;
    const totalAllocated = Number(Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0));
    const difference = numAmount - totalAllocated;
    const totalWithdrawAllocated = Number(Object.values(withdrawAllocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0));
    const withdrawalBalanceTotal = withdrawalVenueRows.reduce((sum, venue) => sum + venue.availableAmount, 0);
    const withdrawalReceiveEstimate = withdrawalPreview
        ? withdrawalPreview.routeLegs.reduce((sum, leg) => sum + Number(leg.destinationAmountEstimate || 0), 0)
        : null;
    const withdrawalFees = withdrawalPreview ? Number(withdrawalPreview.totalEstimatedFees ?? 0) : null;
    const withdrawalReady = Boolean(
        session?.userJwt &&
        destinationAddress.trim() &&
        numAmount > 0 &&
        selectedReceiveNetworkSupported &&
        (withdrawMode === 'single'
            ? selectedWithdrawalVenue && !selectedWithdrawalVenue.blocked && selectedWithdrawalVenue.availableAmount >= numAmount
            : totalWithdrawAllocated === numAmount &&
                withdrawalVenueRows.some((venue) => Number(withdrawAllocations[venue.id] ?? 0) > 0) &&
                withdrawalVenueRows.every((venue) => {
                    const allocation = Number(withdrawAllocations[venue.id] ?? 0);
                    return allocation <= 0 || (!venue.blocked && allocation <= venue.availableAmount);
                }))
    );
    const pendingFundingLegs = quotePreview?.routeLegs.filter(fundingLegNeedsSignature) ?? [];
    const signableFundingLegs = pendingFundingLegs.filter(fundingLegHasSupportedWalletTransaction);
    const quotedRouteReady = Boolean(quotePreview && pendingFundingLegs.length > 0);
    const canSignFundingRoute = Boolean(quotedRouteReady && sourceWallet && signableFundingLegs.length === pendingFundingLegs.length);
    const activeFundingStatus = fundingReceipt?.currentStatus ?? quotePreview?.currentStatus ?? null;
    const submittedFundingRoute = fundingRouteSubmitted(activeFundingStatus);
    const fundingRoutePolling = fundingRouteNeedsPolling(activeFundingStatus);
    const receiptRouteLegs = useMemo(() => {
        return (fundingReceipt?.routeLegs ?? []).map((entry, index) => {
            const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
            const txHashes = Array.isArray(record.txHashes) ? record.txHashes : [];
            return {
                id: String(record.routeLegId ?? record.route_leg_id ?? index),
                venue: String(record.targetVenue ?? record.target_venue ?? record.venue ?? 'Venue'),
                status: String(record.status ?? 'PENDING'),
                bridgeStatus: String(record.bridgeStatus ?? record.bridge_status ?? ''),
                destinationStatus: String(record.destinationStatus ?? record.destination_status ?? ''),
                txHash: typeof txHashes[0] === 'string' ? txHashes[0] : null,
            };
        });
    }, [fundingReceipt?.routeLegs]);
    const withdrawalButtonLabel = setupLoading
        ? 'Checking venue balances'
        : withdrawalLoading
            ? 'Previewing withdrawal'
            : !destinationAddress.trim()
                ? 'Enter Recipient Address'
                : numAmount <= 0
                    ? 'Enter Amount'
                    : withdrawMode === 'single' && selectedWithdrawalVenue.blocked
                        ? 'Venue Withdrawal Disabled'
                    : withdrawMode === 'single' && selectedWithdrawalVenue.availableAmount < numAmount
                            ? 'Insufficient Venue Balance'
                            : !selectedReceiveNetworkSupported
                                ? 'Unsupported Destination'
                            : withdrawMode === 'multiple' && totalWithdrawAllocated !== numAmount
                                ? 'Match Source Amounts'
                                : withdrawalPreview
                                    ? 'Refresh Withdrawal Route'
                                    : 'Preview Withdrawal Route';

    useEffect(() => {
        let cancelled = false;
        if (!session?.userJwt) {
            setWallets([]);
            setVenueAccounts([]);
            setVenueBalances([]);
            setCapabilities([]);
            return;
        }
        setSetupLoading(true);
        setFundingError(null);
        Promise.all([
            ensureDefaultWallets(session.userJwt),
            prepareVenueSetupBatch(session.userJwt),
            listVenueAccounts(session.userJwt),
            getVenueBalances(session.userJwt),
            getVenueCapabilities(session.userJwt),
        ])
            .then(([walletResponse, _setupResponse, accountResponse, balanceResponse, capabilityResponse]) => {
                if (cancelled) return;
                setWallets((current) => mergeUserWalletBalanceSnapshots(current, walletResponse.wallets ?? []));
                setVenueAccounts(accountResponse.accounts ?? []);
                setVenueBalances((current) => mergeVenueBalanceSnapshots(current, balanceResponse.balances ?? balanceResponse.venues ?? []));
                const rawCapabilities = capabilityResponse.capabilities;
                setCapabilities(Array.isArray(rawCapabilities) ? rawCapabilities : Object.values(rawCapabilities ?? {}));
                setFundingMessage('Lotus account setup checked. Wallets and venue accounts are reused when present.');
            })
            .catch((error) => {
                if (cancelled) return;
                setFundingError(error instanceof Error ? error.message : 'Unable to load wallet setup.');
            })
            .finally(() => {
                if (!cancelled) setSetupLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [session?.userJwt]);

    useEffect(() => {
        if (mode !== 'withdraw' || selectedReceiveNetworkSupported) return;
        const fallback = receiveNetworkRows.find((row) => row.supported);
        if (fallback && fallback.id !== receiveNetwork) {
            setReceiveNetwork(fallback.id);
            setWithdrawalPreview(null);
            setWithdrawalMessage(null);
            setWithdrawalError(null);
        }
    }, [mode, receiveNetwork, receiveNetworkRows, selectedReceiveNetworkSupported]);

    useEffect(() => {
        let cancelled = false;
        setQrDataUrl(null);
        if (!sourceWalletAddress) return;
        QRCode.toDataURL(sourceWalletAddress, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: modal ? 148 : 216,
            color: { dark: '#000000', light: '#ffffff' },
        })
            .then((dataUrl) => {
                if (!cancelled) setQrDataUrl(dataUrl);
            })
            .catch(() => {
                if (!cancelled) setQrDataUrl(null);
            });
        return () => {
            cancelled = true;
        };
    }, [modal, sourceWalletAddress]);

    const copyAddress = async () => {
        if (!sourceWalletAddress) return;
        await navigator.clipboard.writeText(sourceWalletAddress);
        setCopiedAddress(true);
        window.setTimeout(() => setCopiedAddress(false), 1500);
    };

    const resetFundingRouteState = () => {
        setQuotePreview(null);
        setFundingReceipt(null);
        setSuccessReceiptOpen(false);
        setSuccessReceiptSeenIntent(null);
        setFundingError(null);
        setFundingMessage(null);
        setFundingStatusLoading(false);
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/[^0-9.]/g, '');
        if (val.split('.').length > 2) val = val.replace(/\.+$/, '');
        setAmount(val);
        resetFundingRouteState();
    };

    const handleAllocationChange = (id: string, val: string, isWithdraw = false) => {
        let cleanVal = val.replace(/[^0-9.]/g, '');
        if (cleanVal.split('.').length > 2) cleanVal = cleanVal.replace(/\.+$/, '');
        if (isWithdraw) {
            setWithdrawAllocations(prev => ({ ...prev, [id]: cleanVal }));
        } else {
            setAllocations(prev => ({ ...prev, [id]: cleanVal }));
            resetFundingRouteState();
        }
    };

    const compactPanel = modal ? 'p-4' : 'p-6';
    const compactSection = modal ? 'mb-3' : 'mb-6';
    const compactFieldPadding = modal ? 'p-2.5' : 'p-3';
    const compactInputPadding = modal ? 'p-2.5' : 'p-3';
    const compactQrWrap = modal ? 'w-32 h-32 mb-2 rounded-xl' : 'w-48 h-48 mb-3 rounded-2xl';
    const venueReadyTotal = venueBalances.reduce((sum, balance) => sum + Number(balance.readyAmount ?? balance.availableAmount ?? 0), 0);
    const primaryButtonLabel = setupLoading
        ? 'Checking Lotus wallets'
        : !sourceWallet
            ? 'Waiting for Lotus wallet'
            : fundingStatusLoading
                ? 'Checking funding status'
            : fundingActionLoading
                ? 'Submitting funding transaction'
            : routeLoading
                ? 'Previewing funding route'
                : submittedFundingRoute
                    ? fundingRoutePolling ? 'Refresh funding status' : 'View funding receipt'
                : quotePreview
                    ? signableFundingLegs.length > 1 ? 'Sign funding txns' : 'Sign txn'
                : 'Preview funding route';
    const fundingPrimaryDisabled = quotePreview
        ? submittedFundingRoute
            ? fundingActionLoading || routeLoading || setupLoading || fundingStatusLoading
            : !canSignFundingRoute || fundingActionLoading || routeLoading || setupLoading
        : !quoteReady || routeLoading || setupLoading;

    const buildFundingTargets = () => {
        if (allocationMode === 'single') {
            return [{ targetVenue: venueIdToBackend[selectedVenue], targetAmount: amount }];
        }
        if (allocationMode === 'split') {
            return displayedVenues
                .map((venue) => ({ targetVenue: venueIdToBackend[venue.id], targetAmount: allocations[venue.id] ?? '0' }))
                .filter((target) => Number(target.targetAmount) > 0);
        }
        const equalPercent = Number((100 / displayedVenues.length).toFixed(6));
        return displayedVenues.map((venue, index) => ({
            targetVenue: venueIdToBackend[venue.id],
            targetPercentage: index === displayedVenues.length - 1
                ? Number((100 - equalPercent * (displayedVenues.length - 1)).toFixed(6))
                : equalPercent,
        }));
    };

    const previewFundingRoute = async () => {
        if (!session?.userJwt || !sourceWallet || !quoteReady) return;
        const targets = buildFundingTargets();
        if (targets.length === 0) {
            setFundingError('Pick at least one venue allocation before previewing a route.');
            return;
        }
        setRouteLoading(true);
        setFundingError(null);
        setFundingMessage(null);
        setQuotePreview(null);
        setFundingReceipt(null);
        try {
            const intent = await createFundingIntent(session.userJwt, {
                sourceChain: normalizedNetwork,
                sourceToken: asset,
                sourceAmount: amount,
                sourceWalletId: sourceWallet.walletId,
                sourceWalletAddress: sourceWallet.address,
                idempotencyKey: `funding-${sourceWallet.walletId}-${Date.now()}`,
                targets,
            });
            const quoted = await quoteFundingIntent(session.userJwt, intent.fundingIntentId);
            setQuotePreview(quoted);
            setFundingMessage(quoted.userSafeMessage || 'Funding route is ready for wallet review. Sign the transaction to start the route.');
        } catch (error) {
            setFundingError(error instanceof Error ? error.message : 'Funding route preview failed.');
        } finally {
            setRouteLoading(false);
        }
    };

    const getLoadedTurnkeySourceAccount = async (): Promise<WalletAccount> => {
        if (!sourceWallet) {
            throw new Error('Lotus source wallet is not ready yet.');
        }
        let account = findTurnkeyWalletAccount(turnkey.wallets, sourceWallet.address);
        if (!account) {
            const refreshedWallets = await turnkey.refreshWallets();
            account = findTurnkeyWalletAccount(refreshedWallets, sourceWallet.address);
        }
        if (!account) {
            throw new Error('The matching Turnkey source wallet is not loaded. Refresh your wallet session and try again.');
        }
        return account;
    };

    const sendFundingTransaction = async (
        leg: FundingRouteLeg,
        request: FundingTransactionRequest,
        account: WalletAccount,
        fundingIntentId: string
    ): Promise<FundingTransactionSubmitResult> => {
        if (isSolanaFundingRequest(request, leg.sourceChain)) {
            const caip2 = resolveSolanaCaip2(leg.sourceChain);
            const unsignedTransaction = solanaUnsignedTransactionHexFromRequest(request, leg.sourceChain);
            if (!caip2 || !unsignedTransaction) {
                throw new Error('This Solana funding route is quoted, but the backend did not return a signable Solana transaction.');
            }
            const signedTransaction = await turnkey.signTransaction({
                organizationId: session?.turnkeyOrganizationId,
                walletAccount: account,
                unsignedTransaction,
                transactionType: 'TRANSACTION_TYPE_SOLANA',
            });
            const submittedIntent = await submitSignedSolanaFundingRouteLeg(session?.userJwt ?? '', fundingIntentId, {
                routeLegId: leg.routeLegId,
                signedTransaction,
            });
            const submittedLeg = submittedIntent.routeLegs.find((candidate) => candidate.routeLegId === leg.routeLegId);
            const txHash = submittedLeg?.txHashes?.at(-1);
            if (!txHash) throw new Error('Backend broadcasted the Solana transaction, but did not return a transaction signature.');
            return { txHash, submittedIntent };
        }

        const caip2 = resolveEvmCaip2(request, leg.sourceChain);
        if (!caip2) {
            throw new Error(`Turnkey browser signing is not enabled for ${leg.sourceChain}. Pick a supported EVM/Solana source chain or use a backend-supported route.`);
        }
        if (!request.to) {
            throw new Error('This funding route is quoted, but the backend did not return a transaction recipient.');
        }
        const transaction: EthTransaction = {
            from: request.from ?? sourceWallet?.address ?? account.address,
            to: request.to,
            caip2,
            ...(request.value ? { value: request.value } : { value: '0' }),
            ...(request.data ? { data: request.data } : {}),
            ...(request.gasLimit ? { gasLimit: request.gasLimit } : {}),
            ...(request.maxFeePerGas ? { maxFeePerGas: request.maxFeePerGas } : {}),
            ...(request.maxPriorityFeePerGas ? { maxPriorityFeePerGas: request.maxPriorityFeePerGas } : {}),
        };
        const sendTransactionStatusId = await turnkey.ethSendTransaction({
            organizationId: session?.turnkeyOrganizationId,
            transaction,
        });
        const status = await turnkey.pollTransactionStatus({
            organizationId: session?.turnkeyOrganizationId,
            sendTransactionStatusId,
            pollingIntervalMs: 1000,
        });
        const txHash = extractTurnkeyTxHash(status);
        if (!txHash) throw new Error('Turnkey submitted the transaction, but no transaction hash was returned.');
        return { txHash };
    };

    const refreshFundingRouteStatus = async (options: { silent?: boolean } = {}): Promise<FundingReceipt | null> => {
        if (!session?.userJwt || !quotePreview?.fundingIntentId) return null;
        if (!options.silent) {
            setFundingStatusLoading(true);
            setFundingError(null);
            setFundingMessage('Checking funding route status...');
        }
        try {
            const status = await getFundingIntentStatus(session.userJwt, quotePreview.fundingIntentId);
            setQuotePreview(status);
            const receipt = await getFundingReceipt(session.userJwt, status.fundingIntentId);
            setFundingReceipt(receipt.receipt);
            if (!options.silent) {
                setFundingMessage(receipt.receipt.userSafeMessage || status.userSafeMessage || 'Funding status updated.');
            }
            return receipt.receipt;
        } catch (error) {
            if (!options.silent) {
                setFundingError(error instanceof Error ? error.message : 'Funding status refresh failed.');
            }
            return null;
        } finally {
            if (!options.silent) setFundingStatusLoading(false);
        }
    };

    useEffect(() => {
        if (!session?.userJwt || !quotePreview?.fundingIntentId || !fundingRoutePolling) return;
        let cancelled = false;
        const refresh = async () => {
            try {
                const status = await getFundingIntentStatus(session.userJwt, quotePreview.fundingIntentId);
                if (cancelled) return;
                setQuotePreview(status);
                const receipt = await getFundingReceipt(session.userJwt, status.fundingIntentId);
                if (cancelled) return;
                setFundingReceipt(receipt.receipt);
                setFundingMessage(receipt.receipt.userSafeMessage || status.userSafeMessage || 'Funding route is in progress.');
            } catch {
                // Keep the last known receipt visible while provider/venue indexing catches up.
            }
        };
        const id = window.setInterval(refresh, 6000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [fundingRoutePolling, quotePreview?.fundingIntentId, session?.userJwt]);

    useEffect(() => {
        if (!fundingReceipt || !fundingReceiptBridgeSucceeded(fundingReceipt)) return;
        if (successReceiptSeenIntent === fundingReceipt.fundingIntentId) return;
        setSuccessReceiptSeenIntent(fundingReceipt.fundingIntentId);
        setSuccessReceiptOpen(true);
    }, [fundingReceipt, successReceiptSeenIntent]);

    const signFundingRoute = async () => {
        if (!session?.userJwt || !quotePreview) return;
        if (submittedFundingRoute) {
            const receipt = await refreshFundingRouteStatus();
            if (receipt) {
                setSuccessReceiptOpen(true);
            }
            return;
        }
        setFundingActionLoading(true);
        setFundingError(null);
        setFundingMessage('Refreshing funding route before wallet review...');
        let activeQuote = quotePreview;
        try {
            activeQuote = await quoteFundingIntent(session.userJwt, quotePreview.fundingIntentId);
            setQuotePreview(activeQuote);
        } catch (error) {
            setFundingError(error instanceof Error ? error.message : 'Funding route refresh failed.');
            setFundingActionLoading(false);
            return;
        }

        const legsToSign = activeQuote.routeLegs.filter(fundingLegNeedsSignature);
        if (legsToSign.length === 0) {
            setFundingMessage('This funding route has already been submitted. Refreshing the latest receipt.');
            const receipt = await getFundingReceipt(session.userJwt, activeQuote.fundingIntentId);
            setFundingReceipt(receipt.receipt);
            setFundingActionLoading(false);
            return;
        }
        const missingRequest = legsToSign.find((leg) => !leg.routeQuote?.transactionRequest);
        if (missingRequest) {
            setFundingError(`${missingRequest.targetVenue} is ready for wallet review, but the backend did not return a signable transaction for this leg.`);
            setFundingActionLoading(false);
            return;
        }

        setFundingMessage(legsToSign.length > 1 ? 'Opening wallet review for funding transactions...' : 'Opening wallet review for funding transaction...');
        try {
            const account = await getLoadedTurnkeySourceAccount();
            let latestIntent = activeQuote;
            for (const leg of legsToSign) {
                const request = leg.routeQuote?.transactionRequest;
                if (!request) continue;
                setFundingMessage(`Signing ${leg.targetVenue} funding leg...`);
                const result = await sendFundingTransaction(leg, request, account, activeQuote.fundingIntentId);
                latestIntent = result.submittedIntent ?? await submitFundingRouteLeg(session.userJwt, activeQuote.fundingIntentId, {
                    routeLegId: leg.routeLegId,
                    txHash: result.txHash,
                });
                setQuotePreview(latestIntent);
                setFundingMessage(`${leg.targetVenue} transaction submitted. Checking funding status...`);
            }
            const status = await getFundingIntentStatus(session.userJwt, latestIntent.fundingIntentId);
            setQuotePreview(status);
            const receipt = await getFundingReceipt(session.userJwt, latestIntent.fundingIntentId);
            setFundingReceipt(receipt.receipt);
            setFundingMessage(receipt.receipt.userSafeMessage || 'Funding transaction submitted. Receipt is ready.');
        } catch (error) {
            setFundingError(formatFundingActionError(error));
            if (error instanceof Error && /blockhash not found|expired blockhash|block height exceeded|route quote is stale/i.test(error.message)) {
                try {
                    const refreshed = await quoteFundingIntent(session.userJwt, activeQuote.fundingIntentId);
                    setQuotePreview(refreshed);
                } catch {
                    // Keep the original signing error visible; the next preview/sign action can refresh again.
                }
            }
        } finally {
            setFundingActionLoading(false);
        }
    };

    const buildWithdrawalSources = () => {
        if (withdrawMode === 'single') {
            return [{ sourceVenue: selectedWithdrawalVenue.backendVenue, sourceAmount: amount }];
        }
        return withdrawalVenueRows
            .map((venue) => ({ sourceVenue: venue.backendVenue, sourceAmount: withdrawAllocations[venue.id] ?? '0' }))
            .filter((source) => Number(source.sourceAmount) > 0);
    };

    const previewWithdrawalRoute = async () => {
        if (!session?.userJwt) {
            setWithdrawalError('Log in before previewing a withdrawal.');
            return;
        }
        if (!destinationAddress.trim()) {
            setWithdrawalError('Enter a recipient address before previewing a withdrawal.');
            return;
        }
        if (numAmount <= 0) {
            setWithdrawalError('Enter a withdrawal amount before previewing a route.');
            return;
        }
        const sources = buildWithdrawalSources();
        if (sources.length === 0) {
            setWithdrawalError('Pick at least one venue source with venue-ready balance.');
            return;
        }
        if (withdrawMode === 'multiple' && totalWithdrawAllocated !== numAmount) {
            setWithdrawalError('Multi-source withdrawal amounts must add up to the withdrawal amount.');
            return;
        }
        if (withdrawMode === 'single' && selectedWithdrawalVenue.availableAmount < numAmount) {
            setWithdrawalError(`${selectedWithdrawalVenue.name} does not have enough venue-ready ${receiveAsset}.`);
            return;
        }
        if (!selectedReceiveNetworkSupported) {
            setWithdrawalError(`${selectedWithdrawalVenue.name} does not support ${receiveNetwork} ${receiveAsset} withdrawals yet.`);
            return;
        }
        setWithdrawalLoading(true);
        setWithdrawalError(null);
        setWithdrawalMessage(null);
        setWithdrawalPreview(null);
        try {
            const intent = await createWithdrawalIntent(session.userJwt, {
                token: receiveAsset,
                amount,
                destinationChain: receiveNetwork.toUpperCase(),
                destinationWalletAddress: destinationAddress.trim(),
                idempotencyKey: `withdrawal-${session.userId}-${Date.now()}`,
                sources,
            });
            const quoted = await quoteWithdrawalIntent(session.userJwt, intent.withdrawalIntentId);
            setWithdrawalPreview(quoted);
            setWithdrawalMessage(quoted.userSafeMessage || 'Withdrawal route preview is ready. Complete the venue or wallet action shown by the backend before funds move.');
        } catch (error) {
            setWithdrawalError(error instanceof Error ? error.message : 'Withdrawal route preview failed.');
        } finally {
            setWithdrawalLoading(false);
        }
    };

    return (
        <div className={modal ? 'flex w-full min-w-0 flex-col items-center overflow-x-hidden' : 'min-h-[calc(100vh-4rem)] flex min-w-0 flex-col items-center overflow-x-hidden pt-8 pb-32'}>
            
            <div className={`bg-zinc-900/50 p-1 ${modal ? 'mb-3' : 'mb-6'} rounded-lg flex gap-1 border border-zinc-800`}>
                <button 
                    onClick={() => setMode('deposit')}
                    className={`${modal ? 'px-5 py-1.5 text-xs' : 'px-6 py-2 text-sm'} rounded-md font-semibold transition-all ${mode === 'deposit' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                >Deposit</button>
                <button 
                    onClick={() => setMode('withdraw')}
                    className={`${modal ? 'px-5 py-1.5 text-xs' : 'px-6 py-2 text-sm'} rounded-md font-semibold transition-all ${mode === 'withdraw' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                >Withdraw</button>
            </div>

            <div className={`w-full ${modal ? 'max-h-[calc(100dvh-7rem)] max-w-[460px] rounded-[20px]' : 'max-w-[460px] rounded-[24px]'} bg-[#1a1a1c] border border-zinc-800/80 shadow-2xl overflow-y-auto overflow-x-hidden custom-scrollbar relative`}>
                {mode === 'deposit' ? (
                    <div className={compactPanel}>
                        <div className={`flex justify-between items-center ${compactSection}`}>
                            <h2 className={`text-white font-bold ${modal ? 'text-base' : 'text-lg'}`}>Deposit and start trading in seconds</h2>
                            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5"/></button>
                        </div>
                        
                        <div className={`flex items-center gap-3 ${compactSection} group`}>
                            <div className="bg-zinc-800/50 p-1.5 rounded-full group-hover:bg-zinc-800 transition-colors">
                                <ArrowLeft className="w-4 h-4 text-zinc-400" />
                            </div>
                            <span className={`text-white font-bold ${modal ? 'text-sm' : 'text-[15px]'}`}>Fund venues from Lotus wallet</span>
                        </div>

                        <div className={`grid grid-cols-2 gap-3 ${compactSection}`}>
                            <div>
                                <label className={`text-zinc-200 text-sm font-bold ${modal ? 'mb-1.5' : 'mb-2'} block`}>Tokens</label>
                                <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setOpenMenu(isMenuOpen('depositAsset') ? null : 'depositAsset')}
                                    className={`relative w-full bg-[#202326] hover:bg-[#27272a] border border-zinc-800/80 rounded-xl ${compactFieldPadding} flex items-center justify-between cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40`}
                                >
                                    <div className="flex items-center gap-2">
                                        <CryptoLogo id={asset} label={asset} className="h-5 w-5" />
                                        <span className="text-zinc-200 text-sm font-bold">{selectedAsset.name}</span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isMenuOpen('depositAsset') ? 'rotate-180' : ''}`} />
                                </button>
                                {isMenuOpen('depositAsset') && (
                                    <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-xl border border-zinc-700/80 bg-[#16191c] p-1.5 shadow-2xl shadow-black/50">
                                        {assets.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => { setAsset(item.id); setOpenMenu(null); resetFundingRouteState(); }}
                                                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-bold text-zinc-200 hover:bg-zinc-800/80 focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <CryptoLogo id={item.id} label={item.name} className="h-5 w-5" />
                                                    {item.name}
                                                </span>
                                                {asset === item.id && <span className="text-white">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                </div>
                            </div>
                            <div>
                                <div className={`flex items-center justify-between ${modal ? 'mb-1.5' : 'mb-2'}`}>
                                    <label className="text-zinc-200 text-sm font-bold">Chains</label>
                                    <span className="text-xs text-zinc-500">Min {selectedNetwork.min}</span>
                                </div>
                                <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setOpenMenu(isMenuOpen('depositNetwork') ? null : 'depositNetwork')}
                                    className={`relative w-full bg-[#202326] hover:bg-[#27272a] border border-zinc-800/80 rounded-xl ${compactFieldPadding} flex items-center justify-between cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40`}
                                >
                                    <div className="flex items-center gap-2">
                                        <ChainLogo id={network} label={network} className="h-5 w-5" />
                                        <span className="text-zinc-200 text-sm font-bold">{selectedNetwork.name}</span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isMenuOpen('depositNetwork') ? 'rotate-180' : ''}`} />
                                </button>
                                {isMenuOpen('depositNetwork') && (
                                    <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-full min-w-[210px] overflow-hidden rounded-xl border border-zinc-700/80 bg-[#16191c] p-1.5 shadow-2xl shadow-black/50">
                                        {sourceNetworks.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => { setNetwork(item.id); setOpenMenu(null); resetFundingRouteState(); }}
                                                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-bold text-zinc-200 hover:bg-zinc-800/80 focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <ChainLogo id={item.id} label={item.name} className="h-5 w-5" />
                                                    {item.name}
                                                </span>
                                                <span className="flex items-center gap-3 text-zinc-500">
                                                    Min {item.min}
                                                    {network === item.id && <span className="text-white">✓</span>}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                </div>
                            </div>
                        </div>
                        <div className={`${modal ? 'mb-3' : 'mb-5'} rounded-xl border border-[#00ff88]/10 bg-[#00ff88]/5 px-3 py-2 text-[11px] leading-relaxed text-zinc-400`}>
                            Funding uses LiFi from your selected source chain into venue-ready capital. Keep native gas on the source chain; Lotus only treats funds as tradeable after backend readiness says ready.
                        </div>
                        {(fundingError || fundingMessage || setupLoading) && (
                            <div className={`${modal ? 'mb-3' : 'mb-5'} rounded-xl border ${fundingError ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-zinc-800 bg-zinc-950/40 text-zinc-400'} px-3 py-2 text-[11px] font-semibold leading-relaxed`}>
                                {setupLoading ? 'Checking Turnkey wallets and venue account bindings...' : fundingError ?? fundingMessage}
                            </div>
                        )}

                        {/* Lotus Addition: Anticipated Amount & Allocation */}
                        <div className={`${compactSection} ${modal ? 'p-3' : 'p-4'} bg-zinc-900/30 rounded-xl border border-zinc-800/50`}>
                            <label className={`text-zinc-400 text-xs font-bold ${modal ? 'mb-2' : 'mb-3'} flex justify-between items-center`}>
                                <span>Venue pre-allocation</span>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => { setAllocationMode('auto'); resetFundingRouteState(); }} className={`px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${allocationMode === 'auto' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'text-zinc-500'}`}>Auto</button>
                                    <button type="button" onClick={() => { setAllocationMode('single'); resetFundingRouteState(); }} className={`px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${allocationMode === 'single' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500'}`}>Single venue</button>
                                    <button type="button" onClick={() => { setAllocationMode('split'); resetFundingRouteState(); }} className={`px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${allocationMode === 'split' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500'}`}>Split</button>
                                </div>
                            </label>
                            
                            <div className={`flex bg-zinc-950/50 border border-zinc-800 rounded-lg overflow-hidden ${modal ? 'mb-2' : 'mb-3'}`}>
                                <input type="text" value={amount} onChange={handleAmountChange} placeholder="Enter Amount" className={`w-full bg-transparent ${compactInputPadding} text-sm font-mono text-white outline-none`} />
                            </div>

                            {allocationMode === 'auto' ? (
                                <div className="text-[11px] text-zinc-500 leading-relaxed">
                                    Auto prepares an even backend-validated target set across supported venues for this staging pass. Backend capability and route quotes still decide whether each leg is executable.
                                </div>
                            ) : allocationMode === 'single' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {displayedVenues.map(v => {
                                        const account = venueAccounts.find(item => item.venue === venueIdToBackend[v.id]);
                                        return (
                                            <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => { setSelectedVenue(v.id); resetFundingRouteState(); }}
                                                className={`p-2 rounded-lg border text-xs text-left transition-colors focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${selectedVenue === v.id ? 'bg-[#00ff88]/10 border-[#00ff88]/50 text-white' : 'border-zinc-800/80 text-zinc-400 hover:bg-[#27272a]/50'}`}
                                            >
                                                <span className="mb-1 flex items-center gap-2 font-bold">
                                                    <VenueLogo id={v.id} label={v.name} className="h-4 w-4" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate">{v.name}</span>
                                                        <span className="block truncate text-[10px] font-medium text-zinc-500">{account?.status ?? 'setup checked'}</span>
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {displayedVenues.map(v => (
                                        <div key={v.id} className="flex justify-between items-center text-xs">
                                            <span className="flex min-w-0 items-center gap-2 text-zinc-400">
                                                <VenueLogo id={v.id} label={v.name} className="h-4 w-4" />
                                                <span className="min-w-0">
                                                    <span className="block truncate">{v.name}</span>
                                                    <span className="block truncate text-[10px] text-zinc-600">{v.rail}</span>
                                                </span>
                                            </span>
                                            <input 
                                                type="text" 
                                                value={allocations[v.id]} 
                                                onChange={(e) => handleAllocationChange(v.id, e.target.value)}
                                                className="w-16 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-right text-white font-mono focus:border-zinc-500 outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                    ))}
                                    <div className="flex justify-between text-[11px] font-bold pt-1 border-t border-zinc-800/50">
                                        <span className="text-zinc-500">Unallocated:</span>
                                        <span className={difference < 0 ? 'text-red-400' : 'text-zinc-300'}>${Math.max(0, difference).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Minimal QR Area */}
                        <div className={`flex flex-col items-center ${compactSection}`}>
                            <div className={`p-1 bg-gradient-to-br from-blue-400 via-white to-orange-400 ${compactQrWrap} shadow-[0_0_20px_rgba(255,255,255,0.1)]`}>
                                <div className="w-full h-full bg-white rounded-xl flex items-center justify-center">
                                    {qrDataUrl ? (
                                        <img src={qrDataUrl} alt={`${network} Lotus wallet QR`} className="h-full w-full rounded-xl object-contain" />
                                    ) : (
                                        <div className="px-3 text-center text-[11px] font-bold text-zinc-900">
                                            {setupLoading ? 'Preparing wallet' : 'No wallet address'}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-zinc-400 text-xs flex items-center gap-1.5 font-medium">
                                Add funds to your <span className="text-white font-bold">{network}</span> Lotus wallet <Info className="w-3.5 h-3.5" />
                            </div>
                        </div>

                        {/* Address Field */}
                        <div className={compactSection}>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-zinc-400 text-xs font-semibold flex items-center gap-1">Address <Info className="w-3.5 h-3.5" /></span>
                                <span 
                                    onClick={() => setShowInfo(!showInfo)} 
                                    className="text-zinc-400 text-xs font-semibold flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors"
                                >
                                    Info <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showInfo ? 'rotate-180' : ''}`} />
                                </span>
                            </div>
                            <div className={`flex items-center justify-between gap-3 bg-[#27272a]/30 border border-zinc-800 rounded-xl ${modal ? 'p-2.5' : 'p-3.5'} hover:border-zinc-700 transition-colors`}>
                                <span className="min-w-0 truncate text-zinc-300 font-mono text-sm tracking-wide">
                                    {sourceWalletAddress ? shortAddress(sourceWalletAddress) : 'Wallet setup pending'}
                                </span>
                                <button type="button" onClick={copyAddress} disabled={!sourceWalletAddress} className="text-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 rounded-md p-1">
                                    {copiedAddress ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Info Footer */}
                        {showInfo && (
                            <div className="bg-[#1e1e20] border border-zinc-800 rounded-xl p-4 space-y-2 mb-4 animate-in slide-in-from-top-2 fade-in duration-200">
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-zinc-400">Processing time:</span>
                                    <span className="text-white font-bold">Backend quote required</span>
                                </div>
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-zinc-400">Venue-ready balance:</span>
                                    <span className="text-white font-bold">${venueReadyTotal.toFixed(2)}</span>
                                </div>
                                <div className="text-[12px] leading-relaxed text-zinc-500">
                                    Funding routes require a user signature from the selected Lotus wallet. Lotus does not treat funds as tradeable until backend venue readiness confirms them.
                                </div>
                            </div>
                        )}

                        {quotePreview && (
                            <div className={`${compactSection} rounded-xl border border-[#00ff88]/20 bg-[#00ff88]/5 p-3`}>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#00ff88]">Route preview</span>
                                    <span className="text-[10px] font-bold text-zinc-500">{quotePreview.currentStatus}</span>
                                </div>
                                <div className="space-y-2">
                                    {quotePreview.routeLegs.map((leg) => (
                                        <div key={leg.routeLegId} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-bold text-white">{leg.targetVenue}</span>
                                                <span className="font-mono text-zinc-300">{leg.destinationAmountEstimate} {leg.destinationToken}</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-zinc-500">{leg.routeQuote?.userSafeSummary ?? leg.routeProvider}</div>
                                            {leg.txHashes?.[0] && (
                                                <div className="mt-1 truncate text-[10px] font-mono text-[#00ff88]">
                                                    Tx {shortAddress(leg.txHashes[0])}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {pendingFundingLegs.length > 0 && signableFundingLegs.length !== pendingFundingLegs.length && (
                                    <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-200">
                                        Route quote is available, but one or more legs do not include a Turnkey-supported wallet transaction yet. Refresh the route or pick another source chain.
                                    </div>
                                )}
                            </div>
                        )}

                        {fundingReceipt && (
                            <div className={`${compactSection} rounded-xl border border-zinc-800 bg-zinc-950/60 p-3`}>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Funding receipt</span>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-[#c6ff00]">
                                        {fundingRoutePolling && <Loader2 className="h-3 w-3 animate-spin" />}
                                        {fundingReceipt.currentStatus}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div className="rounded-lg border border-zinc-800 bg-black/20 px-2 py-1.5">
                                        <div className="text-zinc-500">Amount</div>
                                        <div className="font-mono font-bold text-white">{fundingReceipt.sourceAmount} {fundingReceipt.sourceToken}</div>
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 bg-black/20 px-2 py-1.5">
                                        <div className="text-zinc-500">Route legs</div>
                                        <div className="font-mono font-bold text-white">{fundingReceipt.routeLegs.length}</div>
                                    </div>
                                </div>
                                <div className="mt-2 text-[11px] leading-relaxed text-zinc-500">{fundingReceipt.userSafeMessage}</div>
                                {receiptRouteLegs.length > 0 && (
                                    <div className="mt-3 space-y-1.5">
                                        {receiptRouteLegs.map((leg) => (
                                            <div key={leg.id} className="rounded-lg border border-zinc-800 bg-black/20 px-2 py-1.5">
                                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                                    <span className="font-bold uppercase text-zinc-200">{leg.venue}</span>
                                                    <span className="font-mono text-[#c6ff00]">{leg.status}</span>
                                                </div>
                                                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                                                    <span>{leg.bridgeStatus || leg.destinationStatus || 'Awaiting route update'}</span>
                                                    {leg.txHash && <span className="font-mono text-[#00ff88]">Tx {shortAddress(leg.txHash)}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={quotePreview ? signFundingRoute : previewFundingRoute}
                            disabled={fundingPrimaryDisabled}
                            className={`mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c6ff00] px-4 ${modal ? 'py-2.5' : 'py-3.5'} text-sm font-bold text-black transition-colors hover:bg-[#b8f000] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40`}
                        >
                            {(routeLoading || setupLoading || fundingActionLoading || fundingStatusLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
                            {primaryButtonLabel}
                        </button>

                        <div className="flex justify-end gap-3 text-xs font-semibold">
                            <span className="text-[#b181ff] cursor-pointer hover:underline">FAQ</span>
                            <span className="text-[#b181ff] cursor-pointer hover:underline">Terms</span>
                        </div>
                    </div>
                ) : (
                    <div className={compactPanel}>
                        <div className={`flex justify-between items-center ${compactSection}`}>
                            <h2 className={`text-white font-bold ${modal ? 'text-base' : 'text-lg'}`}>Withdraw</h2>
                            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5"/></button>
                        </div>
                        
                        {/* Address */}
                        <div className={compactSection}>
                            <label className={`text-zinc-400 text-xs font-semibold ${modal ? 'mb-1.5' : 'mb-2'} block`}>Recipient address</label>
                            <input 
                                type="text"
                                value={destinationAddress}
                                onChange={(e) => setDestinationAddress(e.target.value)}
                                placeholder={receiveNetwork === 'Solana' ? 'Solana wallet address...' : '0x wallet address...'}
                                className={`w-full bg-[#27272a]/50 border border-zinc-800/80 hover:bg-[#27272a] rounded-xl px-4 ${modal ? 'py-2.5' : 'py-3.5'} text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-600 transition-colors`}
                            />
                            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                                Withdrawals return funds to your selected wallet. Use a wallet on the receive chain and keep native gas there for any follow-up move.
                            </p>
                        </div>

                        {/* Amount */}
                        <div className={modal ? 'mb-3' : 'mb-5'}>
                            <label className={`text-zinc-400 text-xs font-semibold ${modal ? 'mb-1.5' : 'mb-2'} block`}>Amount</label>
                            <div className={`w-full bg-[#27272a]/50 border border-zinc-800/80 hover:bg-[#27272a] rounded-xl px-4 ${modal ? 'py-2.5' : 'py-3.5'} flex items-center gap-3 focus-within:border-zinc-600 focus-within:bg-[#27272a] transition-colors`}>
                                <input 
                                    type="text"
                                    value={amount}
                                    onChange={handleAmountChange}
                                    placeholder="0.00"
                                    className="bg-transparent flex-1 text-sm text-white placeholder:text-zinc-600 outline-none"
                                />
                                <span className="text-zinc-500 text-sm font-semibold">{receiveAsset}</span>
                                <button
                                    type="button"
                                    onClick={() => setAmount(String(withdrawMode === 'single' ? selectedWithdrawalVenue.availableAmount : withdrawalBalanceTotal))}
                                    className="bg-zinc-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-zinc-700"
                                >
                                    Max
                                </button>
                            </div>
                            <div className="flex justify-between mt-2 px-1">
                                <span className="text-zinc-500 text-xs">{formatTokenAmount(numAmount)} {receiveAsset}</span>
                                <span className="text-zinc-500 text-xs">Ready: {formatTokenAmount(withdrawalBalanceTotal)} {receiveAsset}</span>
                            </div>
                        </div>

                        {/* Receive */}
                        <div className={`grid grid-cols-2 gap-3 ${compactSection}`}>
                            <div>
                                <label className={`text-zinc-200 text-sm font-bold ${modal ? 'mb-1.5' : 'mb-2'} block`}>Receive token</label>
                                <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setOpenMenu(isMenuOpen('receiveAsset') ? null : 'receiveAsset')}
                                    className={`relative w-full bg-[#202326] hover:bg-[#27272a] border border-zinc-800/80 rounded-xl ${compactFieldPadding} flex items-center justify-between cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40`}
                                >
                                    <div className="flex items-center gap-2">
                                        <CryptoLogo id={receiveAsset} label={receiveAsset} className="h-5 w-5" />
                                        <span className="text-zinc-200 text-sm font-bold">{selectedReceiveAsset.name}</span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isMenuOpen('receiveAsset') ? 'rotate-180' : ''}`} />
                                </button>
                                {isMenuOpen('receiveAsset') && (
                                    <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-xl border border-zinc-700/80 bg-[#16191c] p-1.5 shadow-2xl shadow-black/50">
                                        {withdrawalAssets.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => { setReceiveAsset(item.id); setOpenMenu(null); }}
                                                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-bold text-zinc-200 hover:bg-zinc-800/80 focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <CryptoLogo id={item.id} label={item.name} className="h-5 w-5" />
                                                    {item.name}
                                                </span>
                                                {receiveAsset === item.id && <span className="text-white">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                </div>
                            </div>
                            <div>
                                <div className={`flex items-center justify-between ${modal ? 'mb-1.5' : 'mb-2'}`}>
                                    <label className="text-zinc-200 text-sm font-bold">Receive chain</label>
                                    <span className="text-xs text-zinc-500">Min {selectedReceiveNetwork.min}</span>
                                </div>
                                <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setOpenMenu(isMenuOpen('receiveNetwork') ? null : 'receiveNetwork')}
                                    className={`relative w-full bg-[#202326] hover:bg-[#27272a] border border-zinc-800/80 rounded-xl ${compactFieldPadding} flex items-center justify-between cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40`}
                                >
                                    <div className="flex items-center gap-2">
                                        <ChainLogo id={receiveNetwork} label={receiveNetwork} className="h-5 w-5" />
                                        <span className="text-zinc-200 text-sm font-bold">{selectedReceiveNetwork.name}</span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isMenuOpen('receiveNetwork') ? 'rotate-180' : ''}`} />
                                </button>
                                {isMenuOpen('receiveNetwork') && (
                                    <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-full min-w-[210px] overflow-hidden rounded-xl border border-zinc-700/80 bg-[#16191c] p-1.5 shadow-2xl shadow-black/50">
                                        {receiveNetworkRows.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                disabled={!item.supported}
                                                onClick={() => {
                                                    if (!item.supported) return;
                                                    setReceiveNetwork(item.id);
                                                    setOpenMenu(null);
                                                    setWithdrawalPreview(null);
                                                    setWithdrawalMessage(null);
                                                    setWithdrawalError(null);
                                                }}
                                                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-bold focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${item.supported ? 'text-zinc-200 hover:bg-zinc-800/80' : 'cursor-not-allowed text-zinc-600'}`}
                                            >
                                                <span className="flex items-center gap-2">
                                                    <ChainLogo id={item.id} label={item.name} className="h-5 w-5" />
                                                    {item.name}
                                                </span>
                                                <span className="flex items-center gap-3 text-zinc-500">
                                                    {item.supported ? `Min ${item.min}` : item.supportLabel}
                                                    {receiveNetwork === item.id && <span className="text-white">✓</span>}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                </div>
                            </div>
                        </div>

                        {(withdrawalError || withdrawalMessage || setupLoading) && (
                            <div className={`${modal ? 'mb-3' : 'mb-5'} rounded-xl border ${withdrawalError ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-zinc-800 bg-zinc-950/40 text-zinc-400'} px-3 py-2 text-[11px] font-semibold leading-relaxed`}>
                                {setupLoading ? 'Checking venue-ready balances and withdrawal capabilities...' : withdrawalError ?? withdrawalMessage}
                            </div>
                        )}

                        {/* Lotus specific withdrawals */}
                        <div className={`${compactSection} ${modal ? 'p-3' : 'p-4'} bg-zinc-900/30 rounded-xl border border-zinc-800/50`}>
                             <div className="flex justify-between items-center mb-3">
                                <span className="text-zinc-400 text-xs font-bold">Source Venue(s)</span>
                                <div className="flex gap-2">
                                    <span onClick={() => setWithdrawMode('single')} className={`cursor-pointer px-2 py-0.5 rounded text-xs ${withdrawMode === 'single' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500'}`}>Single</span>
                                    <span onClick={() => setWithdrawMode('multiple')} className={`cursor-pointer px-2 py-0.5 rounded text-xs ${withdrawMode === 'multiple' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500'}`}>Multi</span>
                                </div>
                             </div>
                             {withdrawMode === 'single' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {withdrawalVenueRows.map(v => (
                                        <button
                                            type="button"
                                            key={v.id}
                                            onClick={() => setWithdrawVenue(v.id)}
                                            className={`p-2 rounded-lg border text-left text-xs cursor-pointer transition-colors ${withdrawVenue === v.id ? 'bg-[#0070f3]/10 border-[#0070f3] text-white' : 'border-zinc-800/80 text-zinc-400 hover:bg-[#27272a]/50'} ${v.blocked ? 'opacity-70' : ''}`}
                                        >
                                            <div className="mb-1 flex items-center gap-2 font-bold">
                                                <VenueLogo id={v.id} label={v.name} className="h-4 w-4" />
                                                <span className="min-w-0">
                                                    <span className="block truncate">{v.name}</span>
                                                    <span className="block truncate text-[10px] font-medium text-zinc-500">{v.rail}</span>
                                                </span>
                                            </div>
                                            <div className="text-[10px] font-mono">{v.balanceLabel}</div>
                                            {v.blocker && <div className="mt-1 truncate text-[10px] text-amber-300/80">{v.blocker}</div>}
                                        </button>
                                    ))}
                                </div>
                             ) : (
                                <div className="space-y-2">
                                    {withdrawalVenueRows.map(v => (
                                        <div key={v.id} className="flex justify-between items-center bg-zinc-950/50 border border-zinc-800/80 rounded-lg p-2">
                                            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                                                <VenueLogo id={v.id} label={v.name} className="h-4 w-4" />
                                                <span className="min-w-0">
                                                    <span className="block truncate">{v.name}</span>
                                                    <span className="block truncate text-[10px] font-medium text-zinc-600">{v.balanceLabel}</span>
                                                </span>
                                            </span>
                                            <input 
                                                type="text" 
                                                value={withdrawAllocations[v.id]} 
                                                onChange={(e) => handleAllocationChange(v.id, e.target.value, true)}
                                                disabled={v.blocked || v.availableAmount <= 0}
                                                className="w-20 bg-transparent text-right text-xs font-mono text-white outline-none disabled:text-zinc-700"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    ))}
                                </div>
                             )}
                        </div>

                        <div className={`${modal ? 'space-y-2 mb-3' : 'space-y-3 mb-6'} font-semibold`}>
                            <div className="flex justify-between text-[13px]">
                                <span className="text-zinc-300">You will receive</span>
                                <span className="text-zinc-500">
                                    {withdrawalReceiveEstimate === null ? '-' : `${formatTokenAmount(withdrawalReceiveEstimate)} ${receiveAsset}`}
                                </span>
                            </div>
                            <div className="flex justify-between text-[13px]">
                                <span className="text-zinc-300">Transaction breakdown</span>
                                <span className="text-zinc-500">
                                    {withdrawalFees === null ? '-' : `${formatTokenAmount(withdrawalFees)} ${receiveAsset} fees`}
                                </span>
                            </div>
                        </div>

                        {withdrawalPreview && (
                            <div className={`${compactSection} rounded-xl border border-[#0070f3]/20 bg-[#0070f3]/5 p-3`}>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#7db8ff]">Withdrawal route</span>
                                    <span className="text-[10px] font-bold text-zinc-500">{withdrawalPreview.currentStatus}</span>
                                </div>
                                <div className="space-y-2">
                                    {withdrawalPreview.routeLegs.map((leg) => (
                                        <div key={leg.withdrawalRouteLegId} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-bold text-white">{leg.sourceVenue}</span>
                                                <span className="font-mono text-zinc-300">{leg.destinationAmountEstimate} {receiveAsset}</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-zinc-500">{leg.routeQuote?.userSafeSummary ?? leg.status}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={previewWithdrawalRoute}
                            disabled={!withdrawalReady || withdrawalLoading || setupLoading}
                            className={`flex w-full items-center justify-center gap-2 bg-[#0070f3] hover:bg-[#0060df] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-semibold ${modal ? 'py-2.5' : 'py-3.5'} rounded-xl text-sm transition-colors shadow-lg shadow-blue-900/20`}
                        >
                            {(withdrawalLoading || setupLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
                            {withdrawalButtonLabel}
                        </button>
                    </div>
                )}
            </div>
            {successReceiptOpen && fundingReceipt && (
                fundingReceiptFailed(fundingReceipt) ? (
                    <DepositFailedReceipt
                        modal
                        receipt={fundingReceipt}
                        onClose={() => setSuccessReceiptOpen(false)}
                        onRetry={() => {
                            setSuccessReceiptOpen(false);
                            resetFundingRouteState();
                        }}
                        onReturn={() => setSuccessReceiptOpen(false)}
                    />
                ) : (
                    <DepositSuccessReceipt
                        modal
                        receipt={fundingReceipt}
                        onClose={() => setSuccessReceiptOpen(false)}
                        onViewPortfolio={() => {
                            setSuccessReceiptOpen(false);
                            onClose?.();
                        }}
                        onStartTrading={() => {
                            setSuccessReceiptOpen(false);
                            onClose?.();
                        }}
                    />
                )
            )}
        </div>
    );
};
