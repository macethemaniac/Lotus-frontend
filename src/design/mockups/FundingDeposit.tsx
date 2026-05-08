import React, { useState } from 'react';
import { ArrowLeft, Copy, Info, CheckCircle2, ChevronDown, QrCode, X, Sparkles } from 'lucide-react';

export const FundingDeposit = () => {
    const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
    const [asset, setAsset] = useState('USDC');
    const [network, setNetwork] = useState('Solana');
    const [amount, setAmount] = useState('');
    
    // Deposit state
    const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');
    const [showInfo, setShowInfo] = useState(false);
    const [allocations, setAllocations] = useState<{ [key: string]: string }>({
        polymarket: '0', kalshi: '0', limitless: '0', opinion: '0'
    });

    // Withdraw state
    const [withdrawMode, setWithdrawMode] = useState<'single' | 'multiple'>('single');
    const [withdrawVenue, setWithdrawVenue] = useState('polymarket');
    const [withdrawAllocations, setWithdrawAllocations] = useState<{ [key: string]: string }>({
        polymarket: '0', kalshi: '0', limitless: '0', opinion: '0'
    });
    const [destinationAddress, setDestinationAddress] = useState('');
    
    const venues = [
        { id: 'polymarket', name: 'Polymarket', color: 'bg-blue-500', balance: '10,450.00' },
        { id: 'kalshi', name: 'Kalshi', color: 'bg-emerald-500', balance: '1,500.00' },
        { id: 'limitless', name: 'Limitless', color: 'bg-indigo-500', balance: '500.00' },
        { id: 'opinion', name: 'Opinion', color: 'bg-orange-500', balance: '0.00' }
    ];

    const copyAddress = () => {
        // mock copy
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

    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center pt-8 pb-32">
            
            <div className="bg-zinc-900/50 p-1 mb-6 rounded-lg flex gap-1 border border-zinc-800">
                <button 
                    onClick={() => setMode('deposit')}
                    className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'deposit' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                >Deposit</button>
                <button 
                    onClick={() => setMode('withdraw')}
                    className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'withdraw' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                >Withdraw</button>
            </div>

            <div className="w-full max-w-[420px] bg-[#1a1a1c] border border-zinc-800/80 rounded-[24px] shadow-2xl overflow-hidden relative">
                {mode === 'deposit' ? (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-white text-lg font-bold">Deposit and start trading in seconds</h2>
                            <button className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="flex items-center gap-3 mb-6 cursor-pointer group">
                            <div className="bg-zinc-800/50 p-1.5 rounded-full group-hover:bg-zinc-800 transition-colors">
                                <ArrowLeft className="w-4 h-4 text-zinc-400" />
                            </div>
                            <span className="text-white font-bold text-[15px]">Transfer Manually</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div>
                                <label className="text-zinc-400 text-xs font-semibold mb-2 block">Currency</label>
                                <div className="bg-[#27272a]/50 hover:bg-[#27272a] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-colors">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-inner">$</div>
                                        <span className="text-zinc-200 text-sm font-bold">{asset}</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                                </div>
                            </div>
                            <div>
                                <label className="text-zinc-400 text-xs font-semibold mb-2 block">Network</label>
                                <div className="bg-[#27272a]/50 hover:bg-[#27272a] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-colors">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 bg-black rounded-full border border-zinc-700 flex items-center justify-center text-[10px] text-[#14F195] font-bold">S</div>
                                        <span className="text-zinc-200 text-sm font-bold">{network}</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                                </div>
                            </div>
                        </div>

                        {/* Lotus Addition: Anticipated Amount & Allocation */}
                        <div className="mb-6 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                            <label className="text-zinc-400 text-xs font-bold mb-3 flex justify-between items-center">
                                <span>Lotus Pre-Allocation (Optional)</span>
                                <div className="flex gap-2">
                                    <span onClick={() => setAllocationMode('auto')} className={`cursor-pointer px-2 py-0.5 rounded ${allocationMode === 'auto' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'text-zinc-500'}`}>Auto</span>
                                    <span onClick={() => setAllocationMode('manual')} className={`cursor-pointer px-2 py-0.5 rounded ${allocationMode === 'manual' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500'}`}>Manual</span>
                                </div>
                            </label>
                            
                            <div className="flex bg-zinc-950/50 border border-zinc-800 rounded-lg overflow-hidden mb-3">
                                <input type="text" value={amount} onChange={handleAmountChange} placeholder="Enter Amount" className="w-full bg-transparent p-3 text-sm font-mono text-white outline-none" />
                            </div>

                            {allocationMode === 'auto' ? (
                                <div className="text-[11px] text-zinc-500 leading-relaxed">
                                    Funds deposited to the address below will be auto-allocated across venues for optimal liquidity.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {venues.map(v => (
                                        <div key={v.id} className="flex justify-between items-center text-xs">
                                            <span className="text-zinc-400">{v.name}</span>
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
                        <div className="flex flex-col items-center mb-6">
                            <div className="p-1 rounded-2xl bg-gradient-to-br from-blue-400 via-white to-orange-400 w-48 h-48 mb-3 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                <div className="w-full h-full bg-white rounded-xl flex items-center justify-center">
                                    <QrCode className="w-32 h-32 text-black" strokeWidth={1} />
                                </div>
                            </div>
                            <div className="text-zinc-400 text-xs flex items-center gap-1.5 font-medium">
                                Minimum <span className="text-white font-bold">$10 USD</span> <Info className="w-3.5 h-3.5" />
                            </div>
                        </div>

                        {/* Address Field */}
                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-zinc-400 text-xs font-semibold flex items-center gap-1">Address <Info className="w-3.5 h-3.5" /></span>
                                <span 
                                    onClick={() => setShowInfo(!showInfo)} 
                                    className="text-zinc-400 text-xs font-semibold flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors"
                                >
                                    Info <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showInfo ? 'rotate-180' : ''}`} />
                                </span>
                            </div>
                            <div className="flex items-center justify-between bg-[#27272a]/30 border border-zinc-800 rounded-xl p-3.5 hover:border-zinc-700 transition-colors">
                                <span className="text-zinc-300 font-mono text-sm tracking-wide">6YwxaaV...RxdzXrpn</span>
                                <button onClick={copyAddress} className="text-zinc-500 hover:text-white transition-colors">
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Info Footer */}
                        {showInfo && (
                            <div className="bg-[#1e1e20] border border-zinc-800 rounded-xl p-4 space-y-2 mb-4 animate-in slide-in-from-top-2 fade-in duration-200">
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-zinc-400">Processing time:</span>
                                    <span className="text-white font-bold">&lt; 30 Seconds</span>
                                </div>
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-zinc-400">Price impact and slippage:</span>
                                    <span className="text-white font-bold">0.10%-1%</span>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 text-xs font-semibold">
                            <span className="text-[#b181ff] cursor-pointer hover:underline">FAQ</span>
                            <span className="text-[#b181ff] cursor-pointer hover:underline">Terms</span>
                        </div>
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-white text-lg font-bold">Withdraw</h2>
                            <button className="text-zinc-500 hover:text-zinc-300"><X className="w-5 h-5"/></button>
                        </div>
                        
                        {/* Address */}
                        <div className="mb-6">
                            <label className="text-zinc-400 text-xs font-semibold mb-2 block">Recipient address</label>
                            <input 
                                type="text"
                                value={destinationAddress}
                                onChange={(e) => setDestinationAddress(e.target.value)}
                                placeholder="0x..."
                                className="w-full bg-[#27272a]/50 border border-zinc-800/80 hover:bg-[#27272a] rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                            />
                        </div>

                        {/* Amount */}
                        <div className="mb-5">
                            <label className="text-zinc-400 text-xs font-semibold mb-2 block">Amount</label>
                            <div className="w-full bg-[#27272a]/50 border border-zinc-800/80 hover:bg-[#27272a] rounded-xl px-4 py-3.5 flex items-center gap-3 focus-within:border-zinc-600 focus-within:bg-[#27272a] transition-colors">
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
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div>
                                <label className="text-zinc-400 text-xs font-semibold mb-2 block">Receive token</label>
                                <div className="bg-[#27272a]/50 hover:bg-[#27272a] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-colors">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-inner">$</div>
                                        <span className="text-zinc-200 text-sm font-bold">USDC</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                                </div>
                            </div>
                            <div>
                                <label className="text-zinc-400 text-xs font-semibold mb-2 block">Receive chain</label>
                                <div className="bg-[#27272a]/50 hover:bg-[#27272a] border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-colors">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0">P</div>
                                        <span className="text-zinc-200 text-sm font-bold">Polygon</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                                </div>
                            </div>
                        </div>

                        {/* Lotus specific withdrawals */}
                        <div className="mb-6 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
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
                                            <div className="font-bold mb-1">{v.name}</div>
                                            <div className="text-[10px] font-mono">${v.balance}</div>
                                        </div>
                                    ))}
                                </div>
                             ) : (
                                <div className="space-y-2">
                                    {venues.map(v => (
                                        <div key={v.id} className="flex justify-between items-center bg-zinc-950/50 border border-zinc-800/80 rounded-lg p-2">
                                            <span className="text-xs font-semibold text-zinc-400">{v.name}</span>
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

                        <div className="space-y-3 mb-6 font-semibold">
                            <div className="flex justify-between text-[13px]">
                                <span className="text-zinc-300">You will receive</span>
                                <span className="text-zinc-500">-</span>
                            </div>
                            <div className="flex justify-between text-[13px]">
                                <span className="text-zinc-300">Transaction breakdown</span>
                                <span className="text-zinc-500">-</span>
                            </div>
                        </div>

                        <button className="w-full bg-[#0070f3] hover:bg-[#0060df] text-white font-semibold py-3.5 rounded-xl text-sm transition-colors shadow-lg shadow-blue-900/20">
                            Enter Recipient Address
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

