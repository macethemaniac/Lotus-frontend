import React, { useState } from 'react';
import { 
    CheckCircle2, XCircle, AlertTriangle, Info, Bell, Wallet, 
    ArrowRightLeft, ShieldAlert, Cpu, Network, Check, 
    Zap, Flame, TrendingUp, Trophy, ArrowDownLeft, Clock
} from 'lucide-react';

export const AlertsNotifications = () => {
    const [filter, setFilter] = useState<'all' | 'unread' | 'system' | 'trading' | 'wallet'>('all');

    const alerts = [
        {
            id: 'fill-confirmed',
            type: 'success',
            category: 'trading',
            title: 'Fill Confirmed',
            message: 'Predict.fun order filled. Unified position and venue-level PnL are updating from verified fill evidence.',
            time: 'Just now',
            icon: <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />,
            action: 'View Position',
            unread: true
        },
        {
            id: 'limit-order-resting',
            type: 'info',
            category: 'trading',
            title: 'Limit Order Resting',
            message: 'Your limit order is live and waiting for venue liquidity. Lotus will notify you when it fills, cancels, or needs attention.',
            time: '2 mins ago',
            icon: <Clock className="w-5 h-5 text-sky-400" />,
            action: 'View Order',
            unread: true
        },
        {
            id: 'fund-activation-required',
            type: 'warning',
            category: 'wallet',
            title: 'Venue Funds Activation Required',
            message: 'Polymarket needs a venue activation or approval before this balance can be used for live routes.',
            time: '5 mins ago',
            icon: <Wallet className="w-5 h-5 text-amber-500" />,
            action: 'Activate Funds',
            unread: true
        },
        {
            id: 1,
            type: 'error',
            category: 'wallet',
            title: 'Deposit Failed',
            message: 'Your deposit of 1,000 USDC could not be completed on Arbitrum One due to insufficient ETH for gas. Please top up your wallet.',
            time: 'Just now',
            icon: <XCircle className="w-5 h-5 text-red-500" />,
            action: 'Try Again',
            unread: true
        },
        {
            id: 2,
            type: 'success',
            category: 'trading',
            title: 'Smart Route Executed',
            message: 'Filled 20,716 YES shares of "Democrat Nominee 2028". Average price 48.27¢. Saved ~$45.20 vs direct execution.',
            time: '2 mins ago',
            icon: <Zap className="w-5 h-5 text-[#00ff88]" />,
            action: 'View Receipt',
            unread: true
        },
        {
            id: 3,
            type: 'warning',
            category: 'trading',
            title: 'High Slippage Prevented',
            message: 'Order paused. Executing your 50,000 USDC order on the Limitless pair would incur 8.4% slippage. Recommend using Lotus Time-Weighted execution.',
            time: '14 mins ago',
            icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
            action: 'Switch to TWAP',
            unread: false
        },
        {
            id: 4,
            type: 'info',
            category: 'system',
            title: 'Market Resolved',
            message: 'Waitlist period concluded. The market "Will Lotus launch before Q4?" has resolved to YES.',
            time: '1 hour ago',
            icon: <Info className="w-5 h-5 text-blue-400" />,
            unread: false
        },
        {
            id: 5,
            type: 'error',
            category: 'trading',
            title: 'Resolution Dispute Active',
            message: 'The market "Super Bowl LIX Winner" is currently under dispute. Withdrawals against this position are locked until oracle consensus.',
            time: '3 hours ago',
            icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
            action: 'Read Details',
            unread: false
        },
        {
            id: 6,
            type: 'success',
            category: 'wallet',
            title: 'Withdrawal Complete',
            message: '1,420.50 USDC has successfully landed in your Solana wallet.',
            time: 'Yesterday',
            icon: <ArrowDownLeft className="w-5 h-5 text-[#00ff88]" />,
            unread: false
        },
        {
            id: 7,
            type: 'info',
            category: 'system',
            title: 'Route Optimizer Upgrade',
            message: 'Lotus AI has added Wintermute private LP paths for Political markets. Expect tighter spreads on high-volume queries.',
            time: 'Yesterday',
            icon: <Cpu className="w-5 h-5 text-zinc-400" />,
            unread: false
        },
        {
            id: 8,
            type: 'success',
            category: 'trading',
            title: 'Trader Copied Successfully',
            message: 'You are now actively copying "majorexploiter". New positions will be replicated continuously.',
            time: '2 days ago',
            icon: <Trophy className="w-5 h-5 text-[#00ff88]" />,
            unread: false
        }
    ];

    const filteredAlerts = alerts.filter(a => {
        if (filter === 'all') return true;
        if (filter === 'unread') return a.unread;
        return a.category === filter;
    });

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 animate-in fade-in duration-500">
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
                        <Bell className="w-7 h-7" /> Notifications
                    </h1>
                    <p className="text-sm text-zinc-500 mt-2">Manage your trading alerts, wallet activity, and system updates.</p>
                </div>
                <button className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    Mark all as read
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4 overflow-x-auto no-scrollbar">
                {[
                    { id: 'all', label: 'All Activity' },
                    { id: 'unread', label: 'Unread', count: alerts.filter(alert => alert.unread).length },
                    { id: 'trading', label: 'Trading' },
                    { id: 'wallet', label: 'Wallet & Funding' },
                    { id: 'system', label: 'System & Security' }
                ].map(f => (
                    <button 
                        key={f.id}
                        onClick={() => setFilter(f.id as any)}
                        className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                            filter === f.id 
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' 
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                    >
                        {f.label} {f.count && <span className="ml-1 bg-lotus-500 text-black px-1.5 py-0.5 rounded-full text-[10px]">{f.count}</span>}
                    </button>
                ))}
            </div>

            {/* Notification List */}
            <div className="space-y-3">
                {filteredAlerts.length === 0 ? (
                    <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800/80">
                        <Bell className="w-10 h-10 text-zinc-400 mx-auto mb-3 opacity-50" />
                        <h3 className="text-lg font-medium text-zinc-900 dark:text-white">All caught up</h3>
                        <p className="text-sm text-zinc-500 mt-1">No notifications in this category right now.</p>
                    </div>
                ) : (
                    filteredAlerts.map(alert => (
                        <div 
                            key={alert.id} 
                            className={`group border rounded-xl p-5 transition-all
                                ${alert.unread 
                                    ? 'bg-white dark:bg-[#121214] border-zinc-200 dark:border-zinc-700 shadow-sm' 
                                    : 'bg-zinc-50 dark:bg-[#09090b] border-zinc-100 dark:border-zinc-800/60 opacity-80'
                                }
                            `}
                        >
                            <div className="flex gap-4 items-start">
                                {/* Icon container */}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border
                                    ${alert.type === 'error' ? 'bg-red-500/10 border-red-500/20' : ''}
                                    ${alert.type === 'success' ? 'bg-[#00ff88]/10 border-[#00ff88]/20' : ''}
                                    ${alert.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20' : ''}
                                    ${alert.type === 'info' ? 'bg-blue-500/10 border-blue-500/20 object-zinc-500/10 dark:bg-zinc-800 border-zinc-700' : ''}
                                `}>
                                    {alert.icon}
                                </div>

                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            {alert.unread && <span className="w-2 h-2 rounded-full bg-lotus-500 mt-1"></span>}
                                            <h4 className={`text-base font-semibold ${alert.unread ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                {alert.title}
                                            </h4>
                                        </div>
                                        <span className="text-xs font-mono text-zinc-500 whitespace-nowrap ml-4 mt-1">{alert.time}</span>
                                    </div>
                                    <p className={`text-sm mt-1 mb-3 leading-relaxed ${alert.unread ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-500 dark:text-zinc-500'}`}>
                                        {alert.message}
                                    </p>
                                    
                                    {alert.action && (
                                        <button className={`text-sm font-semibold tracking-wide transition-colors
                                            ${alert.type === 'error' ? 'text-red-600 dark:text-red-400 hover:text-red-500' : ''}
                                            ${alert.type === 'success' ? 'text-emerald-600 dark:text-[#00ff88] hover:text-emerald-500' : ''}
                                            ${alert.type === 'warning' ? 'text-amber-600 dark:text-amber-400 hover:text-amber-500' : ''}
                                        `}>
                                            {alert.action} &rarr;
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
