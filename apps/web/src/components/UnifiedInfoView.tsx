import React from 'react';
import { Calculator, ChevronLeft, Crown, Package, Sparkles } from 'lucide-react';
import AppBottomNav from '../components/AppBottomNav';
import ItemsTab from '../features/info/tabs/ItemsTab';
import OddsTab from '../features/info/tabs/OddsTab';
import VIPTab from '../features/info/tabs/VIPTab';

interface InfoCard {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  status: string;
  statusColor: string;
  tabId: 'items' | 'odds' | 'vip';
}

export default function UnifiedInfoView() {
  const [activeTab, setActiveTab] = React.useState<'items' | 'odds' | 'vip'>('items');

  const infoCards: InfoCard[] = [
    {
      id: 'vip',
      title: 'VIP 等級說明',
      subtitle: '等級特權一覽',
      icon: Crown,
      description: '查看 VIP 等級相關的特權與福利',
      status: '等階 4 啟用中',
      statusColor: 'text-[#fcc025]',
      tabId: 'vip'
    },
    {
      id: 'odds',
      title: '遊戲機率',
      subtitle: 'RTP 與公平性說明',
      icon: Calculator,
      description: '查看各遊戲 RTP 與派彩規則',
      status: '公平遊戲保證',
      statusColor: 'text-emerald-400',
      tabId: 'odds'
    },
    {
      id: 'items',
      title: '物品圖鑑',
      subtitle: '道具稀有度說明',
      icon: Package,
      description: '探索所有收藏品與稱號',
      status: '頭像、稱號與道具',
      statusColor: 'text-purple-400',
      tabId: 'items'
    }
  ];

  const activeCard = infoCards.find(card => card.tabId === activeTab);

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <a href="/app" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
              <ChevronLeft size={24} />
            </a>
            <Sparkles className="text-[#fcc025]" />
            <div>
              <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">說明中心</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">
                {activeCard?.title || '說明中心'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-20">
        {/* Info Cards Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {infoCards.map((card) => {
            const Icon = card.icon;
            const isActive = card.tabId === activeTab;
            
            return (
              <button
                key={card.id}
                onClick={() => setActiveTab(card.tabId)}
                className={`relative overflow-hidden rounded-xl border p-6 transition-all hover:shadow-[0_0_20px_rgba(252,192,37,0.1)] active:scale-95 ${
                  isActive 
                    ? 'border-[#fcc025]/40 bg-[#1a1919]' 
                    : 'border-[#494847]/20 bg-[#1a1919] hover:bg-[#262626]'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity hover:opacity-10" 
                     style={{
                       backgroundImage: `linear-gradient(135deg, ${
                         card.tabId === 'vip' ? 'rgba(252,192,37,0.2)' :
                         card.tabId === 'odds' ? 'rgba(34,197,94,0.2)' :
                         'rgba(168,85,247,0.2)'
                       } 0%, transparent 100%)`
                     }} 
                />
                
                <div className="relative z-10">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-[#494847]/20 bg-[#262626] transition-colors">
                    <Icon className="h-6 w-6 text-[#fcc025]" />
                  </div>
                  
                  <h3 className="mb-2 text-lg font-bold uppercase tracking-tight text-white">
                    {card.title}
                  </h3>
                  
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                    {card.subtitle}
                  </p>
                  
                  <p className="mb-4 text-[11px] font-bold uppercase tracking-tight text-[#adaaaa]">
                    {card.description}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-1 animate-pulse rounded-full bg-current" />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${card.statusColor}`}>
                      {card.status}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px]">
          {activeTab === 'items' && <ItemsTab />}
          {activeTab === 'odds' && <OddsTab />}
          {activeTab === 'vip' && <VIPTab />}
        </div>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
