import {
  ShieldAlert,
  Activity,
  Users,
  Cpu,
  Database,
  Zap,
  ChevronRight,
  Terminal,
  AlertOctagon,
  RefreshCw,
  Power,
  Construction,
  Info
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppBottomNav from '../../components/AppBottomNav';

export default function AdminView() {
  const { t } = useTranslation();

  const systemHealth = [
    { label: 'CPU LOAD', value: '82%', color: 'text-[#fcc025]', icon: Cpu },
    { label: 'MEMORY', value: '64%', color: 'text-[#fcc025]', icon: Database },
    { label: 'LATENCY', value: '12ms', color: 'text-emerald-500', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="app-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
             <ShieldAlert className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('nav.admin')}</h1>
          </div>
        </div>
      </header>

      <main className="app-shell space-y-10 pt-24">
        {/* 開發中提示 */}
        <section className="rounded-2xl border border-[#fcc025]/20 bg-[#1a1919] p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#fcc025]/30 bg-[#262626]">
              <Construction className="text-[#fcc025]" size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black uppercase italic tracking-tight text-white">
                管理中心開發中
              </h2>
              <p className="mt-2 text-sm font-bold text-[#adaaaa]">
                系統管理功能正在開發中，以下數據為模擬展示
              </p>
            </div>
            <Info className="text-[#fcc025]" size={20} />
          </div>
        </section>

        {/* System Health */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 px-2">
              <Terminal size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">SYSTEM HEALTH / 系統狀態 (DEMO)</h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {systemHealth.map(s => (
                <div key={s.label} className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10 flex items-center justify-between group opacity-60">
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
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">USER MANAGEMENT / 用戶管理 (DEMO)</h3>
           </div>
           <div className="bg-[#1a1919] rounded-2xl border border-[#494847]/10 overflow-hidden opacity-60">
              <table className="w-full text-left">
                 <thead>
                    <tr className="border-b border-[#494847]/10">
                       <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[#494847]">Operator ID</th>
                       <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[#494847]">Clearance</th>
                       <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-[#494847]">Status</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-[#494847]/5">
                    {[
                      { id: 'OPERATOR_04', rank: 'ELITE', status: 'ONLINE' },
                      { id: 'VIP_X', rank: 'PLATINUM', status: 'IDLE' },
                      { id: 'GUEST_92', rank: 'COMMON', status: 'ONLINE' },
                    ].map(s => (
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
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">SYSTEM OVERRIDE / 系統覆蓋 (DEMO)</h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60">
              <div className="space-y-4">
                 <button className="w-full bg-[#1a1919] border border-[#494847]/20 rounded-xl p-5 flex items-center justify-between" disabled>
                    <div className="flex items-center gap-4">
                       <RefreshCw size={20} className="text-[#494847]" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-[#494847]">FLUSH CACHE / 清除快取</span>
                    </div>
                    <ChevronRight size={16} className="text-[#494847]" />
                 </button>
                 <button className="w-full bg-[#1a1919] border border-[#494847]/20 rounded-xl p-5 flex items-center justify-between" disabled>
                    <div className="flex items-center gap-4">
                       <AlertOctagon size={20} className="text-[#494847]" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-[#494847]">MAINTENANCE MODE / 維護模式</span>
                    </div>
                    <div className="w-10 h-5 bg-[#0e0e0e] rounded-full p-1 border border-[#494847]/30">
                       <div className="w-3 h-3 bg-[#494847] rounded-full" />
                    </div>
                 </button>
              </div>

              <button className="bg-gradient-to-br from-[#494847] to-[#1a1919] rounded-2xl p-8 border border-[#494847]/30 flex flex-col items-center justify-center gap-4 opacity-50" disabled>
                 <div className="w-16 h-16 rounded-full bg-black/20 flex items-center justify-center border-4 border-white/10">
                    <Power size={32} className="text-[#494847]" />
                 </div>
                 <div className="text-center">
                    <h3 className="text-xl font-black italic tracking-tighter uppercase text-[#494847]">EMERGENCY STOP</h3>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847]/60">緊急停止所有模擬</p>
                 </div>
              </button>
           </div>
        </section>
      </main>

      {/* Bottom Nav Bar */}
      <AppBottomNav current="none" />
    </div>
  );
}
