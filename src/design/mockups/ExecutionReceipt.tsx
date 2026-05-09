import React from 'react';
import { Check } from 'lucide-react';
import { VenueLogo } from '@/components/icons/asset-logo';
import { Card } from './UserInfraMockups';

export const ExecutionReceipt = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Execution Complete</h1>
        <p className="text-sm text-zinc-500 mt-2">Your order was successfully routed and filled.</p>
      </div>

      <Card>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-500">Order ID</span>
            <span className="text-sm font-mono text-zinc-900 dark:text-white">ORD-8921-XQ</span>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Total Filled</p>
              <p className="text-xl font-mono font-medium text-zinc-900 dark:text-white">$10,000 USDC</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Avg Price</p>
              <p className="text-xl font-mono font-medium text-zinc-900 dark:text-white">48.27¢</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Shares Acquired</p>
              <p className="text-xl font-mono font-medium text-zinc-900 dark:text-white">20,716 YES</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Value Saved vs Direct</p>
              <p className="text-xl font-mono font-medium text-emerald-500">+$45.20</p>
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">Execution Breakdown</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"><VenueLogo id="polymarket" label="Polymarket" className="h-4 w-4" />Polymarket (65%)</span>
                <span className="font-mono text-zinc-900 dark:text-white">48.2¢ avg</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Lotus LP (35%)</span>
                <span className="font-mono text-zinc-900 dark:text-white">48.4¢ avg</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
      
      <div className="text-center">
        <button className="text-sm text-lotus-600 dark:text-lotus-400 hover:underline font-medium">
          View in Portfolio
        </button>
      </div>
    </div>
  );
};
