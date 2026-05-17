import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Archive } from 'lucide-react';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';
import { ITEM_DROP_TABLES, RARITY_NAMES } from '@repo/shared';

const RARITY_COLORS: Record<string, string> = {
  common: '#b0b0b0',
  rare: '#4fc3f7',
  epic: '#ba68c8',
  legendary: '#ffd54f',
  mythic: '#ff6f00',
};

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
};

export default function CollectionView() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/v1/inventory');
        if (res.data?.success?.items) {
          const collectibles = res.data.success.items.filter((i: any) => i.type === 'collectible');
          setItems(collectibles.sort((a: any, b: any) => (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0)));
        } else if (res.data?.data?.items) {
          const collectibles = res.data.data.items.filter((i: any) => i.type === 'collectible');
          setItems(collectibles.sort((a: any, b: any) => (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0)));
        }
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center gap-3 px-6 py-4 max-w-2xl mx-auto">
          <Link to="/app" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
            <ChevronLeft size={24} />
          </Link>
          <Archive className="text-[#fcc025]" />
          <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">收藏櫃</h1>
        </div>
      </header>

      <main className="pt-20 px-6 max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#fcc025] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-[#494847]/20 bg-[#1a1919] p-12 text-center mt-8">
            <Archive className="w-12 h-12 mx-auto text-[#494847] mb-4" />
            <p className="text-sm text-[#adaaaa]">尚未收藏任何物品</p>
            <p className="text-[10px] text-[#494847] mt-1">開啟寶箱有機會獲得稀有收藏品</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
            {items.map((item: any) => (
              <div
                key={item.id}
                className="rounded-2xl border-2 bg-[#1a1919] p-6 text-center transition-transform hover:scale-[1.02]"
                style={{ borderColor: RARITY_COLORS[item.rarity] || '#494847' }}
              >
                <div className="text-5xl mb-3">{item.icon || '📦'}</div>
                <h3 className="font-bold text-sm mb-1">{item.name}</h3>
                <p className="text-[10px] text-[#adaaaa]">{item.description || ''}</p>
                <span
                  className="inline-block mt-2 text-[10px] font-bold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: `${RARITY_COLORS[item.rarity] || '#494847'}30`,
                    color: RARITY_COLORS[item.rarity] || '#494847',
                  }}
                >
                  {item.rarity}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
