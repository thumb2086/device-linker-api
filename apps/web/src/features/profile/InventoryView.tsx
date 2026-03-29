import React, { useMemo, useState } from 'react';
import { ChevronRight, Fingerprint, Package, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../../store/useUserStore';
import AppBottomNav from '../../components/AppBottomNav';

type InventoryCategory = 'ALL' | 'FRAMES' | 'SKINS' | 'BOOSTERS';

type InventoryItem = {
  id: number;
  name: string;
  rarity: string;
  icon: string;
  category: Exclude<InventoryCategory, 'ALL'>;
  color: string;
  border: string;
  bg: string;
};

const INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: 1,
    name: 'Dragon Frame',
    rarity: 'LEGENDARY',
    icon: '\u9f8d',
    category: 'FRAMES',
    color: 'text-[#fcc025]',
    border: 'border-[#fcc025]/40',
    bg: 'bg-[#fcc025]/5',
  },
  {
    id: 2,
    name: 'Stealth Ops Skin',
    rarity: 'ELITE',
    icon: '\u26e8',
    category: 'SKINS',
    color: 'text-sky-400',
    border: 'border-sky-400/35',
    bg: 'bg-sky-400/5',
  },
  {
    id: 3,
    name: '10x Multiplier',
    rarity: 'RARE',
    icon: '10x',
    category: 'BOOSTERS',
    color: 'text-emerald-400',
    border: 'border-emerald-400/30',
    bg: 'bg-emerald-400/5',
  },
  {
    id: 4,
    name: 'Repair Kit',
    rarity: 'COMMON',
    icon: '\u2699',
    category: 'BOOSTERS',
    color: 'text-[#adaaaa]',
    border: 'border-[#494847]/20',
    bg: 'bg-white/5',
  },
];

export default function InventoryView() {
  const { t, i18n } = useTranslation();
  const { username, address } = useUserStore();
  const isZh = i18n.language.startsWith('zh');
  const [filter, setFilter] = useState<InventoryCategory>('ALL');

  const tabs: InventoryCategory[] = ['ALL', 'FRAMES', 'SKINS', 'BOOSTERS'];
  const filteredItems = useMemo(() => {
    if (filter === 'ALL') return INVENTORY_ITEMS;
    return INVENTORY_ITEMS.filter((item) => item.category === filter);
  }, [filter]);

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Package className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
              {t('inventory.title')}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-6 pt-24">
        <section className="group relative overflow-hidden rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-8">
          <div className="absolute right-0 top-0 p-10 opacity-5 transition-transform group-hover:scale-110">
            <Fingerprint size={120} />
          </div>
          <div className="relative z-10 flex items-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#fcc025] bg-[#262626] shadow-[0_0_30px_rgba(252,192,37,0.2)]">
              <Sparkles className="text-[#fcc025]" size={28} />
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#fcc025]">
                {isZh ? '\u7576\u524d\u64cd\u4f5c\u54e1' : 'Current Operator'}
              </p>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">
                {username || (address ? address.slice(0, 8) : 'OPERATOR_01')}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <Sparkles size={12} className="text-[#fcc025]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#adaaaa]">
                  Aureum Edition Active
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="hide-scrollbar flex overflow-x-auto rounded-xl border border-[#494847]/20 bg-[#1a1919] p-1.5">
          {tabs.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setFilter(entry)}
              className={`min-w-[88px] flex-1 rounded-lg py-2 text-[9px] font-bold uppercase tracking-widest transition-all ${
                filter === entry ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'
              }`}
            >
              {entry}
            </button>
          ))}
        </div>

        <section className="grid grid-cols-2 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`group relative overflow-hidden rounded-2xl border p-6 transition-all hover:scale-[1.02] ${item.border} ${item.bg}`}
            >
              <div className="flex flex-col items-center space-y-4 text-center">
                <div className={`text-5xl transition-transform group-hover:scale-110 ${item.color}`}>{item.icon}</div>
                <div>
                  <p className={`mb-1 text-[8px] font-black uppercase tracking-widest ${item.color}`}>{item.rarity}</p>
                  <h4 className="text-[11px] font-bold uppercase tracking-tight text-white">{item.name}</h4>
                </div>
              </div>
              {item.rarity === 'LEGENDARY' && (
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#fcc025]/10 to-transparent" />
              )}
            </div>
          ))}
        </section>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#fcc025] py-4 font-black uppercase italic tracking-tighter text-black shadow-xl shadow-[#fcc025]/10 transition-all hover:bg-white"
        >
          {t('inventory.equip')}
          <ChevronRight size={18} />
        </button>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
