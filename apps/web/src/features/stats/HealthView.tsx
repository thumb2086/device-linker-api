import { Link } from "react-router-dom";
import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  Terminal,
  ChevronRight,
  HeartPulse,
  Database
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import AppBottomNav from '../../components/AppBottomNav';

export default function HealthView() {
  const { t } = useTranslation();

  const { data: healthData, isLoading } = useQuery({
    queryKey: ['health-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/stats/health');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  const { data: txData } = useQuery({
      queryKey: ['recent-txs'],
      queryFn: async () => {
        const res = await fetch('/api/v1/stats/recent-txs');
        const data = await res.json();
        return data.data;
      },
      refetchInterval: 10000,
  });

  const stats = healthData?.stats;
  const events = txData?.events || [];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
             <HeartPulse className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('settings.service_status')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-7xl mx-auto space-y-10">
        {/* Core Stats */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="bg-[#1a1919] p-6 rounded-2xl border border-[#494847]/10 flex flex-col gap-2">
              <span className="text-[8px] font-black text-[#494847] uppercase tracking-[0.3em]">UPTIME</span>
              <span className="text-xl font-black italic text-emerald-500">{stats?.uptime || '99.98%'}</span>
           </div>
           <div className="bg-[#1a1919] p-6 rounded-2xl border border-[#494847]/10 flex flex-col gap-2">
              <span className="text-[8px] font-black text-[#494847] uppercase tracking-[0.3em]">FAILURE RATE</span>
              <span className="text-xl font-black italic text-[#fcc025]">{stats?.failureRate || '0.02%'}</span>
           </div>
           <div className="bg-[#1a1919] p-6 rounded-2xl border border-[#494847]/10 flex flex-col gap-2">
              <span className="text-[8px] font-black text-[#494847] uppercase tracking-[0.3em]">NODES</span>
              <span className="text-xl font-black italic text-white">12 ACTIVE</span>
           </div>
           <div className="bg-[#1a1919] p-6 rounded-2xl border border-[#494847]/10 flex flex-col gap-2">
              <span className="text-[8px] font-black text-[#494847] uppercase tracking-[0.3em]">SECURE LAYER</span>
              <span className="text-xl font-black italic text-[#fcc025]">AES-256</span>
           </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           {/* Traffic Graph */}
           <section className="bg-[#1a1919] rounded-2xl p-8 border border-[#494847]/10 space-y-8">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <Activity size={16} className="text-[#fcc025]" />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">SIMULATION THROUGHPUT</h3>
                 </div>
                 <div className="flex items-center gap-4 text-[8px] font-black uppercase">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500/20 border border-emerald-500" /> SUCCESS</div>
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500/60 border border-red-500" /> FAILURE</div>
                 </div>
              </div>
              <div className="flex items-end gap-1.5 h-48">
                 {stats?.last24h?.success.map((val: number, i: number) => (
                    <div key={i} className="flex-1 group relative">
                       <div className="bg-emerald-500/10 w-full rounded-t-sm" style={{ height: `${(val/50)*100}%` }} />
                       <div className="bg-red-500/40 w-full rounded-t-sm -mt-1" style={{ height: `${(stats.last24h.failure[i]/50)*100}%` }} />
                    </div>
                 )) || [40,60,30,80,50,90,70,100,55,65,45,75].map((h, i) => (
                    <div key={i} className="flex-1 bg-[#262626] rounded-t-sm" style={{ height: `${h}%` }} />
                 ))}
              </div>
              <div className="flex justify-between text-[8px] font-black text-[#494847] uppercase tracking-[0.3em]">
                 <span>24 HOURS AGO</span>
                 <span>SYNCHRONIZED NOW</span>
              </div>
           </section>

           {/* Event Log */}
           <section className="bg-[#1a1919] rounded-2xl p-8 border border-[#494847]/10 space-y-6">
              <div className="flex items-center gap-2">
                 <Terminal size={16} className="text-[#fcc025]" />
                 <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">SYSTEM PROTOCOL LOGS</h3>
              </div>
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-4 hide-scrollbar">
                 {events.map((ev: any, i: number) => (
                    <div key={i} className="bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/5 space-y-2 group hover:border-[#fcc025]/30 transition-all">
                       <div className="flex items-center justify-between">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm ${ev.severity === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-[#fcc025]/10 text-[#fcc025]'}`}>[{ev.kind}]</span>
                          <span className="text-[8px] font-bold text-[#494847]">{new Date(ev.createdAt).toLocaleTimeString([], { hour12: false })}</span>
                       </div>
                       <p className="text-[10px] font-bold text-white leading-relaxed uppercase italic tracking-tight">{ev.message}</p>
                    </div>
                 ))}
                 {events.length === 0 && (
                   <div className="flex flex-col items-center justify-center py-20 opacity-20 space-y-4">
                      <Database size={40} />
                      <p className="text-[9px] font-black uppercase tracking-[0.5em]">No recent traces detected</p>
                   </div>
                 )}
              </div>
           </section>
        </div>
      </main>

      {/* Bottom Nav Bar */}
      <AppBottomNav current="none" />
    </div>
  );
}
