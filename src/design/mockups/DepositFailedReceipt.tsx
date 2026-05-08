import React from 'react';
import { XCircle, ArrowRight, ExternalLink, ShieldCheck, Wallet, AlertTriangle } from 'lucide-react';

export const DepositFailedReceipt = () => {
    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center pt-8 pb-32">
            <div className="w-full max-w-[500px] flex flex-col relative z-10">
                {/* Background ambient glow */}
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-red-500/[0.08] rounded-full blur-[80px] pointer-events-none"></div>

                <div className="bg-[#121214] border border-zinc-800/80 rounded-3xl shadow-2xl p-8 sm:p-10 relative overflow-hidden flex flex-col items-center">
                    
                    {/* Failed Icon */}
                    <div className="relative mb-6 group">
                        <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl scale-150 animate-pulse transition-all"></div>
                        <div className="w-20 h-20 bg-zinc-900 border-[3px] border-red-500 rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-red-500/20">
                            <XCircle className="w-10 h-10 text-red-500" strokeWidth={2.5} />
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2 text-center">Deposit Failed</h1>
                    <p className="text-[14px] text-zinc-400 font-medium text-center max-w-[320px] leading-relaxed mb-8">
                        The transaction could not be completed. Your funds have not been deducted.
                    </p>

                    {/* Prominent Amount Attempted */}
                    <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl w-full p-6 text-center mb-6">
                        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Attempted Deposit</div>
                        <div className="text-3xl sm:text-4xl font-bold text-zinc-500 tracking-tight tabular-nums font-mono flex items-center justify-center gap-2 line-through decoration-red-500/50">
                           1,000 <span className="text-[20px] font-sans">USDC</span>
                        </div>
                    </div>

                    {/* Error Details */}
                    <div className="w-full space-y-4 mb-8 bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                        <div className="flex gap-3 text-left">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-[13px] font-bold text-red-500 mb-1">Insufficient Gas Fee</h4>
                                <p className="text-[12px] text-zinc-400 leading-relaxed font-medium">
                                    The transaction failed because your wallet did not possess enough ETH on Arbitrum to cover the network's gas fees. Please top up your wallet with ETH and try again.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Summary */}
                    <div className="w-full space-y-4 mb-8">
                        <div className="flex justify-between items-center text-[13px] border-b border-zinc-800/50 pb-3">
                            <span className="text-zinc-500 font-medium">Asset</span>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3.5 h-3.5 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                                </div>
                                <span className="text-zinc-200 font-medium">USD Coin (USDC)</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-[13px] border-b border-zinc-800/50 pb-3">
                            <span className="text-zinc-500 font-medium">Network</span>
                            <span className="text-zinc-200 font-medium">Arbitrum One</span>
                        </div>
                    </div>

                    {/* Primary Actions */}
                    <div className="w-full space-y-3">
                        <button className="w-full py-3.5 bg-red-500/10 border border-red-500/20 text-red-500 font-bold rounded-xl text-[14px] flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all shadow-lg shadow-red-500/5">
                            Try Again
                        </button>
                        <div className="flex gap-3">
                            <button className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold rounded-xl text-[13px] hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-center gap-1.5">
                                Return to Funding
                            </button>
                        </div>
                    </div>
                    
                    {/* Transaction Explorer Link */}
                    <div className="mt-8 pt-4 border-t border-zinc-800/60 w-full flex justify-center">
                        <a href="#" className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-white transition-colors group font-mono">
                            Tx: 5K8f...2e9x <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
