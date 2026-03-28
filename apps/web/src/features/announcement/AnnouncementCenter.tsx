import { Link } from "react-router-dom";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Megaphone,
  AlertTriangle,
  Info,
  ShieldAlert,
  ChevronRight,
  LayoutGrid,
  TrendingUp,
  Wallet,
  Settings,
  Bell
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AnnouncementCenter() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('LATEST');

  const items = [
    { id: 1, type: 'SYSTEM', title: 'Protocol Update v4.2.1', summary: 'Simulation stability improved for high-stakes environments.', time: '2 HOURS AGO' },
    { id: 2, type: 'SECURITY', title: 'Unusual Login Activity', summary: 'Detected unauthorized session attempt from IP 192.168.x.x.', time: '5 HOURS AGO' },
    { id: 3, type: 'EVENT', title: 'Elite Season 4 Kickoff', summary: 'New rewards and exclusive inventory items now available.', time: 'YESTERDAY' },
    { id: 4, type: 'MAINTENANCE', title: 'Sector 7 Maintenance', summary: 'Scheduled downtime for server optimization in Sector 7.', time: '2 DAYS AGO' },
  ];

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'SECURITY': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'SYSTEM': return 'bg-[#fcc025]/10 text-[#fcc025] border-[#fcc025]/20';
      default: return 'bg-white/10 text-white border-white/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <Megaphone className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('announcement.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        {/* Critical Alert */}
        <section className="bg-gradient-to-br from-red-600/20 to-transparent rounded-2xl p-6 border border-red-500/30 relative overflow-hidden group cursor-pointer">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <ShieldAlert size={80} />
           </div>
           <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500 animate-pulse" size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">{t('announcement.critical_alert')}</span>
           </div>
           <h2 className="text-2xl font-black italic tracking-tighter uppercase mb-2">System Overload Detected</h2>
           <p className="text-xs text-[#adaaaa] font-bold uppercase leading-relaxed mb-6">Urgent: Resource allocation in sector Alpha exceeds safety thresholds. Stabilize immediate.</p>
           <button className="bg-red-500 text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-400 transition-colors">View Details</button>
        </section>

        {/* Section Title */}
        <div className="flex items-center gap-2 px-2">
           <div className="w-1 h-3 bg-[#fcc025] rounded-full" />
           <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">{t('announcement.system_alerts')}</h3>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#1a1919] p-1.5 rounded-xl border border-[#494847]/20">
           {['LATEST', 'MAINTENANCE', 'EVENTS'].map(f => (
             <button
               key={f}
               onClick={() => setFilter(f)}
               className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${filter === f ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'}`}
             >
                {f}
             </button>
           ))}
        </div>

        {/* List */}
        <section className="space-y-4">
           {items.map(item => (
             <div key={item.id} className="bg-[#1a1919] rounded-xl p-5 border border-[#494847]/10 flex items-center justify-between group hover:bg-[#201f1f] transition-all cursor-pointer">
                <div className="flex flex-col gap-3 flex-1">
                   <div className="flex items-center gap-3">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm border ${getBadgeStyle(item.type)}`}>{item.type}</span>
                      <span className="text-[9px] font-bold text-[#494847] uppercase tracking-widest">{item.time}</span>
                   </div>
                   <div>
                      <h4 className="text-sm font-bold uppercase tracking-tight text-white group-hover:text-[#fcc025] transition-colors">{item.title}</h4>
                      <p className="text-[10px] text-[#adaaaa] font-bold mt-1 line-clamp-1">{item.summary}</p>
                   </div>
                </div>
                <ChevronRight size={16} className="text-[#494847] group-hover:text-[#fcc025] group-hover:translate-x-1 transition-all" />
             </div>
           ))}
        </section>
      </main>

      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-2xl border-t border-[#494847]/15 h-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          <div className="flex justify-around items-center h-full max-w-2xl mx-auto px-4">
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
