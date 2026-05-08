import React from 'react';

export const DesignTokens: React.FC = () => {
  return (
    <div className="space-y-16 animate-fade-in">
        <div>
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-4">Design Tokens</h2>
            <p className="text-zinc-600 dark:text-zinc-400 max-w-3xl leading-relaxed">
                The atomic units of our design system. We use a strict scale for spacing, rounding, and depth to maintain rhythm and consistency across the Lotus terminal.
            </p>
        </div>

        {/* Spacing Section */}
        <section className="space-y-8">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Spacing</h3>
                <p className="text-sm text-zinc-500 mt-1">Based on a 4px grid. Used for padding, margin, and layout gaps.</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
                {[
                    { name: '0.5', px: '2px', cls: 'w-0.5' },
                    { name: '1', px: '4px', cls: 'w-1' },
                    { name: '1.5', px: '6px', cls: 'w-1.5' },
                    { name: '2', px: '8px', cls: 'w-2' },
                    { name: '3', px: '12px', cls: 'w-3' },
                    { name: '4', px: '16px', cls: 'w-4' },
                    { name: '6', px: '24px', cls: 'w-6' },
                    { name: '8', px: '32px', cls: 'w-8' },
                    { name: '12', px: '48px', cls: 'w-12' },
                    { name: '16', px: '64px', cls: 'w-16' },
                ].map((s) => (
                    <div key={s.name} className="flex flex-col gap-3 group">
                        <div className="h-24 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded flex items-center justify-center relative overflow-hidden">
                             <div className={`${s.cls} h-full bg-lotus-500/80 shadow-[0_0_15px_rgba(204,255,0,0.2)]`}></div>
                        </div>
                        <div className="flex justify-between items-baseline px-1">
                            <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono">{s.name}</span>
                            <span className="text-xs text-zinc-500 font-mono">{s.px}</span>
                        </div>
                    </div>
                ))}
            </div>
        </section>

        {/* Radius Section */}
        <section className="space-y-8">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Border Radius</h3>
                <p className="text-sm text-zinc-500 mt-1">Rounding rules for containers and interactive elements.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
                {[
                    { name: 'none', px: '0px', cls: 'rounded-none' },
                    { name: 'sm', px: '2px', cls: 'rounded-sm' },
                    { name: 'md', px: '6px', cls: 'rounded-md' }, 
                    { name: 'lg', px: '8px', cls: 'rounded-lg' },
                    { name: 'xl', px: '12px', cls: 'rounded-xl' },
                    { name: 'full', px: '9999px', cls: 'rounded-full' },
                ].map((r) => (
                    <div key={r.name} className="flex flex-col gap-4">
                        <div className={`w-full aspect-square border border-lotus-500/50 bg-lotus-500/5 ${r.cls} flex items-center justify-center relative`}>
                            <div className={`absolute top-0 left-0 w-3 h-3 border-t border-l border-lotus-500 ${r.name === 'full' ? 'hidden' : ''} ${r.cls}`}></div>
                        </div>
                        <div className="text-center">
                            <div className="text-sm font-bold text-zinc-900 dark:text-white font-mono">{r.name}</div>
                            <div className="text-xs text-zinc-500 font-mono mt-1">{r.px}</div>
                        </div>
                    </div>
                ))}
            </div>
        </section>

        {/* Shadows Section */}
        <section className="space-y-8 pb-12">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Depth & Shadows</h3>
                <p className="text-sm text-zinc-500 mt-1">Elevation levels for hierarchy. Adapted for light and dark modes.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {[
                    { name: 'sm', cls: 'shadow-sm' },
                    { name: 'md', cls: 'shadow-md' },
                    { name: 'lg', cls: 'shadow-lg' },
                    { name: 'xl', cls: 'shadow-xl' },
                    { name: '2xl', cls: 'shadow-2xl' },
                ].map((s) => (
                    <div key={s.name} className="group">
                        <div className={`h-32 w-full bg-white dark:bg-zinc-900 rounded-lg ${s.cls} flex items-center justify-center border border-zinc-100 dark:border-zinc-800 transition-transform group-hover:-translate-y-1`}>
                            <span className="text-xs text-zinc-400 font-mono opacity-50">Content</span>
                        </div>
                        <div className="mt-4 text-center">
                            <div className="text-sm font-bold text-zinc-900 dark:text-white font-mono">shadow-{s.name}</div>
                        </div>
                    </div>
                ))}
                 {/* Neon Glow Special */}
                 <div className="group">
                        <div className={`h-32 w-full bg-black rounded-lg shadow-[0_0_20px_rgba(204,255,0,0.15)] flex items-center justify-center border border-lotus-500/20 transition-transform group-hover:-translate-y-1`}>
                            <span className="text-xs text-lotus-500 font-mono">Neon Glow</span>
                        </div>
                        <div className="mt-4 text-center">
                            <div className="text-sm font-bold text-zinc-900 dark:text-white font-mono">shadow-glow</div>
                        </div>
                    </div>
            </div>
        </section>
    </div>
  );
};
