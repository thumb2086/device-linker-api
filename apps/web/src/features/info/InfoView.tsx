import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Package, Calculator, Crown, Sparkles } from 'lucide-react';
import AppBottomNav from '../../components/AppBottomNav';
import ItemsTab from './tabs/ItemsTab';
import OddsTab from './tabs/OddsTab';
import VIPTab from './tabs/VIPTab';

type TabId = 'items' | 'odds' | 'vip';

const TABS = [
  { id: 'items' as TabId, label: '物品圖鑑', icon: Package },
  { id: 'odds' as TabId, label: '遊戲機率', icon: Calculator },
  { id: 'vip' as TabId, label: 'VIP 說明', icon: Crown },
];

export default function InfoView() {
  const [activeTab, setActiveTab] = useState<TabId>('items');

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      {/* Header */}
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/app" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
              <ChevronLeft size={24} />
            </Link>
            <Sparkles className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
              說明中心
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-20">
        {/* Tab Navigation */}
        <div className="mb-6 flex gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#fcc025] text-black'
                    : 'bg-[#1a1919] text-[#adaaaa] border border-[#494847]/20'
                }`}
              >
                <Icon size={18} />
                <span className="text-xs font-black uppercase tracking-wide">{tab.label}</span>
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
