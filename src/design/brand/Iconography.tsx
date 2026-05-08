import React from 'react';
import { 
  DownloadIcon, CopyIcon, CheckIcon, MenuIcon, SunIcon, MoonIcon, 
  MailIcon, WalletIcon, UserIcon, KeyIcon, GoogleIcon, TwitterIcon,
  LotusLogo, SearchIcon, FilterIcon, LightningIcon, FireIcon,
  InfoIcon, WarningIcon, CloseIcon, ArrowRightIcon,
  ChevronDownIcon, ClockIcon, GridIcon, ListIcon, SettingsIcon, BriefcaseIcon,
  BellIcon, ShareIcon, TagIcon, TrophyIcon, GlobeIcon, ChartBarIcon, RefreshIcon, ShieldIcon
} from './Icons';

const IconCard: React.FC<{ icon: React.ReactNode; name: string; usage?: string }> = ({ icon, name, usage }) => (
  <div className="flex flex-col gap-3 group">
    <div className="h-24 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center justify-center text-zinc-900 dark:text-white transition-all group-hover:border-zinc-300 dark:group-hover:border-zinc-700 group-hover:shadow-sm relative overflow-hidden">
        {/* Hover Grid Background */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMwMDAiLz48L3N2Zz4=')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4=')]"></div>
        <div className="transform transition-transform group-hover:scale-110 duration-300">
            {icon}
        </div>
    </div>
    <div>
        <div className="text-sm font-bold text-zinc-900 dark:text-white font-mono">{name}</div>
        {usage && <div className="text-xs text-zinc-500 mt-0.5">{usage}</div>}
    </div>
  </div>
);

export const Iconography: React.FC = () => {
  return (
    <div className="space-y-16 animate-fade-in">
        <div>
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-4">Iconography</h2>
            <p className="text-zinc-600 dark:text-zinc-400 max-w-3xl leading-relaxed">
                Our icons are designed to be sharp, legible, and lightweight. They share a consistent 2px stroke weight and geometric construction to match the precision of the Lotus terminal.
            </p>
        </div>

        {/* Construction Guidelines */}
        <section className="space-y-8">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Construction</h3>
                <p className="text-sm text-zinc-500 mt-1">Based on a 24x24px grid with a 2px stroke.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="col-span-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 flex items-center justify-center relative overflow-hidden">
                    {/* Grid Overlay */}
                    <div className="absolute inset-0 opacity-20 pointer-events-none" 
                         style={{ 
                             backgroundImage: 'linear-gradient(to right, #888 1px, transparent 1px), linear-gradient(to bottom, #888 1px, transparent 1px)',
                             backgroundSize: '8.33% 8.33%' 
                         }}>
                    </div>
                    {/* Center Icon */}
                    <WalletIcon className="w-32 h-32 text-zinc-900 dark:text-white relative z-10" />
                    
                    {/* Annotation */}
                    <div className="absolute top-4 right-4 text-[10px] font-mono text-zinc-400">24px Grid</div>
                </div>

                <div className="col-span-1 lg:col-span-2 flex flex-col justify-center space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-sm border border-zinc-200 dark:border-zinc-700">1</div>
                        <div>
                            <h4 className="font-bold text-zinc-900 dark:text-white text-sm">2px Stroke</h4>
                            <p className="text-sm text-zinc-500">Consistent line weight across all icons ensures visual balance.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-sm border border-zinc-200 dark:border-zinc-700">2</div>
                        <div>
                            <h4 className="font-bold text-zinc-900 dark:text-white text-sm">Round Joins & Caps</h4>
                            <p className="text-sm text-zinc-500">Softened edges (stroke-linejoin="round") prevents harshness while maintaining geometric shape.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-sm border border-zinc-200 dark:border-zinc-700">3</div>
                        <div>
                            <h4 className="font-bold text-zinc-900 dark:text-white text-sm">Optical Alignment</h4>
                            <p className="text-sm text-zinc-500">Icons are center-weighted to feel balanced within square containers.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* UI Icons */}
        <section className="space-y-8">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">UI Essentials</h3>
                <p className="text-sm text-zinc-500 mt-1">Functional icons used for navigation, actions, and status.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                <IconCard icon={<MenuIcon />} name="Menu" usage="Navigation trigger" />
                <IconCard icon={<SearchIcon />} name="Search" usage="Discovery" />
                <IconCard icon={<FilterIcon />} name="Filter" usage="Data refinement" />
                <IconCard icon={<CloseIcon />} name="Close" usage="Dismissal" />
                <IconCard icon={<CheckIcon />} name="Check" usage="Success state" />
                <IconCard icon={<WarningIcon />} name="Warning" usage="Alert state" />
                <IconCard icon={<InfoIcon />} name="Info" usage="Context/Help" />
                <IconCard icon={<ArrowRightIcon />} name="Arrow" usage="Directional" />
                <IconCard icon={<ChevronDownIcon />} name="Chevron" usage="Dropdown/Expand" />
                <IconCard icon={<SettingsIcon />} name="Settings" usage="Config/Controls" />
                <IconCard icon={<GridIcon />} name="Grid" usage="View toggle" />
                <IconCard icon={<ListIcon />} name="List" usage="View toggle" />
                <IconCard icon={<ClockIcon />} name="Clock" usage="Time/History" />
                <IconCard icon={<BriefcaseIcon />} name="Portfolio" usage="Assets" />
                <IconCard icon={<DownloadIcon />} name="Download" usage="Asset export" />
                <IconCard icon={<CopyIcon />} name="Copy" usage="Clipboard action" />
                <IconCard icon={<SunIcon />} name="Sun" usage="Light mode" />
                <IconCard icon={<MoonIcon />} name="Moon" usage="Dark mode" />
                <IconCard icon={<LightningIcon />} name="Lightning" usage="Pro/Speed" />
                <IconCard icon={<FireIcon />} name="Fire" usage="Trending/Hot" />
                <IconCard icon={<MailIcon />} name="Mail" usage="Email input" />
                <IconCard icon={<WalletIcon />} name="Wallet" usage="Connection" />
                <IconCard icon={<UserIcon />} name="User" usage="Profile / Auth" />
                <IconCard icon={<KeyIcon />} name="Key" usage="Passkeys" />
                
                {/* New Icons */}
                <IconCard icon={<BellIcon />} name="Bell" usage="Notifications" />
                <IconCard icon={<ShareIcon />} name="Share" usage="Social/Export" />
                <IconCard icon={<TagIcon />} name="Tag" usage="Categories" />
                <IconCard icon={<TrophyIcon />} name="Trophy" usage="Leaderboard" />
                <IconCard icon={<GlobeIcon />} name="Globe" usage="Macro/Global" />
                <IconCard icon={<ChartBarIcon />} name="Chart" usage="Analytics" />
                <IconCard icon={<RefreshIcon />} name="Refresh" usage="Updates" />
                <IconCard icon={<ShieldIcon />} name="Shield" usage="Security" />
            </div>
        </section>

        {/* Brand & Social */}
        <section className="space-y-8 pb-12">
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Brand & Social</h3>
                <p className="text-sm text-zinc-500 mt-1">Third-party logos and the primary Lotus mark.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                <IconCard icon={<LotusLogo className="w-6 h-6" />} name="Lotus" usage="Logomark" />
                <IconCard icon={<GoogleIcon />} name="Google" usage="Auth provider" />
                <IconCard icon={<TwitterIcon />} name="Twitter/X" usage="Social link" />
            </div>
        </section>
    </div>
  );
};