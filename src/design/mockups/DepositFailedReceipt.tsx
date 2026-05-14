import React from 'react';
import { XCircle, ExternalLink, AlertTriangle, X } from 'lucide-react';
import { CryptoLogo } from '@/components/icons/asset-logo';
import type { FundingReceipt } from '@/features/funding/api/funding-api';
import { shortAddress } from '@/lib/formatting/format';

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const readFirstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
};

const firstTxHash = (receipt?: FundingReceipt | null): string | null => {
  for (const leg of receipt?.routeLegs ?? []) {
    const record = readRecord(leg);
    const txHashes = Array.isArray(record.txHashes) ? record.txHashes : [];
    const txHash = typeof txHashes[0] === 'string' ? txHashes[0] : readFirstString(record.txHash, record.transactionHash);
    if (txHash) return txHash;
  }
  return null;
};

const failedNetwork = (receipt?: FundingReceipt | null): string =>
  readFirstString(receipt?.sourceChain, readRecord(receipt?.routeLegs?.[0]).sourceChain) ?? 'Selected network';

const failedReason = (receipt?: FundingReceipt | null): string =>
  readFirstString(
    receipt?.userSafeMessage,
    readRecord(receipt?.routeLegs?.[0]).errorReason,
    readRecord(receipt?.routeLegs?.[0]).reason
  ) ?? 'The funding route could not be completed. No venue-ready balance was confirmed.';

export const DepositFailedReceipt = ({
  receipt,
  modal = false,
  onClose,
  onRetry,
  onReturn,
}: {
  receipt?: FundingReceipt | null;
  modal?: boolean;
  onClose?: () => void;
  onRetry?: () => void;
  onReturn?: () => void;
}) => {
  const amount = receipt?.sourceAmount ?? '1,000';
  const token = receipt?.sourceToken ?? 'USDC';
  const txHash = firstTxHash(receipt);
  const shellClass = modal
    ? 'fixed inset-0 z-[80] bg-black/70 p-3 backdrop-blur-md'
    : 'min-h-[calc(100vh-4rem)] pt-8 pb-32';
  const cardClass = modal
    ? 'max-h-[calc(100dvh-1.5rem)] rounded-2xl p-4 sm:p-5 overflow-y-auto custom-scrollbar'
    : 'rounded-3xl p-8 sm:p-10';

  return (
    <div className={`${shellClass} flex flex-col items-center justify-center`}>
      <div className={`w-full ${modal ? 'max-w-[390px]' : 'max-w-[500px]'} flex flex-col relative z-10`}>
        <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 ${modal ? 'h-[180px] w-[180px] blur-[56px]' : 'w-[300px] h-[300px] blur-[80px]'} bg-red-500/[0.08] rounded-full pointer-events-none`}></div>

        <div className={`bg-[#121214] border border-zinc-800/80 shadow-2xl relative flex flex-col items-center ${cardClass}`}>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:ring-2 focus-visible:ring-red-500/40"
              aria-label="Close failed deposit receipt"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className={`relative ${modal ? 'mb-3' : 'mb-6'} group`}>
            <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl scale-150 animate-pulse transition-all"></div>
            <div className={`${modal ? 'h-12 w-12 border-2' : 'w-20 h-20 border-[3px]'} bg-zinc-900 border-red-500 rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-red-500/20`}>
              <XCircle className={`${modal ? 'h-6 w-6' : 'w-10 h-10'} text-red-500`} strokeWidth={2.5} />
            </div>
          </div>

          <h1 className={`${modal ? 'text-xl' : 'text-2xl sm:text-3xl'} font-bold tracking-tight text-white mb-1.5 text-center`}>Deposit Failed</h1>
          <p className={`${modal ? 'mb-4 text-[12px]' : 'mb-8 text-[14px]'} text-zinc-400 font-medium text-center max-w-[320px] leading-relaxed`}>
            The transaction could not be completed. Your funds have not been marked venue-ready.
          </p>

          <div className={`bg-zinc-950/40 border border-zinc-800/80 rounded-2xl w-full ${modal ? 'p-3 mb-4' : 'p-6 mb-6'} text-center`}>
            <div className={`${modal ? 'text-[9px]' : 'text-[11px]'} font-bold text-zinc-500 uppercase tracking-widest mb-1`}>Attempted Deposit</div>
            <div className={`${modal ? 'text-2xl' : 'text-3xl sm:text-4xl'} font-bold text-zinc-500 tracking-tight tabular-nums font-mono flex items-center justify-center gap-2 line-through decoration-red-500/50`}>
              {amount} <span className={`${modal ? 'text-sm' : 'text-[20px]'} font-sans`}>{token}</span>
            </div>
          </div>

          <div className={`w-full ${modal ? 'mb-4 p-3' : 'mb-8 p-4'} bg-red-500/5 border border-red-500/10 rounded-xl`}>
            <div className="flex gap-3 text-left">
              <AlertTriangle className={`${modal ? 'h-4 w-4' : 'w-5 h-5'} text-red-500 shrink-0 mt-0.5`} />
              <div>
                <h4 className={`${modal ? 'text-[12px]' : 'text-[13px]'} font-bold text-red-500 mb-1`}>{receipt?.currentStatus?.replace(/_/g, ' ') ?? 'Funding failed'}</h4>
                <p className={`${modal ? 'text-[11px]' : 'text-[12px]'} text-zinc-400 leading-relaxed font-medium`}>{failedReason(receipt)}</p>
              </div>
            </div>
          </div>

          <div className={`w-full ${modal ? 'space-y-2 mb-4' : 'space-y-4 mb-8'}`}>
            <div className={`${modal ? 'text-[11px] pb-2' : 'text-[13px] pb-3'} flex justify-between items-center border-b border-zinc-800/50`}>
              <span className="text-zinc-500 font-medium">Asset</span>
              <div className="flex items-center gap-1.5">
                <CryptoLogo id={token} label={token} className="h-4 w-4" />
                <span className="text-zinc-200 font-medium">{token}</span>
              </div>
            </div>
            <div className={`${modal ? 'text-[11px] pb-2' : 'text-[13px] pb-3'} flex justify-between items-center border-b border-zinc-800/50`}>
              <span className="text-zinc-500 font-medium">Network</span>
              <span className="text-zinc-200 font-medium">{failedNetwork(receipt)}</span>
            </div>
          </div>

          <div className={`${modal ? 'space-y-2' : 'space-y-3'} w-full`}>
            <button
              type="button"
              onClick={onRetry}
              className={`w-full ${modal ? 'py-2.5 text-[13px]' : 'py-3.5 text-[14px]'} bg-red-500/10 border border-red-500/20 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all shadow-lg shadow-red-500/5`}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={onReturn ?? onClose}
              className={`w-full ${modal ? 'py-2.5 text-[12px]' : 'py-3 text-[13px]'} bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold rounded-xl hover:bg-zinc-800 hover:text-white transition-colors`}
            >
              Return to Funding
            </button>
          </div>

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
