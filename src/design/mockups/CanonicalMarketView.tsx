import React from 'react';
import { ChevronRight, Network, Check, Lock, FileWarning } from 'lucide-react';
import { Badge, Card, CardHeader } from './UserInfraMockups';

export const CanonicalMarketView = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
        <span className="hover:text-zinc-900 dark:hover:text-white cursor-pointer">Markets</span>
        <ChevronRight className="w-4 h-4" />
        <span className="hover:text-zinc-900 dark:hover:text-white cursor-pointer">Politics</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-zinc-900 dark:text-zinc-300">US Election 2028</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Will the Democratic Nominee win the 2028 US Presidential Election?</h1>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Badge variant="lotus"><Network className="w-3 h-3 mr-1" /> Lotus Canonical Event</Badge>
            <span className="text-sm text-zinc-500 font-mono">Aggregating 3 Venues</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium mt-6">
        <span className="text-zinc-500 dark:text-zinc-400">Route: <span className="text-zinc-900 dark:text-zinc-100">Pair</span></span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className="text-zinc-900 dark:text-zinc-100">2 venues selected</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className="text-red-600 dark:text-red-400">1 blocked</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className="text-zinc-500 dark:text-zinc-400">Est. savings <span className="text-[#99cc00]">~$42.50</span></span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className="text-zinc-500 dark:text-zinc-400">Fallback: <span className="text-zinc-900 dark:text-zinc-100">Polymarket</span></span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader 
              title="Venue Coverage & Routeability" 
              subtitle="Lotus compares venue markets, checks rule compatibility, and selects only safe executable routes." 
            />
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#ccff00]/10 text-[#99cc00] border border-[#ccff00]/20">2 Executable</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-500 border border-red-500/20">1 Blocked</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">Pair Route</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">Fallback Available</span>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {[
                { venue: 'Polymarket', title: 'Democratic Nominee wins 2028?', price: '48.2¢', vol: '$12.4M', status: 'Equivalent', risk: 'Safe', reason: 'Exact-safe shared outcome' },
                { venue: 'Kalshi', title: 'Will a Democrat win the 2028 Presidential Election?', price: '48.5¢', vol: '$8.1M', status: 'Equivalent', risk: 'Safe', reason: 'Semantically compatible wording' },
                { venue: 'SX Bet', title: 'Democrat President 2028', price: '49.1¢', vol: '$1.2M', status: 'Correlated', risk: 'Blocked', reason: 'Resolution Risk Block — non-standard dispute window' },
              ].map((v, i) => (
                <div key={i} className={`p-5 ${v.status === 'Correlated' ? 'opacity-60 bg-zinc-50 dark:bg-zinc-900/30' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{v.venue}</Badge>
                        {v.status === 'Equivalent' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium text-[#99cc00] bg-[#ccff00]/10 border border-[#ccff00]/20"><Check className="w-3 h-3 mr-1" /> Executable</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] font-medium text-red-500 bg-red-500/10 border border-red-500/20"><Lock className="w-3 h-3 mr-1" /> Blocked for Routing</span>
                        )}
                      </div>
                      <h4 className="text-base font-medium text-zinc-900 dark:text-zinc-100">{v.title}</h4>
                      {v.status === 'Equivalent' && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{v.reason}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono text-zinc-500">Best Ask</span>
                      <p className="text-lg font-medium text-zinc-900 dark:text-white">{v.price}</p>
                    </div>
                  </div>
                  
                  {v.status === 'Correlated' && (
                    <div className="mt-3 p-2.5 bg-red-500/5 border border-red-500/10 rounded-lg flex items-start gap-2">
                      <FileWarning className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">{v.reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-zinc-900 text-white border-zinc-800">
            <div className="p-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">Buy YES</h3>
              <div className="text-4xl font-bold mb-6">48.3¢ <span className="text-sm font-normal text-zinc-500">Avg</span></div>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Amount (USDC)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                    <input type="text" value="10,000" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-4 py-3 text-white focus:outline-none focus:border-lotus-500" readOnly />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 mb-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Est. Shares</span>
                  <span className="font-mono">20,703</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Route</span>
                  <span className="font-medium text-zinc-100">Pair · 2 venues</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Fallback</span>
                  <span className="font-medium text-zinc-100">Polymarket only</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-zinc-700/50">
                  <span className="text-zinc-400">Slippage Saved</span>
                  <span className="text-[#99cc00] font-mono font-medium">~$42.50</span>
                </div>
              </div>

              <button className="w-full py-4 bg-[#ccff00]/90 hover:bg-[#ccff00] text-zinc-900 font-bold rounded-xl transition-colors text-lg shadow-[0_0_15px_rgba(204,255,0,0.1)]">
                Preview Route
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
