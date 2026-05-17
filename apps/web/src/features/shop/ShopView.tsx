import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, RefreshCw, Coins, ShoppingBag, ChevronLeft, Gift, Zap, Shield, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';
import { useAuthStore } from '../../store/useAuthStore';
import { ITEM_DROP_TABLES, RARITY_NAMES } from '@repo/shared';

const ITEM_MAP: Record<string, { name: string; icon: string; rarity: string; color: string }> = {};
for (const rarity of Object.keys(ITEM_DROP_TABLES) as (keyof typeof ITEM_DROP_TABLES)[]) {
  for (const item of ITEM_DROP_TABLES[rarity]) {
    ITEM_MAP[item.id] = {
      name: item.name,
      icon: item.icon,
      rarity,
      color: RARITY_NAMES[rarity]?.color || '#b0b0b0',
    };
  }
}

const RARITY_COLORS: Record<string, string> = {
  common: '#b0b0b0',
  rare: '#4fc3f7',
  epic: '#ba68c8',
  legendary: '#ffd54f',
  mythic: '#ff6f00',
};

const PAWN_PRICES: Record<string, number> = {
  common: 10,
  rare: 50,
  epic: 250,
  legendary: 1000,
  mythic: 5000,
};

function formatBalance(raw: string | undefined): string {
  if (!raw) return '0';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export default function ShopView() {
  const { sessionId, isAuthorized } = useAuthStore();
  const [tab, setTab] = useState<'shop' | 'pawn'>('shop');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [balance, setBalance] = useState('0');
  const [ownedAvatars, setOwnedAvatars] = useState<string[]>([]);
  const [ownedTitles, setOwnedTitles] = useState<string[]>([]);

  // ── Pawn state ───────────────────────────────────────────────────────────
  const [invItems, setInvItems] = useState<any[]>([]);
  const [pawnLoading, setPawnLoading] = useState(false);
  const [sellingId, setSellingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, summaryRes, invRes, pawnInvRes] = await Promise.all([
        api.get('/api/v1/rewards/catalog'),
        api.get('/api/v1/wallet/summary', { params: { sessionId } }).catch(() => null),
        api.get('/api/v1/inventory', { params: { sessionId } }).catch(() => null),
        api.get('/api/v1/inventory', { params: { sessionId } }).catch(() => null),
      ]);
      const catalog = catalogRes.data?.data?.customItems || [];
      const shopItems = catalog.filter((i: any) => i.source === 'shop' && Number(i.price) > 0);
      setItems(shopItems);
      if (invRes?.data?.data) {
        setOwnedAvatars(invRes.data.data.ownedAvatars || []);
        setOwnedTitles(invRes.data.data.ownedTitles || []);
      }
      if (pawnInvRes?.data?.data?.items) {
        setInvItems(pawnInvRes.data.data.items.filter((i: any) => i.type !== 'avatar' && i.type !== 'title'));
      }
      if (summaryRes?.data?.data) {
        const s = summaryRes.data.data;
        const bal = s?.summary?.balances?.ZXC || s?.balances?.zhixi?.balance || '0';
        setBalance(String(bal));
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const [chests, setChests] = useState<any[]>([]);
  const [buyingChest, setBuyingChest] = useState<string | null>(null);

  const fetchChests = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/chests');
      if (res.data?.success) setChests(res.data.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchChests();
  }, [fetchChests]);

  async function handleBuyChest(chestType: string) {
    if (!sessionId) return;
    setBuyingChest(chestType);
    setMsg(null);
    try {
      const res = await api.post('/api/v1/chests/buy', { sessionId, chestType });
      if (res.data?.success) {
        setMsg(`✅ ${chestType === 'common' ? '普通' : chestType === 'rare' ? '稀有' : chestType === 'epic' ? '史詩' : '傳奇'}寶箱 已放入背包！`);
        const newBal = res.data.data?.balanceAfter;
        if (newBal) setBalance(newBal);
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg(`❌ ${res.data?.error || '購買失敗'}`);
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (err: any) {
      setMsg(`❌ ${err?.response?.data?.data?.error || err?.message || '購買失敗'}`);
      setTimeout(() => setMsg(null), 3000);
    } finally {
      setBuyingChest(null);
    }
  }

  async function handleBuy(itemId: string) {
    if (!sessionId) return;
    setBuyingId(itemId);
    setMsg(null);
    try {
      const res = await api.post('/api/v1/inventory/buy', { sessionId, itemId });
      if (res.data?.success) {
        setMsg(`${res.data.data?.name || itemId} 購買成功！`);
        const newBal = res.data.data?.balanceAfter;
        if (newBal) setBalance(newBal);
        fetchItems();
      } else {
        setMsg(res.data?.error || '購買失敗');
      }
    } catch (err: any) {
      setMsg(err?.response?.data?.data?.error || err?.message || '購買失敗');
    } finally {
      setBuyingId(null);
    }
  }

  async function handlePawnSell(itemId: string, quantity: number = 1) {
    if (!sessionId || sellingId) return;
    setSellingId(itemId);
    setMsg(null);
    try {
      const res = await api.post('/api/v1/pawn/sell', { sessionId, itemId, quantity });
      if (res.data?.success) {
        setMsg(`典當成功！獲得 +${res.data.data.payout} ZXC`);
        setBalance(res.data.data.balanceAfter);
        fetchItems();
      } else {
        setMsg(res.data?.error || '典當失敗');
      }
    } catch (err: any) {
      setMsg(err?.response?.data?.data?.error || err?.message || '典當失敗');
    } finally {
      setSellingId(null);
    }
  }

  const visibleItems = useMemo(() => items.filter((item: any) => {
    const meta = item.meta as Record<string, any> | undefined;
    const bundle = meta?.bundle as Array<{ id: string; qty?: number }> | undefined;
    if (bundle) {
      const ownedAvatarOrTitles = bundle.filter(
        (s) => ownedAvatars.includes(s.id) || ownedTitles.includes(s.id),
      );
      const allAvatarOrTitles = bundle.filter((s) => ITEM_MAP[s.id]?.rarity);
      return allAvatarOrTitles.length === 0 || ownedAvatarOrTitles.length < allAvatarOrTitles.length;
    }
    if (item.type === 'avatar' && ownedAvatars.includes(item.itemId)) return false;
    if (item.type === 'title' && ownedTitles.includes(item.itemId)) return false;
    return true;
  }), [items, ownedAvatars, ownedTitles]);

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Link to="/app/wallet" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
              <ChevronLeft size={24} />
            </Link>
            <ShoppingBag className="text-[#fcc025]" />
            <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">商店</h1>
          </div>
        </div>
        <div className="flex max-w-2xl mx-auto px-6 gap-4">
          <button
            onClick={() => setTab('shop')}
            className={`pb-2 text-sm font-black uppercase tracking-widest transition-colors ${tab === 'shop' ? 'text-[#fcc025] border-b-2 border-[#fcc025]' : 'text-[#adaaaa]'}`}
          >
            商城
          </button>
          <button
            onClick={() => setTab('pawn')}
            className={`pb-2 text-sm font-black uppercase tracking-widest transition-colors ${tab === 'pawn' ? 'text-[#fcc025] border-b-2 border-[#fcc025]' : 'text-[#adaaaa]'}`}
          >
            當舖
          </button>
        </div>
      </header>

      <main className="pt-28 px-6 max-w-2xl mx-auto space-y-6">
        <section className="bg-[#1a1919] rounded-2xl p-4 border border-[#494847]/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-[#fcc025]" />
            <span className="text-xs font-black uppercase tracking-widest text-[#adaaaa]">ZXC 餘額</span>
          </div>
          <span className="text-lg font-black italic text-[#fcc025]">{formatBalance(balance)}</span>
        </section>

        {tab === 'shop' && (
          <>
          <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#fcc025]/20">
          <div className="flex items-center gap-2 mb-4">
            <Gift size={16} className="text-[#fcc025]" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white">寶箱</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {chests.map((chest: any) => {
              const boughtHere = buyingChest === chest.id;
              return (
                <div key={chest.id} className="bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/20">
                  <Gift className="w-8 h-8 mx-auto mb-2 text-[#fcc025]" />
                  <p className="text-xs font-bold text-white text-center truncate">{chest.name}</p>
                  <p className="text-[10px] font-black text-[#fcc025] text-center mt-1">{chest.price.toLocaleString()} ZXC</p>
                  <button
                    onClick={() => handleBuyChest(chest.id)}
                    disabled={boughtHere || !sessionId}
                    className="mt-2 w-full text-[10px] font-black uppercase tracking-widest bg-[#fcc025] text-[#0e0e0e] py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {boughtHere ? <Loader2 size={10} className="animate-spin mx-auto" /> : '購買'}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[9px] text-center text-[#adaaaa]">
            購買後會放入背包，可到<Link to="/app/inventory" className="text-[#fcc025] underline">道具背包</Link>開啟
          </p>
        </section>

        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">商城商品</h2>
            <button onClick={fetchItems} className="text-[#adaaaa] hover:text-white transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[#fcc025]" />
            </div>
          )}

          {!loading && visibleItems.length === 0 && (
            <p className="text-sm text-[#adaaaa] text-center py-8">目前暫無商品</p>
          )}

          <div className="space-y-3">
            {visibleItems.map((item: any) => {
              const meta = item.meta as Record<string, any> | undefined;
              const bundle = meta?.bundle as Array<{ id: string; qty?: number }> | undefined;
              const totalValue = Number(meta?.totalValue) || 0;
              const price = Number(item.price) || 0;
              const hasDiscount = bundle && totalValue > 0 && price < totalValue;

              return (
                <div key={item.itemId} className="flex items-center gap-4 bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/20">
                  <div className="text-2xl shrink-0">{item.icon || '📦'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{item.name}</p>
                    <p className="text-[10px] text-[#adaaaa] truncate">{item.description || ''}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold uppercase" style={{ color: RARITY_COLORS[item.rarity] || '#b0b0b0' }}>
                        {item.rarity}
                      </span>
                      {bundle && (
                        <span className="text-[10px] font-bold text-emerald-400">📦 組合包</span>
                      )}
                    </div>
                    {bundle && (
                      <div className="mt-1.5 space-y-1">
                        {bundle.map((sub: any, i: number) => {
                            const info = ITEM_MAP[sub.id];
                            return (
                              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                                <span className="shrink-0">{info?.icon || '•'}</span>
                                <span className="text-white font-medium">{info?.name || sub.id}</span>
                                {(sub.qty || 1) > 1 && <span className="text-[#adaaaa]">×{sub.qty}</span>}
                              </div>
                            );
                          })}
                      </div>
                    )}
                    {hasDiscount && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-[#adaaaa] line-through">{totalValue.toLocaleString()} ZXC</span>
                        <span className="text-sm font-black text-emerald-400">{price.toLocaleString()} ZXC</span>
                        <span className="text-[9px] font-black bg-emerald-400/20 text-emerald-400 px-1.5 py-0.5 rounded">
                          -{Math.round((1 - price / totalValue) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs font-black text-[#fcc025]">{price.toLocaleString()} ZXC</span>
                    <button
                      onClick={() => handleBuy(item.itemId)}
                      disabled={buyingId === item.itemId || !sessionId}
                      className="text-[10px] font-black uppercase tracking-widest bg-[#fcc025] text-[#0e0e0e] px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {buyingId === item.itemId ? <Loader2 size={10} className="animate-spin" /> : '購買'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </section>
          </>
        )}

        {tab === 'pawn' && (
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <Trash2 size={16} className="text-[#fcc025]" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white">當舖</h2>
          </div>
          <p className="text-[10px] text-[#adaaaa] mb-4">將不需要的道具典當換取 ZXC</p>
          {invItems.length === 0 ? (
            <p className="text-sm text-[#adaaaa] text-center py-8">暫無可典當的道具</p>
          ) : (
            <div className="space-y-3">
              {invItems.map((item: any) => {
                const price = PAWN_PRICES[item.rarity] || 5;
                return (
                  <div key={item.id} className="flex items-center gap-4 bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/20">
                    <div className="text-2xl shrink-0">{item.icon || '📦'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-[#adaaaa] truncate">{item.description || ''}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold uppercase" style={{ color: RARITY_COLORS[item.rarity] || '#b0b0b0' }}>
                          {item.rarity}
                        </span>
                        <span className="text-[10px] text-[#adaaaa]">×{item.quantity}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-black text-emerald-400">+{price} ZXC</span>
                      <button
                        onClick={() => handlePawnSell(item.id, 1)}
                        disabled={sellingId === item.id || !sessionId}
                        className="text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-red-500/30 transition-colors"
                      >
                        {sellingId === item.id ? <Loader2 size={10} className="animate-spin" /> : '典當'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}

      </main>

      {msg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-[#1a1919] border border-[#fcc025]/40 shadow-lg shadow-black/50 text-sm font-bold text-white animate-[fadeIn_0.3s_ease-out] whitespace-nowrap">
          {msg}
        </div>
      )}

      <AppBottomNav current="shop" />
    </div>
  );
}
