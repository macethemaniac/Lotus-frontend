import React from 'react';

export const TypographySection: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      <div className="space-y-8">
        <div className="border-b border-zinc-800 pb-8">
          <span className="inline-block px-2 py-1 bg-zinc-900 text-zinc-400 text-xs font-mono rounded mb-4">
            Primary Font
          </span>
          <h3 className="text-4xl font-bold text-white mb-2 font-sans">Inter</h3>
          <p className="text-zinc-400 leading-relaxed">
            Inter is a variable font family carefully crafted & designed for computer screens.
            Lotus uses Inter for all UI elements, headings, and body text to ensure maximum readability and a clean aesthetic.
          </p>
        </div>
        
        <div className="space-y-6">
           <div className="flex items-baseline justify-between border-b border-zinc-900 pb-4">
            <span className="text-5xl font-bold text-white">Aa</span>
            <span className="font-mono text-zinc-500">Bold / 700</span>
          </div>
           <div className="flex items-baseline justify-between border-b border-zinc-900 pb-4">
            <span className="text-5xl font-medium text-white">Aa</span>
            <span className="font-mono text-zinc-500">Medium / 500</span>
          </div>
           <div className="flex items-baseline justify-between border-b border-zinc-900 pb-4">
            <span className="text-5xl font-normal text-white">Aa</span>
            <span className="font-mono text-zinc-500">Regular / 400</span>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="border-b border-zinc-800 pb-8">
          <span className="inline-block px-2 py-1 bg-zinc-900 text-zinc-400 text-xs font-mono rounded mb-4">
            Monospace / Data
          </span>
          <h3 className="text-4xl font-normal text-white mb-2 font-mono">JetBrains Mono</h3>
          <p className="text-zinc-400 leading-relaxed">
            A typeface for developers and data. We use JetBrains Mono for all financial data, pricing, probability percentages, and code snippets within the terminal.
          </p>
        </div>

        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800 font-mono text-sm leading-7">
          <p className="text-zinc-500">{'// Example Usage'}</p>
          <p className="text-lotus-400">const <span className="text-white">prediction</span> = <span className="text-emerald-400">98.4%</span>;</p>
          <p className="text-lotus-400">const <span className="text-white">volume</span> = <span className="text-amber-400">$24,500,000</span>;</p>
          <p className="text-zinc-300 mt-2">
            The quick brown fox jumps over the lazy dog.
            <br />
            1234567890 !@#$%^&*()
          </p>
        </div>
      </div>
    </div>
  );
};