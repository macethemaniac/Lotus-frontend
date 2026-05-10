import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Check, Copy, Info, ChevronDown, Loader2, X } from 'lucide-react';
import { ChainLogo, CryptoLogo, VenueLogo } from '@/components/icons/asset-logo';
import type { AuthSession } from '@/features/auth/types';
import {
    createFundingIntent,
    getVenueBalances,
    getVenueCapabilities,
    quoteFundingIntent,
    type FundingIntentResponse,
    type VenueBalance,
    type VenueCapability
} from '@/features/funding/api/funding-api';
import {
    ensureDefaultWallets,
    listVenueAccounts,
    prepareVenueSetupBatch,
    type UserVenueAccount,
    type UserWallet
} from '@/features/wallets/api/wallet-api';
import { shortAddress } from '@/lib/formatting/format';

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
    const [fundingError, setFundingError] = useState<string | null>(null);
    const [fundingMessage, setFundingMessage] = useState<string | null>(null);
    const [quotePreview, setQuotePreview] = useState<FundingIntentResponse | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copiedAddress, setCopiedAddress] = useState(false);

    // Withdraw state
    const [withdrawMode, setWithdrawMode] = useState<'single' | 'multiple'>('single');
    const [withdrawVenue, setWithdrawVenue] = useState('polymarket');
    const [withdrawAllocations, setWithdrawAllocations] = useState<{ [key: string]: string }>({
        polymarket: '0', limitless: '0', predict: '0', myriad: '0', opinion: '0'
    });
    const [destinationAddress, setDestinationAddress] = useState('');

    const assets = [
        { id: 'USDC', name: 'USDC' },
        { id: 'USDT', name: 'USDT' },
        { id: 'SOL', name: 'SOL' }
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
        { id: 'polymarket', name: 'Polymarket', rail: 'Polygon USDC', balance: '10,450.00' },
        { id: 'limitless', name: 'Limitless', rail: 'Venue-ready USDC', balance: '500.00' },
        { id: 'predict', name: 'Predict.fun', rail: 'BNB Chain USDT', balance: '1,500.00' },
        { id: 'myriad', name: 'Myriad', rail: 'Venue-ready balance', balance: '0.00' },
        { id: 'opinion', name: 'Opinion', rail: 'Venue-ready balance', balance: '0.00' }
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
    const selectedReceiveAsset = assets.find(item => item.id === receiveAsset) ?? assets[0];
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
    const supportedFundingVenues = useMemo(() => {
        const byVenue = new Map(capabilities.map(capability => [String(capability.venue ?? '').toUpperCase(), capability]));
        return venues.filter(venue => {
            const capability = byVenue.get(venueIdToBackend[venue.id]);
            return capability?.fundingSupported !== false && capability?.supported !== false && capability?.status !== 'DISABLED';
        });
    }, [capabilities, venues]);
    const displayedVenues = supportedFundingVenues.length > 0 ? supportedFundingVenues : venues;
    const quoteReady = Boolean(session?.userJwt && sourceWallet && amount && Number(amount) > 0);

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
                setWallets(walletResponse.wallets ?? []);
                setVenueAccounts(accountResponse.accounts ?? []);
                setVenueBalances(balanceResponse.balances ?? balanceResponse.venues ?? []);
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

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/[^0-9.]/g, '');
        if (val.split('.').length > 2) val = val.replace(/\.+$/, '');
        setAmount(val);
    };

    const handleAllocationChange = (id: string, val: string, isWithdraw = false) => {
        let cleanVal = val.replace(/[^0-9.]/g, '');
        if (cleanVal.split('.').length > 2) cleanVal = cleanVal.replace(/\.+$/, '');
        if (isWithdraw) {
            setWithdrawAllocations(prev => ({ ...prev, [id]: cleanVal }));
        } else {
            setAllocations(prev => ({ ...prev, [id]: cleanVal }));
        }
    };

    const numAmount = parseFloat(amount) || 0;
    const totalAllocated = Number(Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0));
    const difference = numAmount - totalAllocated;

    const totalWithdrawAllocated = Number(Object.values(withdrawAllocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0));
    const withdrawDifference = numAmount - totalWithdrawAllocated;
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
            : routeLoading
                ? 'Previewing funding route'
                : 'Preview funding route';

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
            const quoted = await quoteFundingIntent(session.userJwt, intent.intent.fundingIntentId);
            setQuotePreview(quoted);
            setFundingMessage(quoted.userSafeMessage || 'Funding route preview is ready. User signature is required before funds move.');
        } catch (error) {
            setFundingError(error instanceof Error ? error.message : 'Funding route preview failed.');
        } finally {
            setRouteLoading(false);
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
                                                onClick={() => { setAsset(item.id); setOpenMenu(null); }}
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
                                                onClick={() => { setNetwork(item.id); setOpenMenu(null); }}
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
                                    <button type="button" onClick={() => setAllocationMode('auto')} className={`px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${allocationMode === 'auto' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'text-zinc-500'}`}>Auto</button>
                                    <button type="button" onClick={() => setAllocationMode('single')} className={`px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${allocationMode === 'single' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500'}`}>Single venue</button>
                                    <button type="button" onClick={() => setAllocationMode('split')} className={`px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40 ${allocationMode === 'split' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500'}`}>Split</button>
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
                                                onClick={() => setSelectedVenue(v.id)}
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
                                    <span className="text-[10px] font-bold text-zinc-500">{quotePreview.intent.status}</span>
                                </div>
                                <div className="space-y-2">
                                    {quotePreview.routeLegs.map((leg) => (
                                        <div key={leg.routeLegId} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-bold text-white">{leg.targetVenue}</span>
                                                <span className="font-mono text-zinc-300">{leg.destinationAmountEstimate} {leg.destinationToken}</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-zinc-500">{leg.routeQuote?.userSafeSummary ?? leg.routeProvider}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={previewFundingRoute}
                            disabled={!quoteReady || routeLoading || setupLoading}
                            className={`mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c6ff00] px-4 ${modal ? 'py-2.5' : 'py-3.5'} text-sm font-bold text-black transition-colors hover:bg-[#b8f000] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40`}
                        >
                            {(routeLoading || setupLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
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
                                <span className="text-zinc-500 text-sm font-semibold">USD</span>
                                <button className="bg-zinc-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-zinc-700">Max</button>
                            </div>
                            <div className="flex justify-between mt-2 px-1">
                                <span className="text-zinc-500 text-xs">$0.00</span>
                                <span className="text-zinc-500 text-xs">Balance: 7.32 USD</span>
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
                                        {assets.map(item => (
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
                                        {receiveNetworks.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => { setReceiveNetwork(item.id); setOpenMenu(null); }}
                                                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-bold text-zinc-200 hover:bg-zinc-800/80 focus-visible:ring-2 focus-visible:ring-[#c6ff00]/40"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <ChainLogo id={item.id} label={item.name} className="h-5 w-5" />
                                                    {item.name}
                                                </span>
                                                <span className="flex items-center gap-3 text-zinc-500">
                                                    Min {item.min}
                                                    {receiveNetwork === item.id && <span className="text-white">✓</span>}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                </div>
                            </div>
                        </div>

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
                                    {venues.map(v => (
                                        <div key={v.id} onClick={() => setWithdrawVenue(v.id)} className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors ${withdrawVenue === v.id ? 'bg-[#0070f3]/10 border-[#0070f3] text-white' : 'border-zinc-800/80 text-zinc-400 hover:bg-[#27272a]/50'}`}>
                                            <div className="mb-1 flex items-center gap-2 font-bold">
                                                <VenueLogo id={v.id} label={v.name} className="h-4 w-4" />
                                                <span className="min-w-0">
                                                    <span className="block truncate">{v.name}</span>
                                                    <span className="block truncate text-[10px] font-medium text-zinc-500">{v.rail}</span>
                                                </span>
                                            </div>
                                            <div className="text-[10px] font-mono">${v.balance}</div>
                                        </div>
                                    ))}
                                </div>
                             ) : (
                                <div className="space-y-2">
                                    {venues.map(v => (
                                        <div key={v.id} className="flex justify-between items-center bg-zinc-950/50 border border-zinc-800/80 rounded-lg p-2">
                                            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                                                <VenueLogo id={v.id} label={v.name} className="h-4 w-4" />
                                                <span className="min-w-0">
                                                    <span className="block truncate">{v.name}</span>
                                                    <span className="block truncate text-[10px] font-medium text-zinc-600">{v.rail}</span>
                                                </span>
                                            </span>
                                            <input 
                                                type="text" 
                                                value={withdrawAllocations[v.id]} 
                                                onChange={(e) => handleAllocationChange(v.id, e.target.value, true)}
                                                className="w-20 bg-transparent text-right text-xs font-mono text-white outline-none"
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
                                <span className="text-zinc-500">-</span>
                            </div>
                            <div className="flex justify-between text-[13px]">
                                <span className="text-zinc-300">Transaction breakdown</span>
                                <span className="text-zinc-500">-</span>
                            </div>
                        </div>

                        <button className={`w-full bg-[#0070f3] hover:bg-[#0060df] text-white font-semibold ${modal ? 'py-2.5' : 'py-3.5'} rounded-xl text-sm transition-colors shadow-lg shadow-blue-900/20`}>
                            Enter Recipient Address
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
