import { Link } from "react-router-dom";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Wallet,
  LayoutGrid,
  Settings,
  CircleDollarSign,
  Briefcase
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarket } from './useMarket';
import { formatNumber } from '@repo/shared';

export default function MarketView() {
  const { t } = useTranslation();
  const { prices } = useMarket();
  const [activeTab, setActiveTab] = useState('TERMINAL');

  const assets = [
    { id: 'BTC', name: 'Bitcoin', price: prices.BTC || 68421.5, change: '+4.2%', icon: '₿' },
    { id: 'ZXC', name: 'ZiXi Coin', price: 1.0, change: '0.0%', icon: 'Z' },
    { id: 'ETH', name: 'Ethereum', price: 3842.1, change: '-1.5%', icon: 'Ξ' },
  ];

  const orderBook = {
    bids: [
      { price: 68422.0, amount: 0.45 },
      { price: 68421.5, amount: 1.22 },
      { price: 68421.0, amount: 0.89 },
    ],
    asks: [
      { price: 68420.5, amount: 0.12 },
      { price: 68420.0, amount: 2.11 },
      { price: 68419.5, amount: 0.54 },
    ]
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
             <TrendingUp className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('market.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-7xl mx-auto space-y-6">
        {/* Price Ticker */}
        <section className="bg-[#1a1919] rounded-xl p-6 border border-[#494847]/10 flex items-center justify-between overflow-hidden relative group">
           <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-full bg-[#fcc025]/10 flex items-center justify-center text-[#fcc025] border border-[#fcc025]/20">
                <CircleDollarSign size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">BTC / ZXC</p>
                <div className="flex items-center gap-3">
                   <h2 className="text-3xl font-black italic tracking-tighter text-white">68,421.5</h2>
                   <span className="text-emerald-500 text-xs font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">+4.2%</span>
                </div>
              </div>
           </div>
           <div className="hidden md:block h-12 w-48 bg-white/5 rounded-lg overflow-hidden">
              {/* Mock Chart Sparkline */}
              <div className="flex items-end gap-1 h-full p-2">
                 {[40,60,30,80,50,90,70,100].map((h, i) => (
                   <div key={i} className="flex-1 bg-[#fcc025]/20 rounded-t-sm" style={{ height: `${h}%` }} />
                 ))}
              </div>
           </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           {/* Chart Area */}
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10 aspect-video flex flex-col relative">
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2">
                       <BarChart3 size={16} className="text-[#adaaaa]" />
                       <span className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">Simulation Feed</span>
                    </div>
                    <div className="flex gap-2">
                       {['1M', '5M', '15M', '1H'].map(tf => (
                         <button key={tf} className="px-3 py-1 bg-[#0e0e0e] border border-[#494847]/20 rounded text-[10px] font-bold hover:border-[#fcc025]/50 transition-colors uppercase">{tf}</button>
                       ))}
                    </div>
                 </div>
                 <div className="flex-1 flex items-center justify-center border-t border-b border-[#494847]/5">
                    <div className="text-[#494847] text-[10px] font-black uppercase tracking-[0.5em]">Chart Simulation Active</div>
                 </div>
              </div>

              {/* Trade Panel */}
              <div className="grid grid-cols-2 gap-4">
                 <button className="bg-gradient-to-br from-[#fcc025] to-[#e6ad03] text-black font-black py-6 rounded-2xl shadow-xl shadow-[#fcc025]/10 hover:shadow-[#fcc025]/20 transition-all flex flex-col items-center gap-1 group">
                    <span className="text-sm uppercase italic tracking-tighter group-hover:scale-110 transition-transform">{t('market.buy')}</span>
                    <span className="text-[9px] uppercase font-bold opacity-60">Execute Long</span>
                 </button>
                 <button className="bg-[#ff7351] text-white font-black py-6 rounded-2xl shadow-xl shadow-[#ff7351]/10 hover:shadow-[#ff7351]/20 transition-all flex flex-col items-center gap-1 group">
                    <span className="text-sm uppercase italic tracking-tighter group-hover:scale-110 transition-transform">{t('market.sell')}</span>
                    <span className="text-[9px] uppercase font-bold opacity-60">Execute Short</span>
                 </button>
              </div>
           </div>

           {/* Sidebar Info */}
           <div className="space-y-6">
              {/* Order Book */}
              <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10">
                 <div className="flex items-center gap-2 mb-6">
                    <LayoutGrid size={16} className="text-[#adaaaa]" />
                    <h3 className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">{t('market.order_book')}</h3>
                 </div>
                 <div className="space-y-4">
                    <div className="grid grid-cols-2 text-[9px] font-bold text-[#494847] uppercase tracking-widest px-1">
                       <span>{t('market.price')}</span>
                       <span className="text-right">{t('market.amount')}</span>
                    </div>
                    <div className="space-y-1.5">
                       {orderBook.asks.map((o, i) => (
                         <div key={i} className="grid grid-cols-2 text-[11px] font-mono relative">
                            <span className="text-[#ff7351] z-10">{o.price.toFixed(1)}</span>
                            <span className="text-right text-[#adaaaa] z-10">{o.amount}</span>
                            <div className="absolute right-0 top-0 bottom-0 bg-[#ff7351]/5 rounded-sm" style={{ width: `${o.amount * 40}%` }} />
                         </div>
                       ))}
                    </div>
                    <div className="py-2 flex items-center justify-center">
                       <span className="text-lg font-black italic tracking-tighter text-[#fcc025]">68,421.5</span>
                    </div>
                    <div className="space-y-1.5">
                       {orderBook.bids.map((o, i) => (
                         <div key={i} className="grid grid-cols-2 text-[11px] font-mono relative">
                            <span className="text-emerald-500 z-10">{o.price.toFixed(1)}</span>
                            <span className="text-right text-[#adaaaa] z-10">{o.amount}</span>
                            <div className="absolute right-0 top-0 bottom-0 bg-emerald-500/5 rounded-sm" style={{ width: `${o.amount * 40}%` }} />
                         </div>
                       ))}
                    </div>
                 </div>
              </section>

              {/* Portfolio */}
              <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10">
                 <div className="flex items-center gap-2 mb-6">
                    <Briefcase size={16} className="text-[#adaaaa]" />
                    <h3 className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">{t('market.portfolio')}</h3>
                 </div>
                 <div className="space-y-4">
                    {assets.map(asset => (
                      <div key={asset.id} className="flex items-center justify-between group cursor-pointer">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-[#0e0e0e] flex items-center justify-center font-black text-[#fcc025] text-xs border border-[#494847]/20 group-hover:border-[#fcc025]/50 transition-colors">
                             {asset.icon}
                           </div>
                           <div>
                              <p className="text-[11px] font-bold uppercase text-white">{asset.name}</p>
                              <p className="text-[9px] font-bold text-[#adaaaa]">{asset.id}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-[11px] font-bold text-white tracking-tighter">{formatNumber(asset.price)}</p>
                           <p className={`text-[9px] font-bold ${asset.change.startsWith('+') ? 'text-emerald-500' : 'text-[#ff7351]'}`}>{asset.change}</p>
                        </div>
                      </div>
                    ))}
                 </div>
              </section>
           </div>
        </div>
      </main>

      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-2xl border-t border-[#494847]/15 h-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          <div className="flex justify-around items-center h-full max-w-7xl mx-auto px-4">
              <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                  <LayoutGrid size={24} className="mb-1" />
                  <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.casino')}</span>
              </Link>
              <Link to="/app/market" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
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
