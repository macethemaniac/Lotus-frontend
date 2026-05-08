import React from 'react';
import { CheckCircle2, ArrowRight, ExternalLink, ShieldCheck, Wallet, Check } from 'lucide-react';

export const DepositSuccessReceipt = () => {
    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center pt-8 pb-32">
            <div className="w-full max-w-[500px] flex flex-col relative z-10">
                {/* Background ambient glow */}
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[#00ff88]/[0.08] rounded-full blur-[80px] pointer-events-none"></div>

                <div className="bg-[#121214] border border-zinc-800/80 rounded-3xl shadow-2xl p-8 sm:p-10 relative overflow-hidden flex flex-col items-center">
                    
                    {/* Success Icon */}
                    <div className="relative mb-6 group">
                        <div className="absolute inset-0 bg-[#00ff88]/20 rounded-full blur-xl scale-150 animate-pulse transition-all"></div>
                        <div className="w-20 h-20 bg-zinc-900 border-[3px] border-[#00ff88] rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-[#00ff88]/20">
                            <Check className="w-10 h-10 text-[#00ff88]" strokeWidth={3} />
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2 text-center">Deposit Complete</h1>
                    <p className="text-[14px] text-zinc-400 font-medium text-center max-w-[320px] leading-relaxed mb-8">
                        Your funds are now instantly available across all venues
                    </p>

                    {/* Prominent Amount */}
                    <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-2xl w-full p-6 text-center mb-6">
                        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Successfully Deposited</div>
                        <div className="text-3xl sm:text-4xl font-bold text-white tracking-tight tabular-nums font-mono flex items-center justify-center gap-2">
                           1,000 <span className="text-[20px] text-[#00ff88] mt-1.5 font-sans">USDC</span>
                        </div>
                    </div>

                    {/* Breakdown Details */}
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
                            <span className="text-zinc-500 font-medium">Network Gas & Bridge (LiFi)</span>
                            <span className="text-zinc-200 font-mono font-medium">~$0.80</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px] border-b border-zinc-800/50 pb-3">
                            <span className="text-zinc-500 font-medium">Lotus Fee</span>
                            <span className="text-[#00ff88] font-bold tracking-wide border border-[#00ff88]/30 bg-[#00ff88]/10 px-1.5 rounded uppercase text-[10px]">Free</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-zinc-300 font-bold text-sm">Total Received</span>
                            <span className="text-white text-base font-mono tracking-tight font-bold">999.20 USDC</span>
                        </div>
                    </div>

                    {/* Note */}
                    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4 w-full mb-8 flex gap-3 text-left">
                        <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 opacity-80 mt-0.5" />
                        <p className="text-[12px] text-zinc-400 leading-relaxed font-medium">
                            Funds have been automatically allocated and are ready for trading on <span className="text-blue-400/80 font-bold">Polymarket</span>, <span className="text-orange-400/80 font-bold">Opinion</span>, <span className="text-indigo-400/80 font-bold">Limitless</span>, and more.
                        </p>
                    </div>

                    {/* Primary Actions */}
                    <div className="w-full space-y-3">
                        <button className="w-full py-3.5 bg-[#00ff88] text-black font-bold rounded-xl text-[14px] flex items-center justify-center gap-2 hover:bg-[#00e676] transition-all hover:scale-[1.01] active:scale-[0.98] shadow-lg shadow-[#00ff88]/15">
                            <Wallet className="w-4 h-4" /> View in Portfolio
                        </button>
                        <div className="flex gap-3">
                            <button className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold rounded-xl text-[13px] hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-center gap-1.5">
                                Start Trading <ArrowRight className="w-3.5 h-3.5" />
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
