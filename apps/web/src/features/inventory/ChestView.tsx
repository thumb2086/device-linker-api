import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Package, Sparkles, ChevronRight, X, Shield, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';

interface ChestConfig {
  id: string;
  name: string;
  nameEn: string;
  price: number;
  dropCount: { min: number; max: number };
  pityThreshold: number;
  rarities: {
    rarity: string;
    name: string;
    color: string;
    chance: number;
  }[];
}

interface ChestItem {
  item: {
    id: string;
    name: string;
    nameEn: string;
    type: string;
    rarity: string;
    description: string;
    icon: string;
  };
  isNew: boolean;
  quantity: number;
}

interface InventoryEntry {
  id: string;
  name: string;
  nameEn?: string;
  type: string;
  rarity: string;
  description?: string;
  icon: string;
  quantity: number;
  consumable?: boolean;
  tradable?: boolean;
  rarityColor?: string;
  rarityName?: string;
  effect?: { type: string; value?: number; duration?: number };
}

interface ActiveBuff {
  id: string;
  type: string;
  value: number;
  remaining?: number;
  expiresAt?: string | null;
  source?: string;
}

interface InventoryState {
  items: InventoryEntry[];
  activeBuffs: ActiveBuff[];
  ownedAvatars: string[];
  ownedTitles: string[];
  activeAvatar?: string;
  activeTitle?: string;
}

interface ChestStatus {
  chestPity: Record<string, number>;
  keyCounts: Record<string, number>;
  nextFreeChestAvailable: boolean;
  dailyFreeChestType: string;
  dailyFreeCooldownHours: number;
  balance: string;
  inventorySlotsUsed: number;
  inventorySlotsMax: number;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#b0b0b0',
  rare: '#4fc3f7',
  epic: '#ba68c8',
  legendary: '#ffd54f',
  mythic: '#ff6f00',
};

const BUFF_TYPE_LABEL: Record<string, string> = {
  prevent_loss: '免輸護符',
  xp_boost: '經驗加成',
  luck_boost: '幸運加成',
  vip_trial: 'VIP 體驗',
  buff: 'Buff',
};

function formatExpires(expiresAt?: string | null): string {
  if (!expiresAt) return '';
  const ts = Date.parse(expiresAt);
  if (!Number.isFinite(ts)) return '';
  const diff = ts - Date.now();
  if (diff <= 0) return '已過期';
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `剩餘 ${mins} 分鐘`;
  const hrs = Math.ceil(mins / 60);
  return `剩餘 ${hrs} 小時`;
}

