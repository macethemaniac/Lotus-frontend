import React, { useState } from 'react';
import { Search, ChevronDown, Trophy, Medal, Crown, ArrowRight, Settings2, LayoutGrid, List } from 'lucide-react';

export const InfraLeaderboard = () => {
    const topTraders = [
        { rank: 1, name: 'reachingthesky', pnl: '+$3.7M', winRate: '27.2%', positions: 8, trades: '13.8M', volume: '$13.8M', avatarInitial: 'R', color: 'bg-red-500' },
        { rank: 2, name: 'majorexploiter', pnl: '+$3.7M', winRate: '39.0%', positions: 0, trades: '3', volume: '$9.4M', avatarInitial: 'M', color: 'bg-pink-600' },
        { rank: 3, name: 'SeriouslySirius', pnl: '+$3.6M', winRate: '1.9%', positions: 200, trades: '6.3K', volume: '$192.6M', avatarInitial: 'S', color: 'bg-orange-500' }
    ];

    const listTraders = [
        { rank: 4, name: 'sovereign2013', winRate: '0.9%', score: '42.1%', volume: '$399.3M', pnl: '+$3.6M', trades: '40.8K', positions: 1, initial: 'S', color: 'bg-red-500' },
        { rank: 5, name: 'DrPufferfish', winRate: '1.4%', score: '46.3%', volume: '$248.3M', pnl: '+$3.6M', trades: '1.5K', positions: 200, initial: 'D', color: 'bg-orange-600' },
        { rank: 6, name: 'GCottrell93', winRate: '19.0%', score: '56.8%', volume: '$18.0M', pnl: '+$3.4M', trades: '42', positions: 9, initial: 'G', color: 'bg-red-600' },
        { rank: 8, name: 'LaBradfordSmith22', winRate: '8.3%', score: '53.7%', volume: '$40.9M', pnl: '+$3.4M', trades: '1.7K', positions: 200, initial: 'L', color: 'bg-red-700' },
        { rank: 9, name: 'fengdublying', isTop: true, winRate: '18.1%', score: '51.6%', volume: '$17.3M', pnl: '+$3.1M', trades: '121', positions: 25, initial: 'f', color: 'bg-red-500' },
        { rank: 10, name: 'RandomGenius-190', winRate: '35.4%', score: '57.9%', volume: '$8.8M', pnl: '+$3.1M', trades: '3', positions: 0, initial: 'R', color: 'bg-pink-500' },
        { rank: 11, name: 'Michie', winRate: '36.6%', score: '58.9%', volume: '$8.5M', pnl: '+$3.1M', trades: '13', positions: 1, initial: 'M', color: 'bg-red-500' },
        { rank: 12, name: 'Countryside', winRate: '1.5%', score: '50.5%', volume: '$204.4M', pnl: '+$3.0M', trades: '948', positions: 200, initial: 'C', color: 'bg-orange-500' },
        { rank: 13, name: 'ImJustKen', isTop: true, winRate: '0.6%', score: '43.2%', volume: '$473.8M', pnl: '+$2.9M', trades: '9.6K', positions: 200, initial: 'I', color: 'bg-zinc-500' },
        { rank: 14, name: 'gfjoigfsjoigsjoi', winRate: '12.8%', score: '52.6%', volume: '$22.9M', pnl: '+$2.9M', trades: '22', positions: 0, initial: 'g', color: 'bg-red-500' },
        { rank: 15, name: 'primm', winRate: '8.2%', score: '48.4%', volume: '$32.5M', pnl: '+$2.6M', trades: '563', positions: 200, initial: 'P', color: 'bg-red-500' },
        { rank: 16, name: 'S-Works', winRate: '1.4%', score: '41.1%', volume: '$182.2M', pnl: '+$2.6M', trades: '7.4K', positions: 11, initial: 'S', color: 'bg-pink-600' }
    ];

    const [activePeriod, setActivePeriod] = useState('All time');
    const [viewMode, setViewMode] = useState('list');

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <div className="max-w-7xl mx-auto px-4 py-8">
                
                {/* Top Nav */}
                <div className="flex items-center gap-6 mb-6 overflow-x-auto no-scrollbar">
                    <button className="text-white font-semibold whitespace-nowrap border-b-2 border-white pb-2">Leaderboards</button>
                    <button className="text-zinc-500 hover:text-zinc-300 font-medium whitespace-nowrap pb-2">Track Traders</button>
                    <button className="text-zinc-500 hover:text-zinc-300 font-medium whitespace-nowrap pb-2">Smart Money</button>
                </div>

                {/* Categories */}
                <div className="flex items-center gap-6 mb-8 overflow-x-auto no-scrollbar pb-2 text-sm">
                    <button className="text-white font-medium whitespace-nowrap">All Categories</button>
                    {['Politics', 'Sports', 'Crypto', 'Culture', 'Mentions', 'Weather', 'Economics', 'Tech', 'Finance'].map(cat => (
                        <button key={cat} className="text-zinc-500 hover:text-zinc-300 font-medium whitespace-nowrap">{cat}</button>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center justify-between mb-12 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#121214] border border-zinc-800 rounded-lg px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:border-zinc-700 transition-colors">
                            <span className="text-sm text-zinc-400">Sort by <span className="text-white font-medium">PnL</span></span>
                            <ChevronDown className="w-4 h-4 text-zinc-500" />
                        </div>
                        <button className="bg-[#121214] border border-zinc-800 rounded-lg p-2 hover:border-zinc-700 transition-colors">
                            <Settings2 className="w-4 h-4 text-zinc-400" />
                        </button>
                        <div className="flex items-center bg-[#121214] border border-zinc-800 rounded-lg p-1">
                            {['All time', 'Today', 'Weekly', 'Monthly'].map(period => (
                                <button 
                                    key={period}
                                    onClick={() => setActivePeriod(period)}
                                    className={`px-3 py-1 text-sm rounded ${activePeriod === period ? 'bg-red-500/[0.15] text-red-500 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
                                >
                                    {period}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="relative">
                        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="Search traders or wallets" 
                            className="bg-[#121214] border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-zinc-700 w-64"
                        />
                    </div>
                </div>

                {/* Top 3 Podium */}
                <div className="flex flex-col md:flex-row items-end justify-center gap-4 md:gap-6 mb-16 px-4">
                    {/* Rank 2 */}
                    <div className="w-full md:w-72 bg-[#121214] border border-zinc-800/80 rounded-2xl p-5 relative mt-8 md:mt-0 order-2 md:order-1">
                        <div className="absolute -top-3 -left-3 w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold text-zinc-400 border border-zinc-700">2</div>
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full ${topTraders[1].color} flex items-center justify-center text-white font-bold text-lg`}>
                                    {topTraders[1].avatarInitial}
                                </div>
                                <div>
                                    <h3 className="font-bold text-base">{topTraders[1].name}</h3>
                                    <span className="text-xs text-[#00ff88] font-mono">{topTraders[1].winRate} WR</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-0.5">PNL</p>
                                <p className="text-[#00ff88] font-mono font-bold text-lg">{topTraders[1].pnl}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[1].positions}</p>
                                <p className="text-[10px] text-zinc-500">Positions</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[1].trades}</p>
                                <p className="text-[10px] text-zinc-500">Trades</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[1].volume}</p>
                                <p className="text-[10px] text-zinc-500">Volume</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[1].winRate}</p>
                                <p className="text-[10px] text-zinc-500">Win Rate</p>
                            </div>
                        </div>
                        <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
                            Copy
                        </button>
                    </div>

                    {/* Rank 1 */}
                    <div className="w-full md:w-80 bg-gradient-to-b from-[#1a1a1f] to-[#121214] border border-lotus-500/30 rounded-2xl p-6 relative transform md:-translate-y-4 shadow-[0_0_30px_rgba(204,255,0,0.05)] order-1 md:order-2">
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-lotus-500 rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(204,255,0,0.4)]">
                            <Crown className="w-4 h-4 z-10 font-bold" />
                        </div>
                        <div className="flex justify-between items-start mb-6 pt-2">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full ${topTraders[0].color} flex items-center justify-center text-white font-bold text-xl ring-2 ring-lotus-500/50 ring-offset-2 ring-offset-[#121214]`}>
                                    {topTraders[0].avatarInitial}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-white">{topTraders[0].name}</h3>
                                    <span className="text-xs text-[#00ff88] font-mono">{topTraders[0].winRate} WR</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-lotus-500/80 uppercase font-bold tracking-wider mb-0.5">PNL</p>
                                <p className="text-[#00ff88] font-mono font-bold text-xl">{topTraders[0].pnl}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            <div className="text-center">
                                <p className="text-sm font-mono font-bold text-white">{topTraders[0].positions}</p>
                                <p className="text-[10px] text-zinc-500">Positions</p>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-mono font-bold text-white">{topTraders[0].trades}</p>
                                <p className="text-[10px] text-zinc-500">Trades</p>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-mono font-bold text-white">{topTraders[0].volume}</p>
                                <p className="text-[10px] text-zinc-500">Volume</p>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-mono font-bold text-white">{topTraders[0].winRate}</p>
                                <p className="text-[10px] text-zinc-500">Win Rate</p>
                            </div>
                        </div>
                        <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-colors border border-zinc-700">
                            Copy
                        </button>
                    </div>

                    {/* Rank 3 */}
                    <div className="w-full md:w-72 bg-[#121214] border border-zinc-800/80 rounded-2xl p-5 relative mt-8 md:mt-0 order-3 md:order-3">
                        <div className="absolute -top-3 -right-3 w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold text-zinc-400 border border-zinc-700">3</div>
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full ${topTraders[2].color} flex items-center justify-center text-white font-bold text-lg`}>
                                    {topTraders[2].avatarInitial}
                                </div>
                                <div>
                                    <h3 className="font-bold text-base">{topTraders[2].name}</h3>
                                    <span className="text-xs text-[#00ff88] font-mono">{topTraders[2].winRate} WR</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-0.5">PNL</p>
                                <p className="text-[#00ff88] font-mono font-bold text-lg">{topTraders[2].pnl}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[2].positions}</p>
                                <p className="text-[10px] text-zinc-500">Positions</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[2].trades}</p>
                                <p className="text-[10px] text-zinc-500">Trades</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[2].volume}</p>
                                <p className="text-[10px] text-zinc-500">Volume</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-mono font-bold text-white">{topTraders[2].winRate}</p>
                                <p className="text-[10px] text-zinc-500">Win Rate</p>
                            </div>
                        </div>
                        <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
                            Copy
                        </button>
                    </div>
                </div>

                {/* List Header Options */}
                <div className="flex justify-between items-center mb-4 px-4 py-2">
                    <h3 className="text-xl font-bold text-white tracking-tight">Traders</h3>
                    <div className="flex items-center gap-2 bg-[#121214] border border-zinc-800 p-1 rounded-lg">
                        <button className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'}`} onClick={() => setViewMode('list')}>
                            <List className="w-4 h-4 text-zinc-400" />
                        </button>
                        <button className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'}`} onClick={() => setViewMode('grid')}>
                            <LayoutGrid className="w-4 h-4 text-zinc-400" />
                        </button>
                    </div>
                </div>

                {/* List / Table */}
                {viewMode === 'list' ? (
                    <div className="bg-[#121214] border border-zinc-800/80 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="border-b border-zinc-800/80 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                                        <th className="p-4 pl-6 w-16 text-center">Rank</th>
                                        <th className="p-4">Trader</th>
                                        <th className="p-4 text-right">Win Rate</th>
                                        <th className="p-4 text-right">Score</th>
                                        <th className="p-4 text-right">Volume</th>
                                        <th className="p-4 text-right">PnL <ChevronDown className="inline w-3 h-3 text-red-500 mb-0.5 ml-1" /></th>
                                        <th className="p-4 text-right">Trades</th>
                                        <th className="p-4 text-right">Positions</th>
                                        <th className="p-4 pr-6"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {listTraders.map((trader) => (
                                        <tr key={trader.rank} className="group hover:bg-zinc-900/30 transition-colors">
                                            <td className="p-4 pl-6 text-center font-mono text-zinc-500 text-xs">{trader.rank}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-6 h-6 rounded-full ${trader.color} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                                                        {trader.initial}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors">{trader.name}</span>
                                                        {trader.isTop && <Crown className="w-3.5 h-3.5 text-zinc-500" />}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-mono text-sm text-[#00ff88]">{trader.winRate}</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-mono text-sm text-zinc-300">{trader.score}</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-mono text-sm text-zinc-300">{trader.volume}</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-mono text-sm text-[#00ff88] font-medium">{trader.pnl}</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-mono text-sm text-zinc-300">{trader.trades}</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-mono text-sm text-zinc-300">{trader.positions}</span>
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold tracking-wider uppercase px-4 py-1.5 rounded-lg border border-zinc-700 transition-colors">
                                                    Copy
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {listTraders.map((trader) => (
                            <div key={trader.rank} className="bg-[#121214] border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full ${trader.color} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                                            {trader.initial}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-sm text-zinc-200">{trader.name}</span>
                                                {trader.isTop && <Crown className="w-3.5 h-3.5 text-zinc-500" />}
                                            </div>
                                            <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                                                <span>Rank {trader.rank}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-0.5">PNL</p>
                                        <p className="text-[#00ff88] font-mono font-bold text-sm">{trader.pnl}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-5 p-3 rounded-lg bg-zinc-900/50">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-500">Win Rate</span>
                                        <span className="text-xs font-mono text-[#00ff88]">{trader.winRate}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-500">Score</span>
                                        <span className="text-xs font-mono text-zinc-300">{trader.score}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-500">Volume</span>
                                        <span className="text-xs font-mono text-zinc-300">{trader.volume}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-zinc-500">Trades</span>
                                        <span className="text-xs font-mono text-zinc-300">{trader.trades}</span>
                                    </div>
                                </div>
                                <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold tracking-wider uppercase py-2 rounded-lg border border-zinc-700 transition-colors">
                                    Copy Trader
                                </button>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
};
