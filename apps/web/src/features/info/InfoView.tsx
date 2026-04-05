import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Calculator, ChevronLeft, Crown, Package, Sparkles } from 'lucide-react';
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
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('items');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'items' || tabParam === 'odds' || tabParam === 'vip') {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  const activeLabel = useMemo(
    () => TABS.find((tab) => tab.id === activeTab)?.label ?? '說明中心',
    [activeTab],
  );

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    navigate(`/app/info?tab=${tabId}`, { replace: location.search.length > 0 });
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/app" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
              <ChevronLeft size={24} />
            </Link>
            <Sparkles className="text-[#fcc025]" />
            <div>
              <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">說明中心</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">{activeLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-20">
        <div className="mb-6 flex gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#fcc025] text-black'
                    : 'border border-[#494847]/20 bg-[#1a1919] text-[#adaaaa]'
                }`}
              >
                <Icon size={18} />
                <span className="text-xs font-black tracking-wide">{tab.label}</span>
              </button>
            );
          })}
        </div>

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
