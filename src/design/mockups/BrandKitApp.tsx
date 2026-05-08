
import React, { useState, useRef, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MobileHeader from './components/MobileHeader';
import { BrandGuidelines } from './components/BrandGuidelines';
import { BrandFoundation } from './components/BrandFoundation';
import { DesignTokens } from './components/DesignTokens';
import { Iconography } from './components/Iconography';
import { DataVisualization } from './components/DataVisualization';
import { AlertsNotifications } from './components/AlertsNotifications';
import { ArbitrageScannerMockup } from './components/ArbitrageScanner';
import { LandingPageMockup, DiscoverPageMockup, TerminalPageMockup, TrendingPageMockup, WalletPageMockup, WalletTrackerPageMockup, LeaderboardPageMockup, AuthPageMockup, DigestPageMockup, WaitlistPageMockup, OnboardingMockup, ProfileHubMockup, ProfileHubMockupV2, ReferralsPageMockup, AdminConsoleMockup, AdminLoginPageMockup } from './components/Mockups';
import { AdminAccessMockup } from './components/infra/AdminAccess';
import { UserCanonicalMarketMockup, UserRoutePreviewMockup, UserExecutionReceiptMockup, UserLiquidityIntelligenceMockup, UserResolutionRiskMockup } from './components/UserInfraMockups';
import { DashboardV2Mockup } from './components/DashboardV2Mockup';
import { PortfolioMockupV2 } from './components/PortfolioMockupV2';
import { InfraTradingTerminal } from './components/InfraTradingTerminal';
import { InfraDepositPage } from './components/InfraDepositPage';
import { InfraDepositSuccess } from './components/InfraDepositSuccess';
import { NavGroup } from './types';

const navGroups: NavGroup[] = [
  {
    title: 'Brand Identity',
    items: [
      { id: 'intro', label: 'Introduction' },
      { id: 'foundation', label: 'Brand Foundation' },
      { id: 'logo', label: 'Logo' },
      { id: 'color', label: 'Color' },
      { id: 'typography', label: 'Typography' },
      { id: 'icons', label: 'Iconography' },
      { id: 'tokens', label: 'Design Tokens' },
      { id: 'dataviz', label: 'Data Visualization' },
    ]
  },
  {
    title: 'Infra Admin',
    items: [
      { id: 'admin', label: 'Admin Console' },
      { id: 'admin_login', label: 'Admin Login' },
      { id: 'admin_access', label: 'Admin Access & JWT' }
    ]
  },
  {
    title: 'Interface',
    items: [
      { id: 'auth', label: 'Authentication' },
      { id: 'onboarding', label: 'Onboarding Flow' },
      { id: 'profile', label: 'Profile Hub' },
      { id: 'profile_v2', label: 'Profile Hub V2 (Sub)' },
      { id: 'referrals', label: 'Referrals' },
      { id: 'digest', label: 'Daily Digest' },
      { id: 'trending', label: 'Trending Dashboard' },
      { id: 'scanner', label: 'Arbitrage Scanner' },
      { id: 'leaderboard', label: 'Leaderboard' },
      { id: 'alerts', label: 'Alerts & Notifications' },
    ]
  },
  {
    title: 'Infra Admin - Overview',
    items: [
    ]
  },
  {
    title: 'Terminal (Infra View)',
    items: [
      { id: 'dashboard_v2', label: 'Dashboard V2' },
      { id: 'portfolio_v2', label: 'Portfolio V2' },
      { id: 'infra_trading_terminal', label: 'Infra Trading Terminal' },
      { id: 'user_canonical', label: 'Canonical Market View' },
      { id: 'user_route', label: 'Route Preview' },
      { id: 'user_receipt', label: 'Execution Receipt' },
      { id: 'user_liquidity', label: 'Liquidity Intelligence' },
      { id: 'user_risk', label: 'Resolution Risk View' },
      { id: 'infra_deposit', label: 'Lotus Funding / Deposit' },
      { id: 'infra_deposit_success', label: 'Deposit Success Receipt' },
    ]
  }
];

function App() {
  const [activePage, setActivePage] = useState('intro');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Flatten items for mobile header
  const flatNavItems = navGroups.flatMap(g => g.items);

  useEffect(() => {
    // Remove global dark mode class from html to allow local control
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    // Handle scrolling when activePage changes
    const brandSections = ['intro', 'logo', 'color', 'typography'];
    
    // Short timeout to allow React to render the new content before we try to scroll to it
    const timer = setTimeout(() => {
      if (brandSections.includes(activePage)) {
        const element = document.getElementById(activePage);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (scrollContainerRef.current) {
           // Fallback if element not found immediately
           scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        // For distinct pages (Mockups), scroll to top
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [activePage]);

  const renderContent = () => {
    switch (activePage) {
      case 'foundation':
        return <BrandFoundation />;
      case 'dashboard_v2':
        return <DashboardV2Mockup />;
      case 'portfolio_v2':
        return <PortfolioMockupV2 />;
      case 'auth':
        return <AuthPageMockup />;
      case 'onboarding':
        return <OnboardingMockup />;
      case 'profile':
        return <ProfileHubMockup />;
      case 'profile_v2':
        return <ProfileHubMockupV2 />;
      case 'referrals':
        return <ReferralsPageMockup />;
      case 'landing':
        return <LandingPageMockup />;
      case 'waitlist':
        return <WaitlistPageMockup />;
      case 'digest':
        return <DigestPageMockup />;
      case 'discover':
        return <DiscoverPageMockup />;
      case 'trending':
        return <TrendingPageMockup />;
      case 'terminal':
        return <TerminalPageMockup />;
      case 'scanner':
        return <ArbitrageScannerMockup />;
      case 'wallet':
        return <WalletPageMockup />;
      case 'tracker':
        return <WalletTrackerPageMockup />;
      case 'leaderboard':
        return <LeaderboardPageMockup />;
      case 'alerts':
        return <AlertsNotifications />;
      case 'admin':
        return <AdminConsoleMockup />;
      case 'admin_login':
        return <AdminLoginPageMockup />;
      case 'admin_access':
        return <AdminAccessMockup />;
      case 'tokens':
        return <DesignTokens />;
      case 'icons':
        return <Iconography />;
      case 'dataviz':
        return <DataVisualization />;
      case 'user_canonical':
        return <UserCanonicalMarketMockup />;
      case 'user_route':
        return <UserRoutePreviewMockup />;
      case 'user_receipt':
        return <UserExecutionReceiptMockup />;
      case 'user_liquidity':
        return <UserLiquidityIntelligenceMockup />;
      case 'user_risk':
        return <UserResolutionRiskMockup />;
      case 'infra_deposit':
        return <InfraDepositPage />;
      case 'infra_deposit_success':
        return <InfraDepositSuccess />;
      case 'infra_trading_terminal':
        return <InfraTradingTerminal />;
      case 'intro':
      case 'logo':
      case 'color':
      case 'typography':
      default:
        return <BrandGuidelines />;
    }
  };

  return (
    <div className={`flex min-h-screen font-sans selection:bg-lotus-500 selection:text-black transition-colors duration-300 ${activePage !== 'dashboard_v2' ? 'dark bg-black text-zinc-100' : 'bg-[#F7F8FA] text-zinc-900'}`}>
      <div className="dark">
        <Sidebar 
          navGroups={navGroups} 
          activePage={activePage} 
          onNavigate={setActivePage} 
          isDarkMode={true}
          toggleTheme={() => {}}
        />
      </div>
      
      <div 
        ref={scrollContainerRef}
        className={`flex-1 flex flex-col min-w-0 h-screen overflow-y-auto custom-scrollbar scroll-smooth ${activePage !== 'dashboard_v2' ? 'dark bg-black bg-grid-pattern' : 'bg-[#F7F8FA] bg-grid-pattern-light'}`}
      >
        <div className="dark">
          <MobileHeader 
            navItems={flatNavItems} 
            onNavigate={setActivePage} 
            isDarkMode={true}
            toggleTheme={() => {}}
          />
        </div>

        <main className={`flex-1 w-full px-4 py-8 lg:px-12 lg:py-12 max-w-[1920px] mx-auto ${activePage !== 'dashboard_v2' ? 'dark' : ''}`}>
           {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default App;
