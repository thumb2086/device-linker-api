import { Link } from "react-router-dom";
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert,
  Activity,
  Users,
  Cpu,
  Database,
  Zap,
  LayoutGrid,
  TrendingUp,
  Wallet,
  Settings,
  ChevronRight,
  Terminal,
  AlertOctagon,
  RefreshCw,
  Power
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../store/api';

export default function AdminView() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/api/v1/stats/health').then(res => setStats(res.data.stats)).catch(() => {});
  }, []);

  const systemHealth = [
    { label: 'CPU LOAD', value: '82%', color: 'text-[#fcc025]', icon: Cpu },
    { label: 'MEMORY', value: '64%', color: 'text-[#fcc025]', icon: Database },
    { label: 'LATENCY', value: '12ms', color: 'text-emerald-500', icon: Activity },
  ];

  const sessions = [
    { id: 'OPERATOR_04', rank: 'ELITE', status: 'ONLINE' },
    { id: 'VIP_X', rank: 'PLATINUM', status: 'IDLE' },
    { id: 'GUEST_92', rank: 'COMMON', status: 'ONLINE' },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
             <ShieldAlert className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('nav.admin')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-7xl mx-auto space-y-10">
        {/* System Health */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 px-2">
              <Terminal size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">SYSTEM HEALTH / 系統狀態</h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {systemHealth.map(s => (
                <div key={s.label} className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10 flex items-center justify-between group">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#0e0e0e] flex items-center justify-center border border-[#494847]/20 group-hover:border-[#fcc025]/50 transition-colors">
                         <s.icon size={20} className={s.color} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#494847]">{s.label}</span>
                   </div>
                   <span className={`text-2xl font-black italic tracking-tighter ${s.color}`}>{s.value}</span>
                </div>
              ))}
           </div>
        </section>

        {/* User Management */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 px-2">
              <Users size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">USER MANAGEMENT / 用戶管理</h3>
           </div>
           <div className="bg-[#1a1919] rounded-2xl border border-[#494847]/10 overflow-hidden">
              <table className="w-full text-left">
                 <thead>
                    <tr className="border-b border-[#494847]/10">
                       <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[#494847]">Operator ID</th>
                       <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[#494847]">Clearance</th>
                       <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[#494847]">Status</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-[#494847]/5">
                    {sessions.map(s => (
                      <tr key={s.id} className="group hover:bg-[#201f1f] transition-colors">
                         <td className="px-6 py-4 text-[11px] font-bold uppercase text-white">{s.id}</td>
                         <td className="px-6 py-4 text-[9px] font-black uppercase text-[#fcc025]">{s.rank}</td>
                         <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                               <div className={`w-1 h-1 rounded-full ${s.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-[#494847]'}`} />
                               <span className={`text-[9px] font-black uppercase ${s.status === 'ONLINE' ? 'text-emerald-500' : 'text-[#494847]'}`}>{s.status}</span>
                            </div>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </section>

        {/* System Override */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 px-2">
              <Zap size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">SYSTEM OVERRIDE / 系統覆蓋</h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                 <button className="w-full bg-[#1a1919] hover:bg-[#262626] border border-[#494847]/20 rounded-xl p-5 flex items-center justify-between group transition-all">
                    <div className="flex items-center gap-4">
                       <RefreshCw size={20} className="text-[#fcc025] group-hover:rotate-180 transition-transform duration-700" />
                       <span className="text-[10px] font-black uppercase tracking-widest">FLUSH CACHE / 清除快取</span>
                    </div>
                    <ChevronRight size={16} className="text-[#494847]" />
                 </button>
                 <button className="w-full bg-[#1a1919] hover:bg-[#262626] border border-[#494847]/20 rounded-xl p-5 flex items-center justify-between group transition-all">
                    <div className="flex items-center gap-4">
                       <AlertOctagon size={20} className="text-[#fcc025]" />
                       <span className="text-[10px] font-black uppercase tracking-widest">MAINTENANCE MODE / 維護模式</span>
                    </div>
                    <div className="w-10 h-5 bg-[#0e0e0e] rounded-full p-1 border border-[#494847]/30">
                       <div className="w-3 h-3 bg-[#494847] rounded-full" />
                    </div>
                 </button>
              </div>

              <button className="bg-gradient-to-br from-red-600 to-red-900 rounded-2xl p-8 border border-red-500/30 flex flex-col items-center justify-center gap-4 shadow-[0_0_40px_rgba(220,38,38,0.2)] hover:shadow-[0_0_60px_rgba(220,38,38,0.4)] transition-all group active:scale-95">
                 <div className="w-16 h-16 rounded-full bg-black/20 flex items-center justify-center border-4 border-white/10 group-hover:border-white/30 transition-all">
                    <Power size={32} className="text-white" />
                 </div>
                 <div className="text-center">
                    <h3 className="text-xl font-black italic tracking-tighter uppercase text-white">EMERGENCY STOP</h3>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60">緊急停止所有模擬</p>
                 </div>
              </button>
           </div>
        </section>
      </main>

      {/* Bottom Nav Bar */}
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
