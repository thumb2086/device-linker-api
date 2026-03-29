import React from 'react';
import { Link } from 'react-router-dom';
import { Home, LayoutGrid, MessageSquareText, Settings, TrendingUp, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type NavKey = 'home' | 'casino' | 'market' | 'wallet' | 'settings' | 'feed' | 'none';

export default function AppBottomNav({ current }: { current: NavKey }) {
  const { t } = useTranslation();

  const items = [
    { key: 'home' as const, to: '/app', icon: Home, label: t('nav.dashboard') },
    { key: 'casino' as const, to: '/app/casino/lobby', icon: LayoutGrid, label: t('nav.casino') },
    { key: 'market' as const, to: '/app/market', icon: TrendingUp, label: t('nav.market') },
    { key: 'wallet' as const, to: '/app/wallet', icon: Wallet, label: t('nav.vault') },
    { key: 'settings' as const, to: '/app/settings', icon: Settings, label: t('nav.settings') },
    { key: 'feed' as const, to: '/app/transactions', icon: MessageSquareText, label: t('nav.feed') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 z-50 h-20 w-full border-t border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-2xl">
      <div className="app-shell flex h-full items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.key === current;

          return (
            <Link
              key={item.key}
              to={item.to}
              className={`flex flex-col items-center justify-center transition-all ${
                active ? 'text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]' : 'text-[#adaaaa] hover:text-white'
              }`}
            >
              <Icon size={24} className="mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
