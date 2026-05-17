import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Package, Sparkles, ChevronRight, X, Shield, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
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
  const remaining = ts - Date.now();
  if (remaining <= 0) return '已過期';
  const hours = Math.ceil(remaining / (1000 * 60 * 60));
  return `${hours} 小時內有效`;
}

export default function ChestView() {
  const navigate = useNavigate();
  const [chests, setChests] = useState<ChestConfig[]>([]);
  const [selectedChest, setSelectedChest] = useState<ChestConfig | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [openQty, setOpenQty] = useState(1);
  const [openedItems, setOpenedItems] = useState<ChestItem[]>([]);
  const [openCompensation, setOpenCompensation] = useState(0);
  const [showResult, setShowResult] = useState(false);
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
    (async () => {
      try {
        const res = await api.get('/api/v1/chests');
        if (res.data?.success) setChests(res.data.data);
      } catch (err) {
        console.error('Failed to fetch chests:', err);
      }
    })();
    void refreshStatus();
    void refreshInventory();
  }, [refreshStatus, refreshInventory]);

  const openChest = async (chestType: string, free = false) => {
    if (isOpening) return;

    setIsOpening(true);
    setShowResult(false);
    setOpenedItems([]);

    try {
      const qty = free ? 1 : openQty;
      const endpoint = qty > 1 ? '/api/v1/chests/open-bulk' : '/api/v1/chests/open';
      const body = qty > 1 ? { chestType, quantity: qty } : { chestType, free };
      const res = await api.post(endpoint, body);
      const data = res.data;

      if (data?.success) {
        setOpenedItems(data.data.items);
        const comp = data.data.compensationZXC || 0;
        setOpenCompensation(comp);
        setShowResult(true);
        // Update pity and key counts instantly from response
        const d = data.data;
        if (d.pityCount !== undefined) {
          setLocalPity((prev) => ({ ...(prev || pity), [chestType]: d.pityCount }));
        }
        if (d.keyCounts) {
          setLocalKeyCounts((prev) => ({ ...(prev || keyCounts), ...d.keyCounts }));
        }
        await Promise.all([refreshStatus(), refreshInventory()]);
      } else {
        setSelectedChest(null);
        showToast(data?.error || '開啟失敗');
      }
    } catch (err: any) {
      console.error('Failed to open chest:', err);
      setSelectedChest(null);
      showToast(err?.response?.data?.data?.error || err?.response?.data?.error || '開啟失敗');
    } finally {
      setIsOpening(false);
    }
  };

  const useItem = async (itemId: string, qty: number = 1) => {
    try {
      const res = await api.post('/api/v1/inventory/use', { itemId, quantity: qty });
      if (res.data?.success) {
        showToast(res.data.data.effectSummary || '使用成功');
        await Promise.all([refreshStatus(), refreshInventory()]);
      } else {
        showToast(res.data?.error || '使用失敗');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.data?.error || err?.response?.data?.error || '使用失敗');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0e0e] text-white p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black italic text-[#fcc025]">寶箱</h1>
          <p className="text-sm text-[#adaaaa] mt-1">開啟寶箱獲得稀有道具、頭像與 ZXC</p>
        </div>
      </div>

      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-[#1a1919] border border-[#fcc025]/40 shadow-lg shadow-black/50 text-sm font-bold text-white animate-[fadeIn_0.3s_ease-out] whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* Active Buffs */}
      {inventory.activeBuffs.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#adaaaa] mb-2 flex items-center gap-2">
            <Zap className="w-3 h-3 text-[#fcc025]" />
            生效中的 Buff
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {inventory.activeBuffs.map((buff) => (
              <div
                key={buff.id}
                className="rounded-xl border border-[#fcc025]/30 bg-[#1a1919] p-3 flex items-center gap-2"
              >
                <Shield className="w-5 h-5 text-[#fcc025] flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-black truncate">
                    {BUFF_TYPE_LABEL[buff.type] || buff.type}
                  </div>
                  <div className="text-sm text-[#adaaaa]">
                    {buff.remaining !== undefined
                      ? `剩餘 ${buff.remaining} 次`
                      : formatExpires(buff.expiresAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chest Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {chests.map((chest) => {
          const currentPity = displayPity[chest.id] ?? 0;
          const pityPercent = Math.min(100, (currentPity / chest.pityThreshold) * 100);
          const keys = displayKeyCounts[chest.id] ?? 0;
          return (
            <motion.button
              key={chest.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedChest(chest)}
              className="bg-[#1a1919] rounded-2xl p-4 border border-[#494847]/20 text-left hover:border-[#fcc025]/50 transition-colors"
            >
              <div className="text-4xl mb-2 text-center relative">
                <Gift className="w-10 h-10 mx-auto text-[#fcc025]" />
                {keys > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#fcc025] text-[#0e0e0e] text-sm font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center">
                    {keys}
                  </span>
                )}
              </div>
              <h3 className="font-black text-sm mb-1">{chest.name}</h3>
              <div className="h-1.5 bg-[#494847]/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pityPercent}%`,
                    background: pityPercent >= 100
                      ? 'linear-gradient(90deg, #fcc025, #ff6f00)'
                      : '#fcc025',
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-[#adaaaa]">
                  保底 {currentPity}/{chest.pityThreshold}
                </span>
                {keys > 0 && (
                  <span className="text-sm font-bold text-[#fcc025]">{keys} 把鑰匙</span>
                )}
              </div>
            </motion.button>
          );
        })}
      </section>

      {/* Inventory */}
      <section>
        <h2 className="text-sm font-black uppercase tracking-widest text-[#adaaaa] mb-3 flex items-center gap-2">
          <Package className="w-3 h-3" />
          我的道具（{inventory.items.length}）
        </h2>
        {inventory.items.length === 0 ? (
          <div className="rounded-xl border border-[#494847]/20 bg-[#1a1919] p-8 text-center text-sm text-[#adaaaa]">
            尚未擁有任何道具，開啟寶箱以獲得！
          </div>
        ) : (
          (() => {
            const groups: Record<string, InventoryEntry[]> = {};
            for (const item of inventory.items) {
              const key = item.type || 'other';
              if (!groups[key]) groups[key] = [];
              groups[key].push(item);
            }
            const typeOrder = ['avatar', 'title', 'buff', 'token', 'collectible', 'other'];
            const typeLabels: Record<string, string> = {
              avatar: '頭像',
              title: '稱號',
              buff: 'Buff',
              token: '代幣',
              collectible: '收藏品',
              other: '其他',
            };
            const typeIcons: Record<string, string> = {
              avatar: '🎭',
              title: '👑',
              buff: '⚡',
              token: '🪙',
              collectible: '💎',
              other: '📦',
            };
            return (
              <div className="space-y-6">
                {typeOrder.filter((t) => groups[t]?.length).map((typeKey) => (
                  <div key={typeKey}>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#adaaaa] mb-2 flex items-center gap-2">
                      <span>{typeIcons[typeKey]}</span>
                      {typeLabels[typeKey]}
                      <span className="text-[#494847]">（{groups[typeKey].length}）</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {groups[typeKey].map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border bg-[#1a1919] p-3"
                          style={{ borderColor: item.rarityColor || RARITY_COLORS[item.rarity] || '#494847' }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-3xl">{item.icon}</div>
                            <span
                              className="text-sm font-bold px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${item.rarityColor || RARITY_COLORS[item.rarity]}30`,
                                color: item.rarityColor || RARITY_COLORS[item.rarity],
                              }}
                            >
                              x{item.quantity}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-black truncate">{item.name}</div>
                          <div className="text-sm text-[#adaaaa] line-clamp-2 min-h-[28px]">
                            {item.description}
                          </div>
                          {item.consumable && (
                            <div className="mt-2 flex items-center gap-1">
                              <div className="flex items-center border border-[#494847]/40 rounded-lg overflow-hidden flex-shrink-0">
                                <button
                                  onClick={() =>
                                    setUseQty((prev) => ({
                                      ...prev,
                                      [item.id]: Math.max(1, (prev[item.id] || 1) - 1),
                                    }))
                                  }
                                  className="w-7 h-7 flex items-center justify-center text-sm text-[#adaaaa] hover:text-white hover:bg-[#494847]/40 transition-colors"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={item.quantity}
                                  value={useQty[item.id] || 1}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value) || 1;
                                    setUseQty((prev) => ({
                                      ...prev,
                                      [item.id]: Math.max(1, Math.min(item.quantity, v)),
                                    }));
                                  }}
                                  className="w-10 bg-[#0e0e0e] text-white text-sm font-bold text-center border-x border-[#494847]/40
                                    focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  onClick={() =>
                                    setUseQty((prev) => ({
                                      ...prev,
                                      [item.id]: Math.min(item.quantity, (prev[item.id] || 1) + 1),
                                    }))
                                  }
                                  className="w-7 h-7 flex items-center justify-center text-sm text-[#adaaaa] hover:text-white hover:bg-[#494847]/40 transition-colors"
                                >
                                  +
                                </button>
                              </div>
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
                                className="border border-[#fcc025] text-[#fcc025] font-black text-sm px-3 py-2 rounded-lg hover:bg-[#fcc025]/10"
                              >
                                贈送
                              </button>
                            </div>
                          )}
                          {!item.consumable && (item.type === 'avatar' || item.type === 'title') && (
                            <div className="mt-2 flex gap-1">
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
                                className="border border-[#fcc025] text-[#fcc025] font-black text-sm px-3 py-2 rounded-lg hover:bg-[#fcc025]/10"
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
            );
          })()
        )}
      </section>

      {/* Chest Detail Modal */}
      <AnimatePresence>
        {selectedChest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isOpening && setSelectedChest(null)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1a1919] rounded-2xl p-6 max-w-md w-full border border-[#494847]/30"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-black italic">{selectedChest.name}</h2>
                  <p className="text-sm text-[#adaaaa]">{selectedChest.nameEn}</p>
                </div>
                <button onClick={() => setSelectedChest(null)}>
                  <X className="w-5 h-5 text-[#adaaaa]" />
                </button>
              </div>

              <motion.div
                animate={isOpening ? { rotate: [0, -15, 15, -10, 10, 0], scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.5 }}
                className="text-center my-6"
              >
                <Gift className="w-24 h-24 mx-auto text-[#fcc025]" />
              </motion.div>

              <div className="space-y-2 mb-4 text-sm">
                <h3 className="font-black text-[#adaaaa] uppercase tracking-widest">掉落機率</h3>
                {selectedChest.rarities.map((r) => (
                  <div key={r.rarity} className="flex justify-between items-center">
                    <span className="font-bold" style={{ color: r.color }}>
                      {r.name}
                    </span>
                    <span className="text-[#adaaaa]">{r.chance}%</span>
                  </div>
                ))}
                <div className="text-sm text-[#adaaaa] pt-2 border-t border-[#494847]/20">
                  每次掉落 {selectedChest.dropCount.min}-{selectedChest.dropCount.max} 件，保底 {selectedChest.pityThreshold} 次
                </div>
              </div>

              {/* Quantity selector for opening */}
              <div className="flex items-center justify-center gap-3 mb-2">
                <button
                  onClick={() => setOpenQty(Math.max(1, openQty - 1))}
                  disabled={openQty <= 1}
                  className="w-8 h-8 rounded-full bg-[#494847]/40 text-[#fcc025] font-bold text-lg
                    flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed
                    hover:bg-[#494847]/60 transition-colors"
                >
                  −
                </button>
                <div className="text-center">
                  <input
                    type="number"
                    min={1}
                    max={displayKeyCounts[selectedChest.id] || 99}
                    value={openQty}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 1;
                      const max = displayKeyCounts[selectedChest.id] || 99;
                      setOpenQty(Math.max(1, Math.min(max, v)));
                    }}
                    className="w-16 bg-[#0e0e0e] border border-[#494847]/40 rounded-lg text-white font-bold text-lg text-center
                      focus:outline-none focus:border-[#fcc025] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="text-sm text-[#adaaaa]">
                    鑰匙 {displayKeyCounts[selectedChest.id] || 0} 把
                  </div>
                </div>
                <button
                  onClick={() => {
                    const max = displayKeyCounts[selectedChest.id] || 99;
                    setOpenQty(Math.min(max, openQty + 1));
                  }}
                  disabled={openQty >= (displayKeyCounts[selectedChest.id] || 99)}
                  className="w-8 h-8 rounded-full bg-[#494847]/40 text-[#fcc025] font-bold text-lg
                    flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed
                    hover:bg-[#494847]/60 transition-colors"
                  >
                  +
                </button>
              </div>

              <button
                onClick={() => openChest(selectedChest.id)}
                disabled={isOpening}
                className="w-full bg-gradient-to-r from-[#fcc025] to-[#e6ad03] text-black font-black
                  py-4 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {isOpening ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="w-5 h-5" />
                    </motion.div>
                    開啟中...
                  </>
                ) : (
                  <>
                    <Gift className="w-5 h-5" />
                    開啟{openQty > 1 ? ` ${openQty} 個` : '寶箱'}
                  </>
                )}
              </button>
              <Link
                to="/app/shop"
                className="mt-2 block w-full text-center text-sm font-bold text-[#adaaaa] hover:text-[#fcc025] transition-colors"
              >
                前往商店購買寶箱 ↗
              </Link>
            </motion.div>
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
                        <span className="absolute -top-2 -right-2 bg-[#fcc025] text-black text-[10px] font-black min-w-[20px] h-5 rounded-full flex items-center justify-center px-1 shadow-lg z-10">
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
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#adaaaa]">重複補償</p>
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

              <label className="block text-sm font-bold text-[#adaaaa] mb-1">接收地址</label>
              <input
                type="text"
                value={giftAddress}
                onChange={(e) => setGiftAddress(e.target.value)}
                placeholder="0x..."
                className="w-full bg-[#0e0e0e] border border-[#494847]/40 rounded-lg px-3 py-2 text-white text-sm
                  focus:outline-none focus:border-[#fcc025] mb-4"
              />

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
                        recipient: giftAddress.trim(),
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
