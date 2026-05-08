import React, { useState } from 'react';
import { ColorDefinition } from '../types';
import { CopyIcon, CheckIcon } from './Icons';

const ColorCard: React.FC<{ color: ColorDefinition }> = ({ color }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(color.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <div 
        className="h-32 w-full rounded-t-lg border border-zinc-800 border-b-0 transition-all duration-300"
        style={{ backgroundColor: color.hex }}
      />
      <div className="p-4 bg-zinc-900 rounded-b-lg border border-zinc-800 flex justify-between items-start group-hover:bg-zinc-850 transition-colors">
        <div>
          <h4 className="font-bold text-white mb-1">{color.name}</h4>
          <p className="font-mono text-xs text-zinc-500 mb-1">{color.hex}</p>
          <p className="text-xs text-zinc-400">{color.variable}</p>
        </div>
        <button 
          onClick={copyToClipboard}
          className="p-2 text-zinc-500 hover:text-white transition-colors rounded-md hover:bg-zinc-700"
          title="Copy Hex"
        >
          {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
};

export const ColorPalette: React.FC = () => {
  const primaryColors: ColorDefinition[] = [
    { name: 'Lotus Lime', hex: '#CCFF00', variable: 'lotus-500' },
    { name: 'Void Black', hex: '#000000', variable: 'black' },
    { name: 'Terminal Gray', hex: '#18181b', variable: 'zinc-900' },
    { name: 'Text White', hex: '#FFFFFF', variable: 'white' },
  ];

  const secondaryColors: ColorDefinition[] = [
    { name: 'Buy Green', hex: '#10B981', variable: 'emerald-500' },
    { name: 'Sell Red', hex: '#EF4444', variable: 'red-500' },
    { name: 'Warning Orange', hex: '#F59E0B', variable: 'amber-500' },
    { name: 'Link Blue', hex: '#3B82F6', variable: 'blue-500' },
  ];

  return (
    <div className="space-y-12">
      <div>
        <h3 className="text-xl font-medium text-white mb-6">Brand Palette</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {primaryColors.map((c) => <ColorCard key={c.name} color={c} />)}
        </div>
      </div>
      <div>
        <h3 className="text-xl font-medium text-white mb-6">Functional Signals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {secondaryColors.map((c) => <ColorCard key={c.name} color={c} />)}
        </div>
      </div>
    </div>
  );
};