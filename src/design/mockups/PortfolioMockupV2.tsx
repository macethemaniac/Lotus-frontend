import React, { useState } from 'react';
import { 
  Wallet, Gift, Key, ArrowUpRight, ArrowDownRight, 
  Download, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Sparkles, 
  BarChart2, Calendar, ChevronRight, Search, Share
} from 'lucide-react';

export const PortfolioMockupV2: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history' | 'tips'>('positions');

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 font-sans antialiased space-y-6 animate-fade-in relative">
      
      {/* Top Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        
        {/* Left Panel - Portfolio */}
        <div className="rounded-xl border border-zinc-800 bg-[#121214] overflow-hidden flex flex-col">
          <div className="p-5 space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-semibold text-zinc-100">
                <Wallet className="w-4 h-4 text-zinc-400" />
                Portfolio
              </div>
            </div>

            {/* Total Value */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-300 mb-1">Total Portfolio Value</div>
                <div className="text-[32px] leading-none font-bold text-white">$14,758.40</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-300 mb-1">Active Positions</div>
                <div className="text-[32px] leading-none font-bold text-white">$3,057.40</div>
              </div>
            </div>

            <div className="h-px bg-zinc-800/80 w-full" />

            {/* Cash Breakdown */}
            <div className="flex items-end gap-x-6 gap-y-4 flex-wrap">
              <div className="relative">
                <div className="text-[13px] font-semibold text-zinc-300 mb-1">Total Cash</div>
                <div className="text-base font-bold text-white flex items-center gap-2">
                  $11,701.00
                </div>
                <div className="absolute top-1/2 -right-4 -translate-y-1/2 text-zinc-500">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v12a2 2 0 0 0 2 2h10"/><path d="m14 13 4 4-4 4"/><path d="m14 5 4 4-4 4"/></svg>
                </div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-zinc-400 mb-1">Polygon<br/>Cash</div>
                <div className="text-[15px] font-bold text-white">$8,450.25</div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-zinc-400 mb-1">Solana<br/>Cash</div>
                <div className="text-[15px] font-bold text-white">$3,250.75</div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-zinc-400 mb-1">BSC<br/>Cash</div>
                <div className="text-[15px] font-bold text-white">$0.00</div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-zinc-400 mb-1">Base<br/>Cash</div>
                <div className="text-[15px] font-bold text-white">$0.00</div>
              </div>
            </div>
          </div>

          <div className="p-5 mt-auto space-y-4">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
              <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-lotus-500/10 hover:bg-lotus-500/20 border border-lotus-500/30 text-lotus-400 text-sm font-semibold transition-colors">
                <ArrowDownToLine className="w-4 h-4" /> Deposit
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-zinc-300 text-sm font-semibold transition-colors">
                <ArrowUpFromLine className="w-4 h-4" /> Withdraw
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 text-zinc-300 text-sm font-semibold transition-colors">
                <RefreshCw className="w-4 h-4" /> Bridge
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Performance */}
        <div className="rounded-xl border border-zinc-800 bg-[#121214] p-5 flex flex-col relative overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div className="flex items-center gap-2.5 font-semibold text-zinc-100">
              <BarChart2 className="w-4 h-4 text-zinc-400" />
              Performance
            </div>
            <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50">
              {['1D', '7D', '1M', 'All'].map((v, i) => (
                <button key={v} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${i === 3 ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-6 relative z-10">
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Realized PNL</div>
              <div className="text-lg font-bold text-[#22c55e]">+881,191.68</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Unrealized PNL</div>
              <div className="text-lg font-bold text-[#22c55e]">+$579.80</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Total ROI</div>
              <div className="text-lg font-bold text-[#22c55e]">+68.42%</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-300 mb-1.5">Total Volume</div>
              <div className="text-lg font-bold text-white">$3,456,132.48</div>
            </div>
          </div>
          
          {/* Calendar Row */}
          <div className="flex items-center justify-between mb-4 relative z-10">
             <div className="flex items-center gap-3">
               <Calendar className="w-5 h-5 text-zinc-500" />
               <div>
                 <div className="text-sm font-bold text-white">PNL Calendar</div>
                 <div className="text-[11px] text-zinc-500">View your monthly breakdown</div>
               </div>
             </div>
             <button className="w-6 h-6 rounded-md bg-zinc-800/80 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
               <ChevronRight className="w-4 h-4" />
             </button>
          </div>

          <div className="h-px bg-zinc-800/50 w-full mb-6 relative z-10" />

          {/* Chart Area */}
          <div className="flex-1 relative min-h-[220px]">
             {/* Chart Y Axis labels */}
             <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-zinc-600 font-mono text-right z-10">
                <span>$100...</span>
                <span>$50...</span>
                <span>$0</span>
             </div>
             {/* Chart Grid Lines */}
             <div className="absolute inset-x-0 top-2 border-b border-dashed border-zinc-800/60 z-0 mr-8" />
             <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-zinc-800/60 z-0 mr-8" />
             <div className="absolute inset-x-0 bottom-2 border-b border-dashed border-zinc-800/60 z-0 mr-8" />
             
             {/* Chart Graphic */}
             <svg className="absolute inset-0 w-[calc(100%-2rem)] h-full z-10" viewBox="0 0 800 200" preserveAspectRatio="none">
                 <defs>
                     <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                         <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                     </linearGradient>
                 </defs>
                 <path d="M0 160 Q 50 150, 100 130 T 250 120 T 400 90 T 550 70 T 700 50 T 800 40 L 800 200 L 0 200 Z" fill="url(#pnlGradient)" />
                 <path d="M0 160 Q 50 150, 100 130 T 250 120 T 400 90 T 550 70 T 700 50 T 800 40" fill="none" stroke="#22c55e" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
             </svg>

             {/* Hover indicator */}
             <div className="absolute top-0 bottom-4 left-[20%] w-px border-l border-dashed border-zinc-500 z-20">
                <div className="w-2.5 h-2.5 bg-[#22c55e] rounded-full absolute top-[62%] -left-[5px] shadow-[0_0_10px_#22c55e]"></div>
                <div className="absolute top-[62%] left-4 bg-[#18181b] border border-zinc-700/80 rounded-lg p-3 w-[160px] shadow-xl">
                   <div className="text-zinc-200 text-xs font-semibold mb-2">Feb 28</div>
                   <div className="flex justify-between items-center bg-black/40 rounded px-2 py-1.5">
                     <div className="flex items-center gap-1.5 align-middle">
                       <span className="w-3 h-1 bg-[#22c55e] rounded-full"></span>
                       <span className="text-[10px] font-bold text-zinc-400">PNL</span>
                     </div>
                     <span className="text-[11px] font-mono text-zinc-300">+$163096.35</span>
                   </div>
                </div>
             </div>
          </div>
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
        </div>
        {!activeTab && (
           <div className="p-8 text-center text-zinc-500">No data available</div>
        )}
      </div>

    </div>
  );
};

