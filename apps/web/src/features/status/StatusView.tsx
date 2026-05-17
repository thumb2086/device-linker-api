import { Link } from 'react-router-dom';
import { User, ChevronRight, Coins, Sparkles } from 'lucide-react';
import AppBottomNav from '../../components/AppBottomNav';
import { useUserStore } from '../../store/useUserStore';
import { ITEM_DROP_TABLES } from '@repo/shared';

const allItems = Object.values(ITEM_DROP_TABLES).flat();
const avatarMap = Object.fromEntries(
  allItems.filter((i) => i.type === 'avatar').map((i) => [i.id, i])
);
const titleMap = Object.fromEntries(
  allItems.filter((i) => i.type === 'title').map((i) => [i.id, i])
);

export default function StatusView() {
  const { address, username, balance, activeAvatar, activeTitle } = useUserStore();
  const avatarItem = avatarMap[activeAvatar];
  const titleItem = titleMap[activeTitle];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <User className="text-[#fcc025]" />
            <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">個人狀態</h1>
          </div>
        </div>
      </header>

      <main className="pt-20 px-6 max-w-2xl mx-auto space-y-6">
        {/* Avatar + Title */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20 flex items-center gap-6">
          <div className="text-5xl shrink-0">{avatarItem?.icon || '🧑'}</div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-black text-white truncate">{username || '未設定'}</p>
            {titleItem && <p className="text-xs font-bold text-[#fcc025]">{titleItem.icon} {titleItem.name}</p>}
            <p className="text-[10px] font-bold text-[#adaaaa] truncate mt-1">{address || ''}</p>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1a1919] rounded-2xl p-5 border border-[#494847]/20">
            <div className="flex items-center gap-2 mb-2">
              <Coins size={14} className="text-[#fcc025]" />
              <span className="text-[9px] font-black uppercase tracking-widest text-[#adaaaa]">ZXC 餘額</span>
            </div>
            <p className="text-xl font-black italic text-[#fcc025]">{Number(balance).toLocaleString()}</p>
          </div>
          <div className="bg-[#1a1919] rounded-2xl p-5 border border-[#494847]/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-[#fcc025]" />
              <span className="text-[9px] font-black uppercase tracking-widest text-[#adaaaa]">活躍頭像</span>
            </div>
            <p className="text-sm font-bold text-white truncate">{avatarItem?.name || activeAvatar}</p>
          </div>
        </div>

        {/* Quick Links */}
        <section className="bg-[#1a1919] rounded-2xl border border-[#494847]/20 divide-y divide-[#494847]/10">
          <Link to="/app/inventory" className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
            <span className="text-sm font-bold">道具背包</span>
            <ChevronRight size={16} className="text-[#adaaaa]" />
          </Link>
          <Link to="/app/info?tab=items" className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
            <span className="text-sm font-bold">物品圖鑑</span>
            <ChevronRight size={16} className="text-[#adaaaa]" />
          </Link>
          <Link to="/app/settings" className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
            <span className="text-sm font-bold">設定</span>
            <ChevronRight size={16} className="text-[#adaaaa]" />
          </Link>
        </section>
      </main>

      <AppBottomNav current="home" />
    </div>
  );
}
