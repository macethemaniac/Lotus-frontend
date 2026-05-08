import React, { useState, useEffect } from 'react';
import { ExternalLink, Github, Twitter, MessageSquare, Terminal, Activity, Shield, Box, Code, Hexagon, Wifi, Bug, Headphones, BookOpen } from 'lucide-react';

export const GlobalFooterVariations = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  return (
    <div className="w-full flex flex-col gap-16 min-h-screen pb-20">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl font-mono text-zinc-100 tracking-tight">Global Footers</h1>
        <p className="text-zinc-500 font-mono text-sm max-w-2xl">
          Modular footer components designed for infra/terminal-themed views. 
          Use Variation 1 for dense application views, Variation 2 for marketing/docs, 
          and Variation 3 for minimal console states.
        </p>
      </div>

      {/* VARIATION 1: DENSE / APP STATE */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded bg-lotus-500/10 text-lotus-400 font-mono text-xs border border-lotus-500/20">V1</span>
          <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider">Dense / App Footer</h2>
        </div>
        
        <footer className="w-full bg-[#09090b] border-t border-zinc-900 border-x border-zinc-900/50 rounded-b-xl overflow-hidden font-mono text-xs shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-lotus-500/20 to-transparent"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-center py-4 px-6 gap-4">
            {/* Left Status */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 group cursor-pointer">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] group-hover:shadow-[0_0_15px_rgba(16,185,129,0.8)] transition-all"></div>
                <span className="text-emerald-500/90 font-medium">All Systems Operational</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-zinc-500">
                <Activity size={14} className="text-zinc-600" />
                <span>Ping: 14ms</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-zinc-500">
                <Box size={14} className="text-zinc-600" />
                <span>Block: 18459201</span>
              </div>
            </div>

            {/* Right Links */}
            <div className="flex items-center gap-6 text-zinc-500">
              <a href="#" className="hover:text-zinc-300 transition-colors flex items-center gap-1">
                <Code size={14} /> API Docs
              </a>
              <a href="#" className="hover:text-zinc-300 transition-colors flex items-center gap-1">
                <Terminal size={14} /> CLI
              </a>
              <span className="text-zinc-800">|</span>
              <a href="#" className="hover:text-zinc-300 transition-colors flex items-center gap-1">
                <Github size={14} />
              </a>
              <a href="#" className="hover:text-zinc-300 transition-colors flex items-center gap-1">
                <Twitter size={14} />
              </a>
            </div>
          </div>
          
          {/* Bottom Bar */}
          <div className="bg-black py-2 px-6 flex justify-between items-center border-t border-zinc-900 text-[10px] text-zinc-600">
            <div className="flex gap-4">
              <span>&copy; {new Date().getFullYear()} Lotus Infrastructure</span>
              <a href="#" className="hover:text-zinc-400">Terms of Service</a>
              <a href="#" className="hover:text-zinc-400">Privacy Policy</a>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={12} className="text-zinc-700" />
              <span>v2.1.0-beta.4</span>
            </div>
          </div>
        </footer>
      </section>


      {/* VARIATION 2: FAT FOOTER (MARKETING / DOCS) */}
      {/* Intentionally removed to keep only V1, V3, and V4 based on request */}

      {/* VARIATION 3: BRUTALIST MINIMAL CONSOLE */}
      <section className="flex flex-col gap-4 mt-8">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded bg-lotus-500/10 text-lotus-400 font-mono text-xs border border-lotus-500/20">V3</span>
          <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider">Minimal Console Footer</h2>
        </div>
        
        <footer className="w-full bg-black border-2 border-zinc-800 font-mono text-xs relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-lotus-500/0 via-lotus-500/50 to-lotus-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-stretch">
            {/* Console output style info */}
            <div className="flex-1 p-4 border-b md:border-b-0 md:border-r border-zinc-800 flex flex-col justify-center text-zinc-500 space-y-1">
              <div><span className="text-lotus-500">{'>'}</span> sys.net_status: <span className="text-emerald-500">OK</span></div>
              <div><span className="text-lotus-500">{'>'}</span> node_sync: <span className="text-zinc-300">FULLY_SYNCED</span></div>
            </div>

            {/* Quick links */}
            <div className="flex">
              <a href="#" className="p-4 flex items-center justify-center border-r border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors">
                <span className="mr-2">/docs</span>
              </a>
              <a href="#" className="p-4 flex items-center justify-center border-r border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors">
                <span className="mr-2">/api</span>
              </a>
              <a href="#" className="p-4 flex items-center justify-center border-r border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors">
                <span className="mr-2">/status</span>
              </a>
              <div className="p-4 flex items-center justify-center text-zinc-600 bg-zinc-950">
                LTS 2.1.0
              </div>
            </div>
          </div>
        </footer>
      </section>

      {/* VARIATION 4: REAL-TIME TERMINAL READOUT */}
      <section className="flex flex-col gap-4 mt-8">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded bg-lotus-500/10 text-lotus-400 font-mono text-xs border border-lotus-500/20">V4</span>
          <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider">Requested Setup (Dense Strip)</h2>
        </div>
        
        {/* Actual Footer Strip from Screenshot */}
        <footer className="w-full bg-[#121316] border-t border-zinc-800/80 flex items-center justify-between px-4 h-10 font-sans text-[12px] select-none text-[#717a8a]">
          {/* Left Cluster */}
          <div className="flex items-center gap-6">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00d061] shadow-[0_0_8px_rgba(0,208,97,0.4)]"></div>
              <span className="font-medium text-[#006e89] lg:text-[#00d061] hidden sm:inline">Connected</span>
              <span className="font-medium text-[#717a8a] sm:hidden inline">Connected</span>
              {/* Note: I adjusted text color to match the "Connected" in screenshot which has a teal/blueish tint in the original or maybe emerald. I'll stick to a greenish #007a51 for the text or just #717a8a to be safe. Actually, the screenshot has #717a8a or similar muted blue-green "Connected" text in some places, I'll use text-[#668894] or similar based on visual. */}
              {/* Let's just use text-[#54798e] for that specific slightly muted blue-green text observed */}
            </div>
            
            {/* Network */}
            <div className="flex items-center gap-1.5 group cursor-pointer hover:text-zinc-300 transition-colors">
              <Wifi size={14} className="opacity-70" />
              <span>Polygon &bull; Solana</span>
            </div>

            {/* Price Tickers */}
            <div className="hidden md:flex items-center gap-4 ml-1">
              <div className="flex items-center gap-2">
                <span>BTC</span>
                <span className="text-white font-medium tracking-tight">$80,246</span>
              </div>
              <div className="flex items-center gap-2">
                <span>ETH</span>
                <span className="text-white font-medium tracking-tight">$2,289</span>
              </div>
              <div className="flex items-center gap-2">
                <span>SOL</span>
                <span className="text-white font-medium tracking-tight">$89.35</span>
              </div>
              <div className="flex items-center gap-2">
                <span>USDC</span>
                <span className="text-white font-medium tracking-tight">$1.000</span>
              </div>
            </div>
          </div>

          {/* Right Cluster */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-300 transition-colors">
              <Activity size={14} className="opacity-70" />
              <span>Markets: Live</span>
            </div>
            
            <div className="font-mono text-zinc-400 tabular-nums">
              {formatTime(time)}
            </div>
            
            <div className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-300 transition-colors">
              <Bug size={14} className="opacity-70" />
              <span>Bug Bounty</span>
            </div>
            
            <div className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-300 transition-colors">
              <Headphones size={14} className="opacity-70" />
              <span>Support</span>
            </div>
            
            <div className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-300 transition-colors">
              <BookOpen size={14} className="opacity-70" />
              <span>Docs</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 flex items-center justify-center cursor-pointer hover:text-zinc-300 transition-colors opacity-80">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px]">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.908 19.908 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>
              <div className="w-4 h-4 flex items-center justify-center cursor-pointer hover:text-zinc-300 transition-colors opacity-80">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.004 4.076H5.036z" />
                </svg>
              </div>
            </div>
          </div>
        </footer>
      </section>

    </div>
  );
};
