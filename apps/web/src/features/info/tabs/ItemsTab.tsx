import { useState, useEffect } from 'react';
import { Package, Sparkles, Crown, Sword, Heart, Zap, Gift, Search } from 'lucide-react';
import { api } from '../../store/api';

interface CatalogItem {
  id: string;
  name: string;
  type: 'avatar' | 'title' | 'item' | 'buff';
  rarity: 'common' | 'rare' | 'legendary' | 'mythic' | 'vip';
  description: string;
  icon: string;
  source: string;
  howToGet: string;
}

const RARITY_COLORS = {
  common: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', label: '普通' },
  rare: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '稀有' },
  legendary: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '傳說' },
  mythic: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: '神話' },
  vip: { bg: 'bg-[#fcc025]/20', text: 'text-[#fcc025]', border: 'border-[#fcc025]/30', label: 'VIP' },
};

const TYPE_ICONS = {
  avatar: Package,
  title: Crown,
  item: Gift,
  buff: Zap,
};

export default function ItemsTab() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'avatar' | 'title' | 'item'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/api/v1/rewards/avatars/catalog').catch(() => ({ data: { data: [] } })),
      api.get('/api/v1/rewards/titles/catalog').catch(() => ({ data: { data: [] } })),
    ])
      .then(([avatarsRes, titlesRes]) => {
        const avatars = (avatarsRes.data.data || []).map((item: any) => ({
          ...item,
          type: 'avatar' as const,
          howToGet: item.source === 'shop' ? '商店購買' : 
                   item.source === 'admin' ? '管理員授予' : 
                   item.source === 'chest' ? '寶箱開啟' : '活動獲得',
        }));
        const titles = (titlesRes.data.data || []).map((item: any) => ({
          ...item,
          type: 'title' as const,
          howToGet: item.source === 'shop' ? '商店購買' : 
                   item.source === 'admin' ? '管理員授予' : 
                   item.source === 'chest' ? '寶箱開啟' : '活動獲得',
        }));
        setItems([...avatars, ...titles]);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = items.filter((item) => {
    if (filter !== 'all' && item.type !== filter) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 搜尋和篩選 */}
      <section className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#494847]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋物品名稱..."
            className="w-full rounded-xl border border-[#494847]/20 bg-[#1a1919] py-3 pl-10 pr-4 text-sm font-bold text-white placeholder:text-[#494847] focus:outline-none focus:border-[#fcc025]/50"
          />
        </div>
        
        <div className="flex gap-2">
          {(['all', 'avatar', 'title', 'item'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                filter === type
                  ? 'bg-[#fcc025] text-black'
                  : 'bg-[#1a1919] text-[#adaaaa] border border-[#494847]/20'
              }`}
            >
              {type === 'all' ? '全部' : 
               type === 'avatar' ? '頭像' : 
               type === 'title' ? '稱號' : '道具'}
            </button>
          ))}
        </div>
      </section>

      {/* 稀有度說明 */}
      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-4">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
          稀有度說明
        </h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(RARITY_COLORS).map(([key, colors]) => (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${colors.border} ${colors.bg}`}
            >
              <Sparkles className={`h-3 w-3 ${colors.text}`} />
              <span className={`text-[10px] font-bold ${colors.text}`}>{colors.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 物品列表 */}
      <section className="space-y-3">
        {loading && (
          <div className="rounded-xl border border-[#494847]/10 bg-[#1a1919] p-8 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#494847] border-t-[#fcc025]" />
            <p className="text-sm font-bold text-[#adaaaa]">載入物品目錄...</p>
          </div>
        )}

        {!loading && filteredItems.length === 0 && (
          <div className="rounded-xl border border-[#494847]/10 bg-[#1a1919] p-8 text-center">
            <Package className="mx-auto mb-3 h-12 w-12 text-[#494847]" />
            <p className="text-sm font-bold text-[#adaaaa]">暫無符合條件的物品</p>
          </div>
        )}

        {filteredItems.map((item) => {
          const rarity = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
          const TypeIcon = TYPE_ICONS[item.type] || Gift;
          
          return (
            <div
              key={item.id}
              className={`rounded-xl border p-4 transition-all ${rarity.border} ${rarity.bg}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0e0e0e]">
                  <span className="text-2xl">{item.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-bold truncate ${rarity.text}`}>{item.name}</h3>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${rarity.bg} ${rarity.text}`}>
                      {rarity.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[#adaaaa] line-clamp-2">
                    {item.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 rounded bg-[#0e0e0e] px-2 py-1 text-[9px] font-bold text-[#adaaaa]">
                      <TypeIcon className="h-3 w-3" />
                      {item.type === 'avatar' ? '頭像' : 
                       item.type === 'title' ? '稱號' : 
                       item.type === 'buff' ? '增益' : '道具'}
                    </span>
                    <span className="rounded bg-[#0e0e0e] px-2 py-1 text-[9px] font-bold text-[#fcc025]">
                      {item.howToGet}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* 獲取方式總覽 */}
      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
        <h2 className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
          物品獲取方式
        </h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fcc025]/10">
              <Gift className="h-4 w-4 text-[#fcc025]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">商店購買</h3>
              <p className="text-xs font-bold text-[#adaaaa]">使用子熙幣在獎勵商店購買限定頭像與稱號</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
              <Crown className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">管理員授予</h3>
              <p className="text-xs font-bold text-[#adaaaa]">特殊活動或貢獻獲得的限定物品</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Sword className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">寶箱開啟</h3>
              <p className="text-xs font-bold text-[#adaaaa]">遊戲內獲得的寶箱有機率開出稀有物品</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Heart className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">活動獲得</h3>
              <p className="text-xs font-bold text-[#adaaaa]">參與限時活動完成任務獲得專屬獎勵</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
