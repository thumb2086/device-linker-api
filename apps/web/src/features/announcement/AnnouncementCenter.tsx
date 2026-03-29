import { Link } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  AlertTriangle,
  ShieldAlert,
  ChevronRight,
  LayoutGrid,
  TrendingUp,
  Wallet,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../store/api';

type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent';
  createdAt: string;
  active: boolean;
};

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.floor(diff / (1000 * 60 * 60)));
  if (hours < 24) return `${hours} HOURS AGO`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'YESTERDAY';
  return `${days} DAYS AGO`;
}

export default function AnnouncementCenter() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'LATEST' | 'MAINTENANCE' | 'EVENTS'>('LATEST');
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/v1/announcements')
      .then((res) => {
        const nextItems = Array.isArray(res.data.data) ? res.data.data : [];
        setItems(nextItems);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    if (filter === 'MAINTENANCE') {
      return items.filter((item) => item.type === 'warning');
    }
    if (filter === 'EVENTS') {
      return items.filter((item) => item.type === 'info');
    }
    return items;
  }, [filter, items]);

  const featured = useMemo(() => {
    return items.find((item) => item.type === 'urgent') || items[0] || null;
  }, [items]);

  const getBadgeStyle = (type: AnnouncementItem['type']) => {
    switch (type) {
      case 'urgent':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'warning':
        return 'bg-[#fcc025]/10 text-[#fcc025] border-[#fcc025]/20';
      default:
        return 'bg-white/10 text-white border-white/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <Megaphone className="text-[#fcc025]" />
            <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('announcement.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        <section className="bg-gradient-to-br from-red-600/20 to-transparent rounded-2xl p-6 border border-red-500/30 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <ShieldAlert size={80} />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="text-red-500 animate-pulse" size={20} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">{t('announcement.critical_alert')}</span>
          </div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase mb-2">
            {featured?.title || 'No active announcements'}
          </h2>
          <p className="text-xs text-[#adaaaa] font-bold uppercase leading-relaxed mb-6">
            {featured?.content || 'The announcement feed is online, but there are no active messages right now.'}
          </p>
          <div className="text-[10px] font-black uppercase tracking-widest text-white/70">
            {featured ? formatRelativeTime(featured.createdAt) : 'SYNCED'}
          </div>
        </section>

        <div className="flex items-center gap-2 px-2">
          <div className="w-1 h-3 bg-[#fcc025] rounded-full" />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">{t('announcement.system_alerts')}</h3>
        </div>

        <div className="flex bg-[#1a1919] p-1.5 rounded-xl border border-[#494847]/20">
          {(['LATEST', 'MAINTENANCE', 'EVENTS'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setFilter(entry)}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                filter === entry ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'
              }`}
            >
              {entry}
            </button>
          ))}
        </div>

        <section className="space-y-4">
          {loading && (
            <div className="bg-[#1a1919] rounded-xl p-5 border border-[#494847]/10 text-[11px] font-bold uppercase tracking-widest text-[#adaaaa]">
              Loading announcements...
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
            <div className="bg-[#1a1919] rounded-xl p-5 border border-[#494847]/10 text-[11px] font-bold uppercase tracking-widest text-[#adaaaa]">
              No announcements in this category.
            </div>
          )}

          {filteredItems.map((item) => (
            <div key={item.id} className="bg-[#1a1919] rounded-xl p-5 border border-[#494847]/10 flex items-center justify-between group hover:bg-[#201f1f] transition-all cursor-pointer">
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center gap-3">
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm border ${getBadgeStyle(item.type)}`}>
                    {item.type.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-bold text-[#494847] uppercase tracking-widest">{formatRelativeTime(item.createdAt)}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-tight text-white group-hover:text-[#fcc025] transition-colors">{item.title}</h4>
                  <p className="text-[10px] text-[#adaaaa] font-bold mt-1 line-clamp-2">{item.content}</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#494847] group-hover:text-[#fcc025] group-hover:translate-x-1 transition-all" />
            </div>
          ))}
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-2xl border-t border-[#494847]/15 h-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex justify-around items-center h-full max-w-7xl mx-auto px-4">
          <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
            <LayoutGrid size={24} className="mb-1" />
            <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.casino')}</span>
          </Link>
          <Link to="/app/market" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
            <TrendingUp size={24} className="mb-1" />
            <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.market')}</span>
          </Link>
          <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
            <Wallet size={24} className="mb-1" />
            <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.vault')}</span>
          </Link>
          <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
            <Settings size={24} className="mb-1" />
            <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.settings')}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