export default function ChestView() {

  const navigate = useNavigate();
  const [chests, setChests] = useState<ChestConfig[]>([]);
  const [status, setStatus] = useState<ChestStatus | null>(null);
  const [inventory, setInventory] = useState<InventoryState>({
    items: [],
    activeBuffs: [],
    ownedAvatars: [],
    ownedTitles: [],
  });
  const [useStatusMessage, setUseStatusMessage] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [useQty, setUseQty] = useState<Record<string, number>>({});
  const [giftDialog, setGiftDialog] = useState<{ itemId: string; name: string; maxQty: number } | null>(null);
  const [giftAddress, setGiftAddress] = useState('');
  const [giftQty, setGiftQty] = useState(1);
  const [giftSending, setGiftSending] = useState(false);
  const [recipients, setRecipients] = useState<Array<{ address: string; displayName: string }>>([]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const pity = status?.chestPity || {};
  const keyCounts = status?.keyCounts || {};
  const [localPity, setLocalPity] = useState<Record<string, number> | null>(null);
  const [localKeyCounts, setLocalKeyCounts] = useState<Record<string, number> | null>(null);
  const displayPity = localPity || pity;
  const displayKeyCounts = localKeyCounts || keyCounts;

  const fetchRecipients = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/gift/recipients");
      if (res.data?.success) setRecipients(res.data.data.users);
    } catch (err) {
      console.error("Failed to fetch recipients:", err);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/chests/status');
      if (res.data?.success) setStatus(res.data.data);
    } catch (err) {
      console.error('Failed to fetch chest status:', err);
    }
  }, []);

  const refreshInventory = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/inventory');
      if (res.data?.success) setInventory(res.data.data);
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    }
  }, []);

  useEffect(() => {
    fetchRecipients();
    (async () => {
      try {
        const res = await api.get('/api/v1/chests');
        if (res.data?.success) setChests(res.data.data);
      } catch (err) {
        console.error('Failed to fetch chests:', err);
      }
    })();
    refreshStatus();
    refreshInventory();
  }, [refreshStatus, refreshInventory, fetchRecipients]);

  const [opening, setOpening] = useState(false);
  const [openQty, setOpenQty] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [openedItems, setOpenedItems] = useState<ChestItem[]>([]);
  const [openCompensation, setOpenCompensation] = useState(0);

  const handleOpen = async (chestId: string, quantity: number) => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await api.post('/api/v1/chests/open', { chestId, quantity });
      if (res.data?.success) {
        const { items, compensation, status: nextStatus } = res.data.data;
        setOpenedItems(items);
        setOpenCompensation(compensation);
        setLocalPity(nextStatus.chestPity);
        setLocalKeyCounts(nextStatus.keyCounts);
        setShowResult(true);
        await refreshInventory();
        await refreshStatus();
      } else {
        showToast(res.data?.error || '開啟失敗');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || '網路錯誤');
    } finally {
      setOpening(false);
    }
  };

  const useItem = async (itemId: string, quantity: number = 1) => {
    setUseStatusMessage('正在處理...');
    try {
      const res = await api.post('/api/v1/inventory/use', { itemId, quantity });
      if (res.data?.success) {
        showToast(`成功使用 ${res.data.data.usedCount} 個物品`);
        if (res.data.data.message) showToast(res.data.data.message);
        await refreshInventory();
      } else {
        showToast(res.data?.error || '使用失敗');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || '使用失敗');
    } finally {
      setUseStatusMessage(null);
    }
  };

  const groupedItems = inventory.items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, InventoryEntry[]>);

  const itemTypeLabels: Record<string, string> = {
    chest_key: '鑰匙',
    token: '代幣',
    buff: '加成',
    avatar: '頭像',
    title: '稱號',
    collectible: '收藏品',
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Package className="text-[#fcc025]" />
            <div>
              <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
                物資中心
              </h1>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#adaaaa]">
                背包與補給
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#adaaaa]">空間</p>
            <p className="text-sm font-black text-white">
              {status?.inventorySlotsUsed || 0}
              <span className="mx-1 text-[#494847]">/</span>
              {status?.inventorySlotsMax || 0}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-24 space-y-8">
        {/* Active Buffs */}
        {inventory.activeBuffs.length > 0 && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {inventory.activeBuffs.map((buff) => (
              <div key={buff.id} className="relative overflow-hidden rounded-xl border border-[#fcc025]/20 bg-[#1a1919] p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fcc025]/10 text-[#fcc025]">
                    {buff.type === 'prevent_loss' ? <Shield size={16} /> : <Zap size={16} />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#adaaaa]">
                      {BUFF_TYPE_LABEL[buff.type] || '加成'}
                    </p>
                    <p className="text-xs font-black text-white">
                      {buff.type === 'prevent_loss' ? `x${buff.remaining}` : `+${buff.value * 100}%`}
                    </p>
                  </div>
                </div>
                <div className="mt-2 text-[10px] font-bold text-[#adaaaa] opacity-60">
                  {buff.expiresAt ? formatExpires(buff.expiresAt) : '生效中'}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Chests */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#adaaaa]">可開啟寶箱</h2>
            <div className="flex gap-2">
              {[1, 5, 10].map((q) => (
                <button
                  key={q}
                  onClick={() => setOpenQty(q)}
                  className={`rounded-md px-3 py-1 text-[10px] font-black transition-all ${
                    openQty === q ? 'bg-[#fcc025] text-black shadow-lg shadow-[#fcc025]/20' : 'bg-[#1a1919] text-[#adaaaa] border border-[#494847]/30'
                  }`}
                >
                  x{q}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {chests.map((chest) => {
              const keys = displayKeyCounts[chest.id] || 0;
              const currentPity = displayPity[chest.id] || 0;
              const canOpen = keys >= openQty;

              return (
                <div key={chest.id} className="group relative overflow-hidden rounded-2xl border border-[#494847]/20 bg-[#1a1919] p-5 transition-all hover:border-[#fcc025]/30">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-black text-white">{chest.name}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded bg-[#fcc025]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#fcc025]">
                          {keys} 把鑰匙
                        </span>
                      </div>
                    </div>
                    <div className="text-4xl">📦</div>
                  </div>

                  <div className="mb-6 space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[#adaaaa]">
                      <span>保底進度</span>
                      <span className="text-[#fcc025]">{currentPity} / {chest.pityThreshold}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0e0e0e]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(currentPity / chest.pityThreshold) * 100}%` }}
                        className="h-full bg-gradient-to-r from-[#fcc025] to-[#e6ad03]"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpen(chest.id, openQty)}
                    disabled={!canOpen || opening}
                    className={`w-full rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all ${
                      canOpen
                        ? 'bg-[#fcc025] text-black shadow-lg shadow-[#fcc025]/20 hover:brightness-110 active:scale-[0.98]'
                        : 'bg-[#494847]/20 text-[#494847] cursor-not-allowed border border-[#494847]/10'
                    }`}
                  >
                    {opening ? '解鎖中...' : `開啟 ${openQty} 個`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Inventory Items */}
        <section className="space-y-6">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#adaaaa]">我的物資</h2>
          {chests.length > 0 && inventory.items.length === 0 ? (
             <div className="rounded-2xl border-2 border-dashed border-[#494847]/20 py-12 text-center">
                <Package className="mx-auto mb-4 h-12 w-12 text-[#494847]/40" />
                <p className="text-sm font-bold text-[#adaaaa]">目前沒有任何物資</p>
             </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedItems).map(([type, items]) => (
                <div key={type} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-[#494847]/20" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#adaaaa]">
                      {itemTypeLabels[type] || type}
                    </span>
                    <div className="h-px flex-1 bg-[#494847]/20" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {items.map((item) => (
                      <div key={item.id} className="flex flex-col rounded-xl border border-[#494847]/20 bg-[#1a1919] p-3 transition-colors hover:border-[#fcc025]/10">
                        <div className="mb-2 flex items-start justify-between">
                          <span className="text-2xl">{item.icon}</span>
                          <span className="rounded bg-[#262626] px-1.5 py-0.5 text-[10px] font-black text-[#adaaaa]">
                            x{item.quantity}
                          </span>
                        </div>
                        <h4 className="mb-1 truncate text-xs font-black text-white">{item.name}</h4>
                        <p className="mb-3 line-clamp-2 text-[10px] font-bold text-[#adaaaa] opacity-60 leading-relaxed min-h-[2.4em]">
                          {item.description}
                        </p>

                        {item.consumable && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <input
                              type="number"
                              min="1"
                              max={item.quantity}
                              value={useQty[item.id] || 1}
                              onChange={(e) => {
                                const v = parseInt(e.target.value) || 1;
                                setUseQty(prev => ({ ...prev, [item.id]: Math.max(1, Math.min(item.quantity, v)) }));
                              }}
                              className="w-12 bg-[#0e0e0e] border border-[#494847]/40 rounded-lg text-white font-bold text-xs text-center focus:outline-none focus:border-[#fcc025]"
                            />
                            <button
                              onClick={() => useItem(item.id, useQty[item.id] || 1)}
                              className="flex-1 bg-[#fcc025] text-black font-black text-sm py-2 rounded-lg hover:bg-[#e6ad03]"
                            >
                              使用
                            </button>
                            <button
                              onClick={() =>
                                setGiftDialog({ itemId: item.id, name: item.name, maxQty: item.quantity })
                              }
                              className="flex-1 border border-[#fcc025] text-[#fcc025] font-black text-sm py-2 rounded-lg hover:bg-[#fcc025]/10"
                            >
                              贈送
                            </button>
                          </div>
                        )}
                        {!item.consumable && (item.type === 'avatar' || item.type === 'title') && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => useItem(item.id)}
                              className="flex-1 border border-[#fcc025] text-[#fcc025] font-black text-sm py-2 rounded-lg hover:bg-[#fcc025] hover:text-black"
                            >
                              裝備
                            </button>
                            <button
                              onClick={() =>
                                setGiftDialog({ itemId: item.id, name: item.name, maxQty: item.quantity })
                              }
                              className="flex-1 border border-[#fcc025] text-[#fcc025] font-black text-sm py-2 rounded-lg hover:bg-[#fcc025]/10"
                            >
                              贈送
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <AppBottomNav current="none" />

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-[#fcc025] text-black px-6 py-3 rounded-full font-black shadow-2xl"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Modal */}
      <AnimatePresence>
        {showResult && openedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-start justify-center pt-12 pb-24 p-4"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-3xl w-full max-h-[75vh] flex flex-col"
            >
              <h2 className="text-3xl font-black italic text-center text-[#fcc025] mb-6">
                恭喜獲得!
              </h2>

              <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 pr-1 scrollbar-thin">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2 mb-6">
                  {[...openedItems]
                    .sort((a, b) => {
                      const order = ['common', 'rare', 'epic', 'legendary', 'mythic'];
                      return order.indexOf(b.item.rarity) - order.indexOf(a.item.rarity);
                    })
                    .map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: index * 0.03, type: 'spring' }}
                      className="bg-[#1a1919] rounded-xl p-2 border-2 text-center relative"
                      style={{ borderColor: RARITY_COLORS[item.item.rarity] || '#494847' }}
                    >
                      {(item.quantity || 0) > 1 && (
                        <span className="absolute -top-2 -right-2 bg-[#fcc025] text-black text-xs font-black min-w-[20px] h-5 rounded-full flex items-center justify-center px-1 shadow-lg z-10">
                          x{item.quantity}
                        </span>
                      )}
                      <div className="text-2xl mb-1">{item.item.icon}</div>
                      <h3 className="font-bold text-xs mb-0.5 truncate">{item.item.name}</h3>
                      <p className="text-xs text-[#adaaaa] mb-1 truncate">{item.item.description}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className="text-xs px-1 py-0.5 rounded-full font-bold"
                          style={{
                            backgroundColor: `${RARITY_COLORS[item.item.rarity]}30`,
                            color: RARITY_COLORS[item.item.rarity],
                          }}
                        >
                          {item.item.rarity}
                        </span>
                        {item.isNew && (
                          <span className="text-xs bg-[#fcc025] text-black px-1 py-0.5 rounded-full font-bold">
                            NEW
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {openCompensation > 0 && (
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-3 bg-gradient-to-br from-[#fcc025]/20 to-[#e6ad03]/10 border border-[#fcc025]/40 rounded-2xl px-6 py-4 shadow-lg shadow-[#fcc025]/5">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#fcc025] to-[#e6ad03] flex items-center justify-center shadow-lg">
                      <span className="text-lg">🪙</span>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black uppercase tracking-widest text-[#adaaaa]">重複補償</p>
                      <p className="text-lg font-black italic text-[#fcc025]">+{openCompensation} ZXC</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-center">
                <button
                  onClick={() => {
                    setOpenQty(1);
                    setShowResult(false);
                    navigate('/app/inventory');
                  }}
                  className="bg-[#494847] hover:bg-[#5a5858] text-white font-bold px-8 py-3
                    rounded-xl transition-colors inline-flex items-center gap-2"
                >
                  繼續
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift Dialog */}
      <AnimatePresence>
        {giftDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setGiftDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1a1919] rounded-2xl p-6 max-w-sm w-full border border-[#494847]/30"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-black">贈送 {giftDialog.name}</h2>
                <button onClick={() => setGiftDialog(null)}>
                  <X className="w-5 h-5 text-[#adaaaa]" />
                </button>
              </div>

              <label className="block text-sm font-bold text-[#adaaaa] mb-1">接收者</label>
              <select
                value={giftAddress}
                onChange={(e) => setGiftAddress(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#494847]/40 rounded-lg px-3 py-2 text-white text-sm
                  focus:outline-none focus:border-[#fcc025] mb-4"
              >
                <option value="">選擇接收者...</option>
                {recipients.map(r => (
                  <option key={r.address} value={r.address}>
                    {r.displayName} ({r.address.slice(0, 6)}...{r.address.slice(-4)})
                  </option>
                ))}
              </select>

              <label className="block text-sm font-bold text-[#adaaaa] mb-1">數量</label>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setGiftQty(Math.max(1, giftQty - 1))}
                  disabled={giftQty <= 1}
                  className="w-8 h-8 rounded-full bg-[#494847]/40 text-[#fcc025] font-bold text-lg
                    flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed
                    hover:bg-[#494847]/60 transition-colors"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={giftDialog.maxQty}
                  value={giftQty}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 1;
                    setGiftQty(Math.max(1, Math.min(giftDialog.maxQty, v)));
                  }}
                  className="w-16 bg-[#0e0e0e] border border-[#494847]/40 rounded-lg text-white font-bold text-lg text-center
                    focus:outline-none focus:border-[#fcc025] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setGiftQty(Math.min(giftDialog.maxQty, giftQty + 1))}
                  disabled={giftQty >= giftDialog.maxQty}
                  className="w-8 h-8 rounded-full bg-[#494847]/40 text-[#fcc025] font-bold text-lg
                    flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed
                    hover:bg-[#494847]/60 transition-colors"
                >
                  +
                </button>
                <span className="text-sm text-[#adaaaa]">/ {giftDialog.maxQty}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setGiftDialog(null)}
                  className="flex-1 border border-[#494847]/40 text-[#adaaaa] font-bold text-sm py-2 rounded-lg hover:bg-[#494847]/20"
                >
                  取消
                </button>
                <button
                  disabled={giftSending || !giftAddress.trim()}
                  onClick={async () => {
                    if (!giftAddress.trim() || !giftDialog) return;
                    setGiftSending(true);
                    try {
                      const res = await api.post('/api/v1/gift/send', {
                        toAddress: giftAddress.trim(),
                        itemId: giftDialog.itemId,
                        quantity: giftQty,
                      });
                      if (res.data?.success) {
                        showToast('贈送成功！');
                        setGiftDialog(null);
                        setGiftAddress('');
                        setGiftQty(1);
                        await refreshInventory();
                      } else {
                        showToast(res.data?.error || '贈送失敗');
                      }
                    } catch (err: any) {
                      showToast(err?.response?.data?.data?.error || err?.response?.data?.error || '贈送失敗');
                    } finally {
                      setGiftSending(false);
                    }
                  }}
                  className="flex-1 bg-[#fcc025] text-black font-black text-sm py-2 rounded-lg
                    disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#e6ad03]"
                >
                  {giftSending ? '發送中...' : '確認贈送'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
