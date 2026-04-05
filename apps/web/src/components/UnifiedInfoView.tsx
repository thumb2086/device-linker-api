import { Calculator, ChevronLeft, Crown, Package, Sparkles } from 'lucide-react';
import AppBottomNav from '../components/AppBottomNav';
import ItemsTab from '../features/info/tabs/ItemsTab';
import OddsTab from '../features/info/tabs/OddsTab';
import VIPTab from '../features/info/tabs/VIPTab';

export default function UnifiedInfoView() {
  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <a href="/app" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
              <ChevronLeft size={24} />
            </a>
            <Sparkles className="text-[#fcc025]" />
            <div>
              <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">說明中心</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">綜合指南</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-20 space-y-8">
        {/* VIP 等級說明區塊 */}
        <section className="relative overflow-hidden rounded-2xl border border-[#fcc025]/20 bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] p-6 shadow-2xl">
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fcc025]/5 blur-[50px]" />
          
          <div className="relative z-10 mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#fcc025]/30 bg-[#262626]">
              <Crown className="h-6 w-6 text-[#fcc025]" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-tight text-[#fcc025]">VIP 等級說明</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">等級特權一覽</p>
            </div>
            <div className="ml-auto">
              <span className="inline-block rounded border border-[#fcc025]/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#fcc025]">
                等階 4 啟用中
              </span>
            </div>
          </div>
          
          <div className="relative z-10">
            <VIPTab />
          </div>
        </section>

        {/* 遊戲機率區塊 */}
        <section className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] p-6 shadow-2xl">
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/5 blur-[50px]" />
          
          <div className="relative z-10 mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-400/30 bg-[#262626]">
              <Calculator className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-tight text-emerald-400">遊戲機率</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">RTP 與公平性說明</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                公平遊戲保證
              </span>
            </div>
          </div>
          
          <div className="relative z-10">
            <OddsTab />
          </div>
        </section>

        {/* 物品圖鑑區塊 */}
        <section className="relative overflow-hidden rounded-2xl border border-purple-400/20 bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] p-6 shadow-2xl">
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400/5 blur-[50px]" />
          
          <div className="relative z-10 mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-purple-400/30 bg-[#262626]">
              <Package className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-tight text-purple-400">物品圖鑑</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">道具稀有度說明</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                頭像、稱號與道具
              </span>
            </div>
          </div>
          
          <div className="relative z-10">
            <ItemsTab />
          </div>
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
