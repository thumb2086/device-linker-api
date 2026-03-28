import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Headphones,
  MessageSquare,
  FileText,
  ChevronRight,
  LayoutGrid,
  TrendingUp,
  Wallet,
  Settings,
  Send,
  LifeBuoy
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function SupportView() {
  const { t } = useTranslation();

  const protocols = [
    { id: 1, title: 'Vault Security Protocol', summary: 'Information regarding AES-256 and multi-sig authorization.' },
    { id: 2, title: 'Trading Execution Guide', summary: 'How to use the market terminal for high-frequency trading.' },
    { id: 3, title: 'Account Recovery Steps', summary: 'Procedure for recovering identity profile if session is lost.' },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <LifeBuoy className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('support.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        {/* Live Chat Module */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10 flex flex-col gap-6 shadow-2xl">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-xl bg-[#262626] border border-[#fcc025]/20 flex items-center justify-center overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Support" alt="Support" className="w-8 h-8" />
                 </div>
                 <div>
                    <h3 className="text-[10px] font-bold text-[#fcc025] uppercase tracking-widest">{t('support.live_chat')}</h3>
                    <p className="text-[11px] font-bold text-white uppercase italic">SYSTEM OPERATOR_72</p>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Online</span>
              </div>
           </div>

           <div className="bg-[#0e0e0e] rounded-xl p-4 min-h-[100px] border border-[#494847]/10 flex items-center justify-center italic text-[#494847] text-xs uppercase font-bold tracking-widest">
              Connecting to secure line...
           </div>

           <div className="relative">
              <input
                 type="text"
                 placeholder="Enter message..."
                 className="w-full bg-[#0e0e0e] border border-[#494847]/20 rounded-xl pl-5 pr-14 py-4 text-xs font-bold focus:border-[#fcc025]/50 outline-none transition-all placeholder:text-[#494847] uppercase tracking-tight"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#fcc025] text-black rounded-lg flex items-center justify-center hover:bg-white transition-colors">
                 <Send size={16} />
              </button>
           </div>
        </section>

        {/* System Protocols */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 px-2">
              <FileText size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">{t('support.system_protocols')}</h3>
           </div>

           <div className="space-y-3">
              {protocols.map(p => (
                <div key={p.id} className="bg-[#1a1919] rounded-xl p-5 border border-[#494847]/10 flex items-center justify-between group hover:bg-[#201f1f] transition-all cursor-pointer">
                   <div className="space-y-1">
                      <h4 className="text-[11px] font-bold uppercase text-white group-hover:text-[#fcc025] transition-colors">{p.title}</h4>
                      <p className="text-[9px] font-bold text-[#adaaaa] line-clamp-1">{p.summary}</p>
                   </div>
                   <ChevronRight size={14} className="text-[#494847] group-hover:translate-x-1 transition-transform" />
                </div>
              ))}
           </div>
        </section>

        {/* Submit Ticket */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10 space-y-6">
           <div className="space-y-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#fcc025]">{t('support.submit_ticket')}</h3>
              <p className="text-[10px] text-[#adaaaa] font-bold uppercase">Report simulation anomalies</p>
           </div>

           <div className="space-y-4">
              <div className="space-y-2">
                 <label className="text-[9px] font-bold uppercase text-[#494847] tracking-widest ml-1">{t('support.issue_category')}</label>
                 <select className="w-full bg-[#0e0e0e] border border-[#494847]/20 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none focus:border-[#fcc025]/50 appearance-none uppercase">
                    <option>Technical Error</option>
                    <option>Vault Discrepancy</option>
                    <option>Trade Execution</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[9px] font-bold uppercase text-[#494847] tracking-widest ml-1">{t('support.description')}</label>
                 <textarea
                    rows={4}
                    placeholder="Provide details..."
                    className="w-full bg-[#0e0e0e] border border-[#494847]/20 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none focus:border-[#fcc025]/50 placeholder:text-[#494847] uppercase"
                 />
              </div>
              <button className="w-full bg-transparent border border-[#fcc025]/30 text-[#fcc025] font-black py-4 rounded-xl text-[10px] uppercase tracking-[0.3em] hover:bg-[#fcc025]/10 transition-all active:scale-[0.98]">
                 {t('support.send_protocol')}
              </button>
           </div>
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
