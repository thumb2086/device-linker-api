import { Link } from "react-router-dom";
import React from 'react';
import { motion } from 'framer-motion';
import {
  Wallet as WalletIcon,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  ShieldCheck,
  Zap,
  TrendingUp,
  LayoutGrid
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../../store/useUserStore';
import { formatNumber } from '@repo/shared';

export default function WalletView() {
  const { t } = useTranslation();
  const { balance } = useUserStore();

  const transactions = [
    { id: 1, type: 'DEPOSIT', amount: 25.0, status: 'SUCCESS', date: '2026-03-28' },
    { id: 2, type: 'WITHDRAW', amount: 10.5, status: 'SUCCESS', date: '2026-03-27' },
    { id: 3, type: 'WINNING', amount: 2.4, status: 'SUCCESS', date: '2026-03-26' },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <WalletIcon className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('vault.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        {/* Balance Display */}
        <section className="bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] rounded-2xl p-10 border border-[#494847]/10 shadow-[0_0_50px_rgba(252,192,37,0.05)] text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#fcc025]/5 blur-[80px] rounded-full" />
          <p className="text-[10px] font-bold text-[#adaaaa] tracking-[0.3em] uppercase mb-4">{t('vault.total_assets')}</p>
          <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#fcc025] to-[#e6ad03] italic tracking-tighter uppercase">
            {formatNumber(balance || 0)}
          </div>
          <p className="text-xl font-bold text-white mt-2 italic">{t('common.unit_yjc')}</p>

          <div className="mt-8 flex items-center justify-center gap-2">
            <ShieldCheck size={14} className="text-[#fcc025]/60" />
            <span className="text-[9px] font-bold text-[#fcc025]/60 uppercase tracking-[0.2em]">AES-256 BANK GRADE SECURITY</span>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
           <button className="flex flex-col items-center justify-center gap-3 p-6 bg-[#1a1919] rounded-2xl border border-[#494847]/20 hover:bg-[#262626] transition-all group">
              <div className="w-12 h-12 rounded-xl bg-[#fcc025] flex items-center justify-center text-black group-hover:scale-110 transition-transform">
                <ArrowDownCircle size={24} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest">{t('vault.vault_in')}</span>
           </button>
           <button className="flex flex-col items-center justify-center gap-3 p-6 bg-[#1a1919] rounded-2xl border border-[#494847]/20 hover:bg-[#262626] transition-all group">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-[#fcc025] group-hover:scale-110 transition-transform">
                <ArrowUpCircle size={24} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest">{t('vault.vault_out')}</span>
           </button>
        </div>

        {/* VIP Bonus Card */}
        <section className="bg-gradient-to-r from-[#1a1919] to-[#262626] rounded-2xl p-6 border border-[#fcc025]/10 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-[#fcc025]/10 flex items-center justify-center">
                <Zap className="text-[#fcc025]" size={24} />
             </div>
             <div>
                <p className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">{t('vault.vip_bonus')}</p>
                <p className="text-lg font-black text-[#fcc025] italic tracking-tight">1.5X MULTIPLIER</p>
             </div>
           </div>
           <div className="h-2 w-24 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '75%' }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="h-full bg-[#fcc025]"
              />
           </div>
        </section>

        {/* Transaction History */}
        <section className="space-y-4">
           <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <History size={16} className="text-[#adaaaa]" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">{t('vault.transactions')}</h3>
              </div>
           </div>

           <div className="space-y-3">
              {transactions.map(tx => (
                <div key={tx.id} className="bg-[#1a1919] rounded-xl p-5 border border-[#494847]/10 flex items-center justify-between hover:bg-[#201f1f] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      tx.type === 'DEPOSIT' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {tx.type === 'DEPOSIT' ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white">{tx.type}</p>
                      <p className="text-[9px] text-[#adaaaa] font-bold uppercase">{tx.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black italic tracking-tighter ${
                      tx.type === 'DEPOSIT' || tx.type === 'WINNING' ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                      {tx.type === 'DEPOSIT' || tx.type === 'WINNING' ? '+' : '-'}{tx.amount} 億
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <div className="w-1 h-1 rounded-full bg-emerald-500" />
                      <span className="text-[8px] font-bold uppercase tracking-widest text-[#adaaaa]">{tx.status}</span>
                    </div>
                  </div>
                </div>
              ))}
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
              <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
                  <WalletIcon size={24} className="mb-1" />
                  <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.vault')}</span>
              </Link>
              <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                  <SettingsIcon size={24} className="mb-1" />
                  <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.settings')}</span>
              </Link>
          </div>
      </nav>
    </div>
  );
}
