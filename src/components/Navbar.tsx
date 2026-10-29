// ==============================================================================
// Terminal Navigation Bar
// Fast switching between all 10 quantitative analytics modules
// ==============================================================================

import React from 'react';
import { 
  LayoutDashboard, TableProperties, Target, LineChart, 
  BellRing, Briefcase, History, KeyRound, Sliders, Radio, Eye, Sparkles 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type PageId = 
  | 'dashboard' 
  | 'strike-monitor'
  | 'prediction'
  | 'option-chain' 
  | 'atm-analysis' 
  | 'charts' 
  | 'signals' 
  | 'paper-trading' 
  | 'historical' 
  | 'broker-settings' 
  | 'general-settings' 
  | 'diagnostics';

interface NavbarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  openTradesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ activePage, onSelectPage, openTradesCount = 0 }) => {
  const { user } = useAuth();

  const isRestrictedUser = Boolean(
    user?.username?.toLowerCase().trim() === 'monapadmavathi@gmail.com' ||
    user?.username?.toLowerCase().trim() === 'monapadmavathi' ||
    user?.email?.toLowerCase().trim() === 'monapadmavathi@gmail.com'
  );

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'strike-monitor', label: 'Strike Monitor', icon: Eye },
    { id: 'prediction', label: 'Prediction', icon: Sparkles },
    { id: 'option-chain', label: 'Live Option Chain', icon: TableProperties },
    { id: 'atm-analysis', label: 'ATM Strike Analysis', icon: Target },
    { id: 'charts', label: 'Technical Charts', icon: LineChart },
    { id: 'signals', label: 'Signals & Alerts', icon: BellRing },
    { id: 'paper-trading', label: 'Paper Trading', icon: Briefcase, badge: openTradesCount > 0 ? openTradesCount : undefined },
    { id: 'historical', label: 'Historical Analysis', icon: History },
    { id: 'broker-settings', label: 'Broker APIs', icon: KeyRound },
    { id: 'general-settings', label: 'Settings', icon: Sliders },
    { id: 'diagnostics', label: 'Diagnostics', icon: Radio },
  ];

  // If username is monapadmavathi@gmail.com, show only:
  // Strike Monitor, Broker APIs, Settings, Diagnostics
  const RESTRICTED_PAGE_IDS: PageId[] = [
    'strike-monitor',
    'broker-settings',
    'general-settings',
    'diagnostics',
  ];

  const navItems = isRestrictedUser
    ? allNavItems.filter((item) => RESTRICTED_PAGE_IDS.includes(item.id as PageId))
    : allNavItems;

  return (
    <div className="border-b border-terminal-800 bg-terminal-900/60 px-2 sm:px-4 overflow-x-auto scrollbar-thin">
      <nav className="flex space-x-1 min-w-max py-1.5" aria-label="Tabs">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id as PageId)}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-500/40 shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-terminal-800/40 border border-transparent'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-600 text-white font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
