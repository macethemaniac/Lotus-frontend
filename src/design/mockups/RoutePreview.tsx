import React from 'react';
import { ShieldCheck, Server, Network, Zap } from 'lucide-react';
import { Card } from './UserInfraMockups';

export const RoutePreview = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Smart Route Preview</h1>
        <p className="text-sm text-zinc-500 mt-2">Lotus has found the optimal execution path for your order.</p>
      </div>

      <Card className="border-lotus-500/30 shadow-[0_0_30px_-10px_rgba(204,255,0,0.1)]">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-zinc-500 mb-1">Buying YES</p>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Will the Democratic Nominee win?</h2>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-500 mb-1">Total Cost</p>
              <h2 className="text-xl font-mono font-bold text-zinc-900 dark:text-white">$10,000 USDC</h2>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
              <Network className="w-4 h-4 text-lotus-500" /> Execution Path
            </h3>
            
            <div className="space-y-3">
              {/* Route 1 */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold">PM</div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Polymarket Public Book</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Clearing at 48.2¢</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-zinc-900 dark:text-white">$6,500</p>
                  <p className="text-xs text-zinc-500 mt-0.5">65% of order</p>
                </div>
              </div>

              {/* Route 2 */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400"><Server className="w-4 h-4" /></div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Lotus Private LP (Wintermute)</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Firm quote at 48.4¢</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-zinc-900 dark:text-white">$3,500</p>
                  <p className="text-xs text-zinc-500 mt-0.5">35% of order</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Resolution Risk: Safe</h4>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Both execution venues have equivalent oracle and settlement rules. No divergence risk detected for this split fill.</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Avg Execution Price</p>
              <p className="text-lg font-mono font-medium text-zinc-900 dark:text-white">48.27¢</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Est. Shares</p>
              <p className="text-lg font-mono font-medium text-zinc-900 dark:text-white">20,716</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Slippage Saved</p>
              <p className="text-lg font-mono font-medium text-emerald-500">~$45.20</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <button className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium rounded-xl transition-colors">
          Cancel
        </button>
        <button className="flex-[2] py-4 bg-lotus-500 hover:bg-lotus-400 text-black font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
          <Zap className="w-5 h-5" /> Execute Smart Route
        </button>
      </div>
    </div>
  );
};
