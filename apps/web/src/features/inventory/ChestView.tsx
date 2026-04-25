import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Package, Sparkles, Coins, ChevronRight, X, Shield, Zap } from 'lucide-react';
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
  const [chests, setChests] = useState<ChestConfig[]>([]);
  const [selectedChest, setSelectedChest] = useState<ChestConfig | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [openedItems, setOpenedItems] = useState<ChestItem[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [status, setStatus] = useState<ChestStatus | null>(null);
  const [inventory, setInventory] = useState<InventoryState>({
    items: [],
    activeBuffs: [],
    ownedAvatars: [],
    ownedTitles: [],
  });
  const [useStatusMessage, setUseStatusMessage] = useState<string | null>(null);

  const balance = status?.balance ? parseFloat(status.balance) : 0;
  const pity = status?.chestPity || {};

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
      const res = await api.post('/api/v1/chests/open', { chestType, free });
      const data = res.data;

      if (data?.success) {
        await new Promise((r) => setTimeout(r, 1500));
        setOpenedItems(data.data.items);
        setShowResult(true);
        await Promise.all([refreshStatus(), refreshInventory()]);
      } else {
        setUseStatusMessage(data?.error || '開啟失敗');
      }
    } catch (err: any) {
      console.error('Failed to open chest:', err);
      setUseStatusMessage(err?.response?.data?.error || '開啟失敗');
    } finally {
      setIsOpening(false);
    }
  };

  const useItem = async (itemId: string) => {
    try {
      const res = await api.post('/api/v1/inventory/use', { itemId });
      if (res.data?.success) {
        setUseStatusMessage(res.data.data.effectSummary || '使用成功');
        await Promise.all([refreshStatus(), refreshInventory()]);
      } else {
        setUseStatusMessage(res.data?.error || '使用失敗');
      }
    } catch (err: any) {
      setUseStatusMessage(err?.response?.data?.error || '使用失敗');
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
        <div className="flex items-center gap-2 bg-[#1a1919] px-4 py-2 rounded-xl border border-[#494847]/20">
          <Coins className="w-5 h-5 text-[#fcc025]" />
          <span className="font-black text-[#fcc025]">{balance.toLocaleString()} ZXC</span>
        </div>
      </div>

      {useStatusMessage && (
        <div className="mb-4 rounded-xl border border-[#fcc025]/40 bg-[#fcc025]/10 px-4 py-3 text-sm text-[#fcc025] flex items-center justify-between">
          <span>{useStatusMessage}</span>
          <button onClick={() => setUseStatusMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Buffs */}
      {inventory.activeBuffs.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#adaaaa] mb-2 flex items-center gap-2">
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
                  <div className="text-xs font-black truncate">
                    {BUFF_TYPE_LABEL[buff.type] || buff.type}
                  </div>
                  <div className="text-[10px] text-[#adaaaa]">
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
          const currentPity = pity[chest.id] ?? 0;
          const pityPercent = Math.min(100, (currentPity / chest.pityThreshold) * 100);
          return (
            <motion.button
              key={chest.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedChest(chest)}
              className="bg-[#1a1919] rounded-2xl p-4 border border-[#494847]/20 text-left hover:border-[#fcc025]/50 transition-colors"
            >
              <div className="text-4xl mb-2 text-center">
                <Gift className="w-10 h-10 mx-auto text-[#fcc025]" />
              </div>
              <h3 className="font-black text-sm mb-1">{chest.name}</h3>
              <div className="flex items-center gap-1 text-xs text-[#fcc025] mb-2">
                <Coins className="w-3 h-3" />
                {chest.price.toLocaleString()}
              </div>
              <div className="h-1 bg-[#494847]/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#fcc025]"
                  style={{ width: `${pityPercent}%` }}
                />
              </div>
              <div className="text-[10px] text-[#adaaaa] mt-1">
                保底 {currentPity}/{chest.pityThreshold}
              </div>
            </motion.button>
          );
        })}
      </section>

      {/* Inventory */}
      <section>
        <h2 className="text-xs font-black uppercase tracking-widest text-[#adaaaa] mb-3 flex items-center gap-2">
          <Package className="w-3 h-3" />
          我的道具（{inventory.items.length}/{status?.inventorySlotsMax ?? 100}）
        </h2>
        {inventory.items.length === 0 ? (
          <div className="rounded-xl border border-[#494847]/20 bg-[#1a1919] p-8 text-center text-sm text-[#adaaaa]">
            尚未擁有任何道具，開啟寶箱以獲得！
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {inventory.items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border bg-[#1a1919] p-3"
                style={{ borderColor: item.rarityColor || RARITY_COLORS[item.rarity] || '#494847' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-3xl">{item.icon}</div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${item.rarityColor || RARITY_COLORS[item.rarity]}30`,
                      color: item.rarityColor || RARITY_COLORS[item.rarity],
                    }}
                  >
                    x{item.quantity}
                  </span>
                </div>
                <div className="mt-2 text-sm font-black truncate">{item.name}</div>
                <div className="text-[10px] text-[#adaaaa] line-clamp-2 min-h-[28px]">
                  {item.description}
                </div>
                {item.consumable && (
                  <button
                    onClick={() => useItem(item.id)}
                    className="mt-2 w-full bg-[#fcc025] text-black font-black text-xs py-2 rounded-lg hover:bg-[#e6ad03]"
                  >
                    使用
                  </button>
                )}
                {!item.consumable && (item.type === 'avatar' || item.type === 'title') && (
                  <button
                    onClick={() => useItem(item.id)}
                    className="mt-2 w-full border border-[#fcc025] text-[#fcc025] font-black text-xs py-2 rounded-lg hover:bg-[#fcc025] hover:text-black"
                  >
                    裝備
                  </button>
                )}
              </div>
            ))}
          </div>
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
                  <p className="text-xs text-[#adaaaa]">{selectedChest.nameEn}</p>
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

              <div className="space-y-2 mb-4 text-xs">
                <h3 className="font-black text-[#adaaaa] uppercase tracking-widest">掉落機率</h3>
                {selectedChest.rarities.map((r) => (
                  <div key={r.rarity} className="flex justify-between items-center">
                    <span className="font-bold" style={{ color: r.color }}>
                      {r.name}
                    </span>
                    <span className="text-[#adaaaa]">{r.chance}%</span>
                  </div>
                ))}
                <div className="text-[10px] text-[#adaaaa] pt-2 border-t border-[#494847]/20">
                  每次掉落 {selectedChest.dropCount.min}-{selectedChest.dropCount.max} 件，保底 {selectedChest.pityThreshold} 次
                </div>
              </div>

              <button
                onClick={() => openChest(selectedChest.id)}
                disabled={isOpening || balance < selectedChest.price}
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
                    <Coins className="w-5 h-5" />
                    開啟 ({selectedChest.price.toLocaleString()} ZXC)
                  </>
                )}
              </button>
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
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-2xl w-full"
            >
              <h2 className="text-3xl font-black italic text-center text-[#fcc025] mb-8">
                恭喜獲得!
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {openedItems.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: index * 0.1, type: 'spring' }}
                    className="bg-[#1a1919] rounded-2xl p-6 border-2 text-center"
                    style={{ borderColor: RARITY_COLORS[item.item.rarity] || '#494847' }}
                  >
                    <div className="text-4xl mb-3">{item.item.icon}</div>
                    <h3 className="font-bold text-sm mb-1">{item.item.name}</h3>
                    <p className="text-xs text-[#adaaaa] mb-2">{item.item.description}</p>
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className="text-xs px-2 py-1 rounded-full font-bold"
                        style={{
                          backgroundColor: `${RARITY_COLORS[item.item.rarity]}30`,
                          color: RARITY_COLORS[item.item.rarity],
                        }}
                      >
                        {item.item.rarity}
                      </span>
                      {item.isNew && (
                        <span className="text-xs bg-[#fcc025] text-black px-2 py-1 rounded-full font-bold">
                          NEW
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="text-center">
                <button
                  onClick={() => {
                    setShowResult(false);
                    setOpenedItems([]);
                    setSelectedChest(null);
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
    </div>
  );
}
