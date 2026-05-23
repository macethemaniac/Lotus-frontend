import React from 'react';
import { ArrowRight, Clock3, ExternalLink, ShieldCheck, Wallet, Check, X } from 'lucide-react';
import { CryptoLogo, VenueLogo } from '@/components/icons/asset-logo';
import type { FundingReceipt } from '@/features/funding/api/funding-api';
import { shortAddress } from '@/lib/formatting/format';

type ReceiptLegSummary = {
    venue: string;
    amount: string | null;
    token: string | null;
    txHash: string | null;
};

const readRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const readFirstString = (...values: unknown[]): string | null => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
};

const receiptLegs = (receipt?: FundingReceipt | null): ReceiptLegSummary[] => {
    return (receipt?.routeLegs ?? []).map((entry) => {
        const record = readRecord(entry);
        const txHashes = Array.isArray(record.txHashes) ? record.txHashes : [];
        return {
            venue: readFirstString(record.targetVenue, record.target_venue, record.venue) ?? 'Venue',
            amount: readFirstString(record.destinationAmountEstimate, record.destination_amount_estimate, record.sourceAmount, record.source_amount),
            token: readFirstString(record.destinationToken, record.destination_token, record.sourceToken, record.source_token),
            txHash: typeof txHashes[0] === 'string' ? txHashes[0] : readFirstString(record.txHash, record.transactionHash),
        };
    });
};

const venueLogoId = (venue: string): string => {
    const normalized = venue.toLowerCase();
    if (normalized.includes('poly')) return 'polymarket';
    if (normalized.includes('limit')) return 'limitless';
    if (normalized.includes('predict')) return 'predict';
    if (normalized.includes('myriad')) return 'myriad';
    if (normalized.includes('opinion')) return 'opinion';
    return normalized;
};

const firstTxHash = (legs: ReceiptLegSummary[]): string | null =>
    legs.find((leg) => leg.txHash)?.txHash ?? null;

