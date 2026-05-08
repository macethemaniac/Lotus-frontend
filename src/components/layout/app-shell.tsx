import { Activity, Bell, Home, PieChart, Search, Settings, Trophy, Wallet } from "lucide-react";
import type { AppPage } from "@/app/routes";
import { StatusBadge } from "@/components/ui/status-badge";

const navItems: Array<{ id: AppPage; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "markets", label: "Markets", icon: Home },
  { id: "trade", label: "Trade", icon: Activity },
  { id: "funding", label: "Funding", icon: Wallet },
  { id: "portfolio", label: "Portfolio", icon: PieChart },
  { id: "design", label: "Design refs", icon: Trophy },
];

export function AppShell({
  activePage,
  onPageChange,
  children,
}: {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-16 border-r border-zinc-800 bg-[#121214] md:flex md:flex-col md:items-center md:py-5">
        <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-lg bg-lotus-500/10 text-lotus-500">
          <span className="text-xl font-black">✦</span>
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              onClick={() => onPageChange(item.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500 ${
                activePage === item.id ? "bg-white text-black" : "text-zinc-500 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
            </button>
          ))}
        </nav>
        <button
          type="button"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
      </aside>

      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#121214]/95 backdrop-blur md:pl-16">
        <div className="flex h-16 items-center gap-3 px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center rounded-full bg-zinc-900 px-3 py-2 text-zinc-500 md:max-w-md">
            <Search className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate text-sm">Search markets, events, or venues...</span>
          </div>
          <StatusBadge tone="pending">Private beta</StatusBadge>
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="md:pl-16">{children}</main>
    </div>
  );
}
