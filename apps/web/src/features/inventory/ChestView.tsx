import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Package, Sparkles, Coins, ChevronRight, X } from 'lucide-react';

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

const RARITY_COLORS: Record<string, string> = {
  common: '#b0b0b0',
  rare: '#4fc3f7',
  epic: '#ba68c8',
  legendary: '#ffd54f',
  mythic: '#ff6f00',
};

export default function ChestView() {
  const [chests, setChests] = useState<ChestConfig[]>([]);
  const [selectedChest, setSelectedChest] = useState<ChestConfig | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [openedItems, setOpenedItems] = useState<ChestItem[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [balance, setBalance] = useState(10000);
  const [pity, setPity] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchChests();
  }, []);

  const fetchChests = async () => {
    try {
      const res = await fetch('/api/v1/chests');
      const data = await res.json();
      if (data.success) {
        setChests(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch chests:', err);
    }
  };

  const openChest = async (chestType: string) => {
    if (isOpening) return;
    
    setIsOpening(true);
    setShowResult(false);
    setOpenedItems([]);

    try {
      const res = await fetch('/api/v1/chests/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chestType }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Animate opening
        await new Promise(r => setTimeout(r, 1500));
        
        setOpenedItems(data.data.items);
        setShowResult(true);
        setPity(prev => ({ ...prev, [chestType]: data.data.pityCount }));
        
        // Update balance if currency reward
        if (data.data.totalValue > 0) {
          setBalance(prev => prev + data.data.totalValue);
        }
      }
    } catch (err) {
      console.error('Failed to open chest:', err);
    } finally {
      setIsOpening(false);
    }
  };

  const getChestIcon = (id: string) => {
    switch (id) {
      case 'common': return <Package className="w-8 h-8" />;
      case 'rare': return <Gift className="w-8 h-8" />;
      case 'epic': return <Sparkles className="w-8 h-8" />;
      case 'legendary': return <Coins className="w-8 h-8" />;
      default: return <Package className="w-8 h-8" />;
    }
  };

  const getChestColor = (id: string) => {
    switch (id) {
      case 'common': return 'from-gray-400 to-gray-600';
      case 'rare': return 'from-blue-400 to-blue-600';
      case 'epic': return 'from-purple-400 to-purple-600';
      case 'legendary': return 'from-yellow-400 to-yellow-600';
      default: return 'from-gray-400 to-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black italic uppercase text-[#fcc025]">
              寶箱商店
            </h1>
            <p className="text-[#adaaaa] text-sm mt-1">
              開啟寶箱獲取稀有物品與獎勵
            </p>
          </div>
          <div className="flex items-center gap-3 bg-[#1a1919] px-5 py-3 rounded-xl border border-[#494847]/30">
            <Coins className="w-5 h-5 text-[#fcc025]" />
            <span className="font-bold">{balance.toLocaleString()} ZXC</span>
          </div>
        </div>
      </div>

      {/* Chests Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {chests.map((chest) => (
          <motion.div
            key={chest.id}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            className={`relative bg-gradient-to-br ${getChestColor(chest.id)} rounded-2xl p-6 cursor-pointer
              shadow-lg border-2 border-white/10 overflow-hidden group`}
            onClick={() => setSelectedChest(chest)}
          >
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            
            <div className="relative z-10">
              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center
                  backdrop-blur-sm border border-white/30 shadow-inner">
                  {getChestIcon(chest.id)}
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-center mb-2">{chest.name}</h3>
              <p className="text-white/70 text-sm text-center mb-4">{chest.nameEn}</p>
              
              <div className="flex items-center justify-center gap-2 mb-4">
                <Coins className="w-4 h-4" />
                <span className="font-bold">{chest.price.toLocaleString()}</span>
              </div>
              
              {/* Pity progress */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-white/70 mb-1">
                  <span>保底進度</span>
                  <span>{pity[chest.id] || 0}/{chest.pityThreshold}</span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white/80"
                    initial={{ width: 0 }}
                    animate={{ width: `${((pity[chest.id] || 0) / chest.pityThreshold) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* Rarity preview */}
              <div className="flex justify-center gap-1 mt-4">
                {chest.rarities.slice(0, 4).map((r) => (
                  <div
                    key={r.rarity}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: r.color }}
                    title={`${r.name}: ${r.chance}%`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chest Detail Modal */}
      <AnimatePresence>
        {selectedChest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !isOpening && setSelectedChest(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1919] rounded-3xl p-8 max-w-lg w-full border border-[#494847]/30"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#fcc025]">{selectedChest.name}</h2>
                  <p className="text-[#adaaaa]">{selectedChest.nameEn}</p>
                </div>
                <button
                  onClick={() => setSelectedChest(null)}
                  disabled={isOpening}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chest Preview */}
              <div className={`bg-gradient-to-br ${getChestColor(selectedChest.id)} rounded-2xl p-8 mb-6`}>
                <div className="flex justify-center">
                  <motion.div
                    animate={isOpening ? {
                      rotate: [0, -10, 10, -10, 10, 0],
                      scale: [1, 1.1, 1],
                    } : {}}
                    transition={{ duration: 0.5, repeat: isOpening ? Infinity : 0 }}
                    className="w-32 h-32 bg-white/20 rounded-3xl flex items-center justify-center
                      backdrop-blur-sm border-2 border-white/40 shadow-2xl"
                  >
                    {getChestIcon(selectedChest.id)}
                  </motion.div>
                </div>
              </div>

              {/* Drop Rates */}
              <div className="mb-6">
                <h3 className="font-bold mb-3">掉落機率</h3>
                <div className="space-y-2">
                  {selectedChest.rarities.map((r) => (
                    <div key={r.rarity} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="flex-1 text-sm">{r.name}</span>
                      <span className="text-sm font-bold" style={{ color: r.color }}>
                        {r.chance}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Button */}
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
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
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
                    transition={{ delay: index * 0.1, type: "spring" }}
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