export const DepositSuccessReceipt = ({
    receipt,
    modal = false,
    onClose,
    onViewPortfolio,
    onStartTrading,
}: {
    receipt?: FundingReceipt | null;
    modal?: boolean;
    onClose?: () => void;
    onViewPortfolio?: () => void;
    onStartTrading?: () => void;
}) => {
    const legs = receiptLegs(receipt);
    const txHash = firstTxHash(legs);
    const status = receipt?.currentStatus ?? 'READY_TO_TRADE';
    const normalizedStatus = status.toUpperCase();
    const fullyReady = ['READY_TO_TRADE', 'PARTIALLY_READY_TO_TRADE', 'COMPLETED', 'DONE'].includes(normalizedStatus);
    const accent = fullyReady ? '#00ff88' : '#c6ff00';
    const amount = receipt?.sourceAmount ?? '1,000';
    const token = receipt?.sourceToken ?? 'USDC';
    const fees = receipt?.totalEstimatedFees ?? '0.80';
    const receivedAmount = legs.reduce((sum, leg) => sum + Number(leg.amount ?? 0), 0);
    const receivedLabel = Number.isFinite(receivedAmount) && receivedAmount > 0
        ? `${receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${legs[0]?.token ?? token}`
        : `${amount} ${token}`;
    const shellClass = modal
        ? 'fixed inset-0 z-[80] bg-black/70 p-3 backdrop-blur-md'
        : 'min-h-[calc(100dvh-4rem)] px-3 pt-6 pb-32 sm:px-0 sm:pt-8';
    const cardClass = modal
        ? 'max-h-[calc(100dvh-1.5rem)] rounded-2xl p-4 sm:p-5 overflow-y-auto custom-scrollbar'
        : 'rounded-3xl p-8 sm:p-10';

    return (
        <div className={`${shellClass} flex flex-col items-center justify-center`}>
            <div className={`w-full ${modal ? 'max-w-[390px]' : 'max-w-[500px]'} flex flex-col relative z-10`}>
                {/* Background ambient glow */}
                <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 ${modal ? 'h-[180px] w-[180px] blur-[56px]' : 'h-[300px] w-[300px] blur-[80px]'} rounded-full ${fullyReady ? 'bg-[#00ff88]/[0.08]' : 'bg-[#c6ff00]/[0.08]'} pointer-events-none`}></div>

                <div className={`bg-[#121214] border border-zinc-800/80 shadow-2xl relative flex flex-col items-center ${cardClass}`}>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:ring-2 focus-visible:ring-[#00ff88]/50"
                            aria-label="Close deposit receipt"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    
                    {/* Success Icon */}
                    <div className={`relative ${modal ? 'mb-3' : 'mb-6'} group`}>
                        <div className={`absolute inset-0 ${fullyReady ? 'bg-[#00ff88]/20' : 'bg-[#c6ff00]/20'} rounded-full blur-xl scale-150 animate-pulse transition-all`}></div>
                        <div className={`${modal ? 'h-12 w-12 border-2' : 'w-20 h-20 border-[3px]'} bg-zinc-900 rounded-full flex items-center justify-center relative z-10 shadow-lg ${fullyReady ? 'border-[#00ff88] shadow-[#00ff88]/20' : 'border-[#c6ff00] shadow-[#c6ff00]/20'}`}>
                            {fullyReady ? (
                                <Check className={`${modal ? 'h-6 w-6' : 'w-10 h-10'} text-[#00ff88]`} strokeWidth={3} />
                            ) : (
                                <Clock3 className={`${modal ? 'h-6 w-6' : 'w-10 h-10'} text-[#c6ff00]`} strokeWidth={2.5} />
                            )}
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className={`${modal ? 'text-xl' : 'text-2xl sm:text-3xl'} font-bold tracking-tight text-white mb-1.5 text-center`}>
                        {fullyReady ? 'Deposit Complete' : 'Deposit Pending'}
                    </h1>
                    <p className={`${modal ? 'mb-4 text-[12px]' : 'mb-8 text-[14px]'} text-zinc-400 font-medium text-center max-w-[320px] leading-relaxed`}>
                        {fullyReady
                            ? 'Your funds are venue-ready and available for trading.'
                            : receipt?.userSafeMessage || 'Lotus is tracking this route until venue readiness is confirmed.'}
                    </p>

                    {/* Prominent Amount */}
                    <div className={`bg-zinc-950/40 border border-zinc-800/80 rounded-2xl w-full ${modal ? 'p-3 mb-4' : 'p-6 mb-6'} text-center`}>
                        <div className={`${modal ? 'text-[9px]' : 'text-[11px]'} font-bold text-zinc-500 uppercase tracking-widest mb-1`}>{fullyReady ? 'Successfully Deposited' : 'Pending Deposit'}</div>
                        <div className={`${modal ? 'text-2xl' : 'text-3xl sm:text-4xl'} font-bold text-white tracking-tight tabular-nums font-mono flex items-center justify-center gap-2`}>
                           {amount} <span className={`${modal ? 'text-sm' : 'text-[20px] mt-1.5'} font-sans ${fullyReady ? 'text-[#00ff88]' : 'text-[#c6ff00]'}`}>{token}</span>
                        </div>
                    </div>

                    {/* Breakdown Details */}
                    <div className={`w-full ${modal ? 'space-y-2 mb-4' : 'space-y-4 mb-8'}`}>
                        <div className={`${modal ? 'text-[11px] pb-2' : 'text-[13px] pb-3'} flex justify-between items-center border-b border-zinc-800/50`}>
                            <span className="text-zinc-500 font-medium">Asset</span>
                            <div className="flex items-center gap-1.5">
                                <CryptoLogo id={token} label={token} className="h-4 w-4" />
                                <span className="text-zinc-200 font-medium">{token}</span>
                            </div>
                        </div>
                        <div className={`${modal ? 'text-[11px] pb-2' : 'text-[13px] pb-3'} flex justify-between items-center border-b border-zinc-800/50`}>
                            <span className="text-zinc-500 font-medium">Network Gas & Bridge (LiFi)</span>
                            <span className="text-zinc-200 font-mono font-medium">~${fees}</span>
                        </div>
                        <div className={`${modal ? 'text-[11px] pb-2' : 'text-[13px] pb-3'} flex justify-between items-center border-b border-zinc-800/50`}>
                            <span className="text-zinc-500 font-medium">Lotus Fee</span>
                            <span className="text-[#00ff88] font-bold tracking-wide border border-[#00ff88]/30 bg-[#00ff88]/10 px-1.5 rounded uppercase text-[10px]">Free</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                            <span className={`${modal ? 'text-xs' : 'text-sm'} text-zinc-300 font-bold`}>Total Received</span>
                            <span className={`${modal ? 'text-sm' : 'text-base'} text-white font-mono tracking-tight font-bold`}>{receivedLabel}</span>
                        </div>
                    </div>

                    {/* Note */}
                    <div className={`bg-zinc-900/30 border border-zinc-800/50 rounded-xl ${modal ? 'p-3 mb-4 gap-2' : 'p-4 mb-8 gap-3'} w-full flex text-left`}>
                        <ShieldCheck className={`${modal ? 'h-4 w-4' : 'w-5 h-5'} text-emerald-500 shrink-0 opacity-80 mt-0.5`} />
                        <p className={`${modal ? 'text-[11px]' : 'text-[12px]'} text-zinc-400 leading-relaxed font-medium`}>
                            Funds have been allocated through Lotus routing
                            {legs.length > 0 && (
                                <>
                                    {' '}for{' '}
                                    {legs.map((leg, index) => (
                                        <React.Fragment key={`${leg.venue}-${index}`}>
                                            {index > 0 ? ', ' : ''}
                                                <span className="inline-flex items-center gap-1 text-[#00ff88]/80 font-bold">
                                                <VenueLogo id={venueLogoId(leg.venue)} label={leg.venue} className="h-3.5 w-3.5" />
                                                {leg.venue}
                                            </span>
                                        </React.Fragment>
                                    ))}
                                </>
                            )}
                            . {fullyReady ? 'Funds are ready for trading.' : 'Lotus is still confirming delivery and venue readiness.'}
                        </p>
                    </div>

                    {/* Primary Actions */}
                    <div className={`${modal ? 'space-y-2' : 'space-y-3'} w-full`}>
                        <button
                            type="button"
                            onClick={onViewPortfolio}
                            className={`w-full ${modal ? 'py-2.5 text-[13px]' : 'py-3.5 text-[14px]'} text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.98] shadow-lg`}
                            style={{ backgroundColor: accent, boxShadow: `0 12px 28px ${accent}26` }}
                        >
                            <Wallet className="w-4 h-4" /> View in Portfolio
                        </button>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onStartTrading}
                                className={`flex-1 ${modal ? 'py-2.5 text-[12px]' : 'py-3 text-[13px]'} bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold rounded-xl hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-center gap-1.5`}
                            >
                                Start Trading <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    
                    {/* Transaction Explorer Link */}
                    {txHash && (
                        <div className={`${modal ? 'mt-4 pt-3' : 'mt-8 pt-4'} border-t border-zinc-800/60 w-full flex justify-center`}>
                            <a href={`https://solscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-white transition-colors group font-mono">
                                Tx: {shortAddress(txHash)} <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
