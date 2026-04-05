import { useEffect, useMemo, useState } from 'react';
import { Crown, Gift, Package, Search, Shield, Sparkles, Zap } from 'lucide-react';
import { api } from '../../../store/api';

interface CatalogItem {
  id: string;
  name?: string;
  label?: string;
  type: 'avatar' | 'title' | 'item' | 'buff';
  rarity?: 'common' | 'rare' | 'legendary' | 'mythic' | 'vip';
  description?: string;
  icon?: string;
  source?: string;
  howToGet: string;
}

const RARITY_STYLES = {
  common: { bg: 'bg-gray-500/20', text: 'text-gray-300', border: 'border-gray-500/30', label: '普通' },
  rare: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30', label: '稀有' },
  legendary: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/30', label: '傳說' },
  mythic: { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/30', label: '神話' },
  vip: { bg: 'bg-[#fcc025]/20', text: 'text-[#fcc025]', border: 'border-[#fcc025]/30', label: 'VIP' },
};

const TYPE_ICONS = {
  avatar: Package,
  title: Crown,
  item: Gift,
  buff: Zap,
};

const getHowToGet = (source?: string) => {
  if (source === 'shop') return '商城兌換';
  if (source === 'admin') return '管理員發放';
  if (source === 'chest') return '寶箱開啟';
  return '活動或任務';
};

export default function ItemsTab() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'avatar' | 'title'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get('/api/v1/rewards/catalog')
      .then((response) => {
        const payload = response.data?.data ?? {};
        const avatars = (payload.avatars ?? []).map((item: any) => ({
          ...item,
          type: 'avatar' as const,
          howToGet: getHowToGet(item.source),
        }));
        const titles = (payload.titles ?? []).map((item: any) => ({
          ...item,
          type: 'title' as const,
          howToGet: getHowToGet(item.source),
        }));
        setItems([...avatars, ...titles]);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const itemName = item.name || item.label || item.id;
        if (filter !== 'all' && item.type !== filter) return false;
        if (search && !itemName.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [filter, items, search],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#494847]" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋頭像、稱號或收藏品"
            className="w-full rounded-xl border border-[#494847]/20 bg-[#1a1919] py-3 pl-10 pr-4 text-sm font-bold text-white placeholder:text-[#494847] focus:border-[#fcc025]/50 focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          {([
            ['all', '全部'],
            ['avatar', '頭像'],
            ['title', '稱號'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                filter === value
                  ? 'bg-[#fcc025] text-black'
                  : 'border border-[#494847]/20 bg-[#1a1919] text-[#adaaaa]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-4">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">稀有度說明</h2>
        <div className="flex flex-wrap gap-2">
          {Object.values(RARITY_STYLES).map((style) => (
            <div key={style.label} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${style.border} ${style.bg}`}>
              <Sparkles className={`h-3 w-3 ${style.text}`} />
              <span className={`text-[10px] font-bold ${style.text}`}>{style.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {loading && (
          <div className="rounded-xl border border-[#494847]/10 bg-[#1a1919] p-8 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#494847] border-t-[#fcc025]" />
            <p className="text-sm font-bold text-[#adaaaa]">載入圖鑑中...</p>
          </div>
        )}

        {!loading && filteredItems.length === 0 && (
          <div className="rounded-xl border border-[#494847]/10 bg-[#1a1919] p-8 text-center">
            <Package className="mx-auto mb-3 h-12 w-12 text-[#494847]" />
            <p className="text-sm font-bold text-[#adaaaa]">目前沒有符合條件的物品</p>
          </div>
        )}

        {filteredItems.map((item) => {
          const rarity = RARITY_STYLES[item.rarity ?? 'common'];
          const TypeIcon = TYPE_ICONS[item.type] || Gift;
          const itemName = item.name || item.label || item.id;

          return (
            <div key={`${item.type}-${item.id}`} className={`rounded-xl border p-4 transition-all ${rarity.border} ${rarity.bg}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0e0e0e] text-2xl">
                  {item.icon || '🎁'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`truncate font-bold ${rarity.text}`}>{itemName}</h3>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${rarity.bg} ${rarity.text}`}>
                      {rarity.label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-bold text-[#adaaaa]">{item.description || '暫無說明'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 rounded bg-[#0e0e0e] px-2 py-1 text-[9px] font-bold text-[#adaaaa]">
                      <TypeIcon className="h-3 w-3" />
                      {item.type === 'avatar' ? '頭像' : item.type === 'title' ? '稱號' : item.type}
                    </span>
                    <span className="rounded bg-[#0e0e0e] px-2 py-1 text-[9px] font-bold text-[#fcc025]">{item.howToGet}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
        <h2 className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">取得方式說明</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fcc025]/10">
              <Gift className="h-4 w-4 text-[#fcc025]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">商城兌換</h3>
              <p className="text-xs font-bold text-[#adaaaa]">可直接使用代幣購買，適合穩定收集常駐項目。</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
              <Crown className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">管理員發放</h3>
              <p className="text-xs font-bold text-[#adaaaa]">通常用於活動獎勵、特殊成就或人工補發。</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Zap className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">寶箱開啟</h3>
              <p className="text-xs font-bold text-[#adaaaa]">透過寶箱隨機抽出，通常會搭配稀有度分布。</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Shield className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">活動或任務</h3>
              <p className="text-xs font-bold text-[#adaaaa]">節慶活動、排行榜或每日任務都可能發放限定項目。</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
