import { Link } from "react-router-dom";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Search,
  Filter,
  ChevronRight,
  LayoutGrid,
  TrendingUp,
  Wallet,
  Settings,
  Sparkles,
  Shield,
  Zap,
  Fingerprint
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../../store/useUserStore';

export default function InventoryView() {
  const { t } = useTranslation();
  const { username, address } = useUserStore();
  const [filter, setFilter] = useState('ALL');

  const items = [
    { id: 1, name: 'Dragon Frame', rarity: 'LEGENDARY', icon: '🐉', color: 'text-[#fcc025]', border: 'border-[#fcc025]/40', bg: 'bg-[#fcc025]/5' },
    { id: 2, name: 'Stealth Ops Skin', rarity: 'ELITE', icon: '👤', color: 'text-purple-500', border: 'border-purple-500/40', bg: 'bg-purple-500/5' },
    { id: 3, name: '10x Multiplier', rarity: 'RARE', icon: '⚡', color: 'text-blue-500', border: 'border-blue-500/40', bg: 'bg-blue-500/5' },
    { id: 4, name: 'Basic Repair Kit', rarity: 'COMMON', icon: '🔧', color: 'text-gray-400', border: 'border-gray-400/20', bg: 'bg-gray-400/5' },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <Package className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('inventory.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        {/* Operator Preview */}
        <section className="bg-[#1a1919] rounded-2xl p-8 border border-[#494847]/10 relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform">
              <Fingerprint size={120} />
           </div>
           <div className="flex items-center gap-6 relative z-10">
              <div className="w-20 h-20 rounded-2xl bg-[#262626] border-2 border-[#fcc025] shadow-[0_0_30px_rgba(252,192,37,0.2)] flex items-center justify-center overflow-hidden">
                 <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Operator" alt="Operator" className="w-full h-full" />
              </div>
              <div className="space-y-1">
                 <p className="text-[9px] font-bold text-[#fcc025] uppercase tracking-[0.3em]">{t('inventory.current_operator')}</p>
                 <h2 className="text-2xl font-black italic tracking-tighter uppercase">{username || (address ? address.slice(0, 8) : 'OPERATOR_01')}</h2>
                 <div className="flex items-center gap-2 mt-2">
                    <Sparkles size={12} className="text-[#fcc025]" />
                    <span className="text-[9px] font-bold text-[#adaaaa] uppercase tracking-widest">Aureum Edition Active</span>
                 </div>
              </div>
           </div>
        </section>

        {/* Tabs */}
        <div className="flex bg-[#1a1919] p-1.5 rounded-xl border border-[#494847]/20 overflow-x-auto hide-scrollbar">
           {['ALL', 'FRAMES', 'SKINS', 'BOOSTERS'].map(f => (
             <button
               key={f}
               onClick={() => setFilter(f)}
               className={`flex-1 min-w-[80px] py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${filter === f ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'}`}
             >
                {f}
             </button>
           ))}
        </div>

        {/* Grid */}
        <section className="grid grid-cols-2 gap-4">
           {items.map(item => (
             <div key={item.id} className={`p-6 rounded-2xl border transition-all hover:scale-[1.02] cursor-pointer group relative overflow-hidden ${item.border} ${item.bg}`}>
                <div className="flex flex-col items-center text-center space-y-4">
                   <div className={`text-5xl group-hover:scale-110 transition-transform ${item.color}`}>
                      {item.icon}
                   </div>
                   <div>
                      <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${item.color}`}>{item.rarity}</p>
                      <h4 className="text-[11px] font-bold uppercase tracking-tight text-white">{item.name}</h4>
                   </div>
                </div>
                {item.rarity === 'LEGENDARY' && (
                  <div className="absolute inset-0 bg-gradient-to-t from-[#fcc025]/10 to-transparent pointer-events-none" />
                )}
             </div>
           ))}
        </section>

        <button className="w-full bg-[#fcc025] text-black font-black py-4 rounded-xl uppercase italic tracking-tighter shadow-xl shadow-[#fcc025]/10 hover:bg-white transition-all flex items-center justify-center gap-2">
           {t('inventory.equip')}
           <ChevronRight size={18} />
        </button>
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
