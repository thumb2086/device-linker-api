import { useEffect, useMemo, useState, FormEvent } from 'react';
import {
  ShieldAlert,
  Activity,
  AlertOctagon,
  Ban,
  Coins,
  Megaphone,
  Loader2,
  RefreshCw,
  Package,
  Pin,
  PinOff,
  Trash2,
  Eye,
  EyeOff,
  ScrollText,
} from 'lucide-react';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';
import { useAuthStore } from '../../store/useAuthStore';

interface OpsEvent {
  id?: string;
  channel?: string;
  severity?: string;
  kind?: string;
  message?: string;
  createdAt?: string;
  source?: string;
}

interface HealthData {
  queuedTxIntents?: number;
  pendingSettlements?: number;
  openTickets?: number;
  maintenance?: boolean;
}

interface Announcement {
  announcementId?: string;
  id?: string;
  title: string;
  content: string;
  isPinned?: boolean;
  isActive?: boolean;
  publishedAt?: string;
  createdAt?: string;
}

interface CatalogItem {
  id?: string;
  itemId: string;
  type: string;
  name: string;
  rarity: string;
  source?: string;
  description?: string | null;
  icon?: string | null;
  price?: string | null;
  isActive?: boolean;
}

type TabId = 'dashboard' | 'maintenance' | 'blacklist' | 'balance' | 'announcement' | 'catalog' | 'events';

const TABS: { id: TabId; label: string; icon: typeof ShieldAlert }[] = [
  { id: 'dashboard', label: '儀表板', icon: Activity },
  { id: 'maintenance', label: '維護', icon: AlertOctagon },
  { id: 'blacklist', label: '黑名單', icon: Ban },
  { id: 'balance', label: '餘額', icon: Coins },
  { id: 'announcement', label: '公告', icon: Megaphone },
  { id: 'catalog', label: '稱號頭像', icon: Package },
  { id: 'events', label: '事件紀錄', icon: ScrollText },
];

const RARITY_LABEL: Record<string, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史詩',
  legendary: '傳說',
  mythic: '神話',
  vip: 'VIP',
};

const TYPE_LABEL: Record<string, string> = {
  avatar: '頭像',
  title: '稱號',
  buff: '增益',
  chest: '寶箱',
  key: '鑰匙',
  collectible: '收藏',
};

export default function AdminView() {
  const { sessionId, isAuthorized } = useAuthStore();

  const [authErr, setAuthErr] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  const [blacklistAddress, setBlacklistAddress] = useState('');
  const [blacklistReason, setBlacklistReason] = useState('');

  const [adjustAddress, setAdjustAddress] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustToken, setAdjustToken] = useState<'zhixi' | 'yjc'>('zhixi');
  const [adjustReason, setAdjustReason] = useState('');

  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [announcementPinned, setAnnouncementPinned] = useState(false);

  const [catalogItemId, setCatalogItemId] = useState('');
  const [catalogType, setCatalogType] = useState<'avatar' | 'title' | 'buff' | 'chest' | 'key' | 'collectible'>('avatar');
  const [catalogName, setCatalogName] = useState('');
  const [catalogRarity, setCatalogRarity] = useState<'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'vip'>('common');
  const [catalogIcon, setCatalogIcon] = useState('');
  const [catalogDescription, setCatalogDescription] = useState('');

  const [actionResult, setActionResult] = useState<string | null>(null);

  async function refresh() {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [healthRes, eventsRes, annRes, catRes] = await Promise.all([
        api.get('/api/v1/admin/ops/health').catch((err) => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            setAuthErr('你不是管理員或未登入');
          }
          return null;
        }),
        api.get('/api/v1/admin/ops/events?limit=50').catch(() => null),
        api.get('/api/v1/admin/announcements').catch(() => null),
        api.get('/api/v1/admin/reward-catalog').catch(() => null),
      ]);
      if (healthRes?.data?.data) {
        const h = healthRes.data.data;
        setHealth(h);
        setMaintenanceOn(Boolean(h.maintenance));
      }
      if (eventsRes?.data?.data?.events) setEvents(eventsRes.data.data.events);
      if (annRes?.data?.data?.announcements) setAnnouncements(annRes.data.data.announcements);
      if (catRes?.data?.data?.items) setCatalog(catRes.data.data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function show(msg: string) {
    setActionResult(msg);
    window.setTimeout(() => setActionResult(null), 4000);
  }

  function errMsg(err: any) {
    return err?.response?.data?.data?.error?.message || err?.message || '操作失敗';
  }

  async function handleMaintenance(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/v1/admin/maintenance', {
        sessionId,
        enabled: !maintenanceOn,
        message: maintenanceMessage || undefined,
      });
      setMaintenanceOn(!maintenanceOn);
      show(!maintenanceOn ? '維護模式已啟用' : '維護模式已停用');
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleBlacklist(e: FormEvent) {
    e.preventDefault();
    if (!blacklistAddress.trim()) return;
    try {
      await api.post('/api/v1/admin/blacklist', {
        sessionId,
        address: blacklistAddress.trim(),
        reason: blacklistReason.trim() || undefined,
        action: 'add',
      });
      show(`已加入黑名單：${blacklistAddress}`);
      setBlacklistAddress('');
      setBlacklistReason('');
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustAddress.trim() || !adjustAmount.trim()) return;
    try {
      const res = await api.post('/api/v1/admin/adjust-balance', {
        sessionId,
        address: adjustAddress.trim(),
        amount: adjustAmount.trim(),
        token: adjustToken,
        reason: adjustReason.trim() || 'admin_adjust',
      });
      const data = res.data?.data;
      show(`餘額已調整，新餘額：${data?.newBalance ?? '?'} ${adjustToken.toUpperCase()}`);
      setAdjustAmount('');
      setAdjustReason('');
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleAnnouncementCreate(e: FormEvent) {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim()) return;
    try {
      await api.post('/api/v1/admin/announcements', {
        sessionId,
        title: announcementTitle.trim(),
        content: announcementContent.trim(),
        isPinned: announcementPinned,
        isActive: true,
      });
      show(`公告已發布：${announcementTitle}`);
      setAnnouncementTitle('');
      setAnnouncementContent('');
      setAnnouncementPinned(false);
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleAnnouncementToggle(ann: Announcement, field: 'isActive' | 'isPinned') {
    const id = ann.announcementId || ann.id;
    if (!id) return;
    try {
      await api.patch(`/api/v1/admin/announcements/${encodeURIComponent(id)}`, {
        sessionId,
        [field]: !ann[field],
      });
      show(`已更新公告：${ann.title}`);
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleAnnouncementDelete(ann: Announcement) {
    const id = ann.announcementId || ann.id;
    if (!id) return;
    if (!window.confirm(`確定刪除公告「${ann.title}」？`)) return;
    try {
      await api.delete(`/api/v1/admin/announcements/${encodeURIComponent(id)}`, { data: { sessionId } });
      show('公告已刪除');
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleCatalogCreate(e: FormEvent) {
    e.preventDefault();
    if (!catalogItemId.trim() || !catalogName.trim()) return;
    try {
      await api.post('/api/v1/admin/reward-catalog', {
        sessionId,
        itemId: catalogItemId.trim(),
        type: catalogType,
        name: catalogName.trim(),
        rarity: catalogRarity,
        source: 'admin',
        description: catalogDescription.trim() || undefined,
        icon: catalogIcon.trim() || undefined,
        isActive: true,
      });
      show(`已新增 / 更新：${catalogName}`);
      setCatalogItemId('');
      setCatalogName('');
      setCatalogIcon('');
      setCatalogDescription('');
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleCatalogToggle(item: CatalogItem) {
    try {
      await api.patch(`/api/v1/admin/reward-catalog/${encodeURIComponent(item.itemId)}`, {
        sessionId,
        isActive: !item.isActive,
      });
      show(`已更新：${item.name}`);
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  async function handleCatalogDelete(item: CatalogItem) {
    if (!window.confirm(`確定刪除「${item.name}」？`)) return;
    try {
      await api.delete(`/api/v1/admin/reward-catalog/${encodeURIComponent(item.itemId)}`, { data: { sessionId } });
      show('已刪除');
      refresh();
    } catch (err: any) {
      show(errMsg(err));
    }
  }

  const healthCards = useMemo(
    () => [
      { label: '待處理交易', value: health?.queuedTxIntents ?? '-' },
      { label: '待結算數', value: health?.pendingSettlements ?? '-' },
      { label: '未結工單', value: health?.openTickets ?? '-' },
      { label: '維護狀態', value: maintenanceOn ? '啟用中' : '關閉' },
    ],
    [health, maintenanceOn],
  );

  const avatarsAndTitles = useMemo(
    () => catalog.filter((c) => c.type === 'avatar' || c.type === 'title'),
    [catalog],
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="app-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-[#fcc025]" />
            <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">管理中心</h1>
          </div>
          <button onClick={refresh} className="p-2 rounded-lg border border-[#494847]/30 hover:bg-[#262626]" aria-label="重新整理">
            <RefreshCw size={16} className={loading ? 'animate-spin text-[#fcc025]' : 'text-[#adaaaa]'} />
          </button>
        </div>
      </header>

      <main className="app-shell space-y-6 pt-24">
        {!isAuthorized && (
          <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#fcc025]/20">
            <p className="text-sm text-[#adaaaa]">請先登入以使用管理功能。</p>
          </section>
        )}

        {authErr && (
          <section className="bg-[#1a1919] rounded-2xl p-6 border border-red-500/20">
            <p className="text-sm text-red-400">{authErr}</p>
          </section>
        )}

        {/* Tab bar */}
        <nav className="flex overflow-x-auto gap-2 pb-1 -mx-1 px-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black tracking-wide transition-all ${
                  active
                    ? 'bg-[#fcc025] text-black'
                    : 'border border-[#494847]/30 bg-[#1a1919] text-[#adaaaa]'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {actionResult && (
          <section className="bg-[#1a1919] rounded-2xl p-4 border border-[#fcc025]/30">
            <p className="text-xs text-[#fcc025]">{actionResult}</p>
          </section>
        )}

        {activeTab === 'dashboard' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <Activity size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">系統狀態</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {healthCards.map((s) => (
                <div key={s.label} className="bg-[#1a1919] rounded-2xl p-4 border border-[#494847]/20">
                  <p className="text-[10px] font-black tracking-wide text-[#adaaaa]">{s.label}</p>
                  <p className="text-2xl font-black italic tracking-tighter text-[#fcc025] mt-2">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#1a1919] rounded-2xl p-4 border border-[#494847]/20">
              <p className="text-[10px] font-black tracking-wide text-[#adaaaa] mb-2">最近 5 筆事件</p>
              {events.length === 0 ? (
                <p className="text-xs text-[#adaaaa]">沒有事件</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {events.slice(0, 5).map((evt, i) => (
                    <li key={evt.id || i} className="border-l-2 border-[#fcc025]/40 pl-3">
                      <span className="text-[9px] font-black uppercase text-[#adaaaa]">
                        {evt.severity || 'info'} · {evt.channel}/{evt.kind}
                      </span>
                      <p className="text-white mt-0.5">{evt.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {activeTab === 'maintenance' && (
          <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
            <div className="flex items-center gap-2 mb-4">
              <AlertOctagon size={18} className="text-[#fcc025]" />
              <h3 className="text-sm font-black tracking-wide text-white">維護模式</h3>
            </div>
            <p className="text-xs text-[#adaaaa] mb-3">
              啟用後前台會顯示維護通知，阻擋進場。當前狀態：
              <span className={`ml-2 font-black ${maintenanceOn ? 'text-red-400' : 'text-emerald-400'}`}>
                {maintenanceOn ? '啟用中' : '關閉'}
              </span>
            </p>
            <form onSubmit={handleMaintenance} className="space-y-3">
              <input
                type="text"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                placeholder="維護訊息（可選）"
                maxLength={200}
              />
              <button
                type="submit"
                className={`w-full py-2 rounded-lg text-xs font-black tracking-wide ${
                  maintenanceOn ? 'bg-[#494847] text-white' : 'bg-[#fcc025] text-[#0e0e0e]'
                }`}
              >
                {maintenanceOn ? '停用維護模式' : '啟用維護模式'}
              </button>
            </form>
          </section>
        )}

        {activeTab === 'blacklist' && (
          <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
            <div className="flex items-center gap-2 mb-4">
              <Ban size={18} className="text-[#fcc025]" />
              <h3 className="text-sm font-black tracking-wide text-white">黑名單</h3>
            </div>
            <form onSubmit={handleBlacklist} className="space-y-3">
              <input
                type="text"
                value={blacklistAddress}
                onChange={(e) => setBlacklistAddress(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                placeholder="錢包地址 0x..."
              />
              <input
                type="text"
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                placeholder="原因（可選）"
                maxLength={200}
              />
              <button type="submit" className="w-full py-2 bg-red-600 text-white rounded-lg text-xs font-black tracking-wide">
                加入黑名單
              </button>
            </form>
          </section>
        )}

        {activeTab === 'balance' && (
          <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
            <div className="flex items-center gap-2 mb-4">
              <Coins size={18} className="text-[#fcc025]" />
              <h3 className="text-sm font-black tracking-wide text-white">調整餘額</h3>
            </div>
            <p className="text-xs text-[#adaaaa] mb-3">正數為加、負數為減。支援 ZXC 與 YJC。</p>
            <form onSubmit={handleAdjust} className="space-y-3">
              <input
                type="text"
                value={adjustAddress}
                onChange={(e) => setAdjustAddress(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                placeholder="錢包地址 0x..."
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                  placeholder="金額 (+/-)"
                />
                <select
                  value={adjustToken}
                  onChange={(e) => setAdjustToken(e.target.value as 'zhixi' | 'yjc')}
                  className="bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="zhixi">子熙幣 (ZXC)</option>
                  <option value="yjc">佑戩幣 (YJC)</option>
                </select>
              </div>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                placeholder="原因"
                maxLength={200}
              />
              <button type="submit" className="w-full py-2 bg-[#fcc025] text-[#0e0e0e] rounded-lg text-xs font-black tracking-wide">
                調整餘額
              </button>
            </form>
          </section>
        )}

        {activeTab === 'announcement' && (
          <section className="space-y-6">
            <div className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
              <div className="flex items-center gap-2 mb-4">
                <Megaphone size={18} className="text-[#fcc025]" />
                <h3 className="text-sm font-black tracking-wide text-white">發佈新公告</h3>
              </div>
              <form onSubmit={handleAnnouncementCreate} className="space-y-3">
                <input
                  type="text"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                  placeholder="標題"
                  maxLength={100}
                />
                <textarea
                  value={announcementContent}
                  onChange={(e) => setAnnouncementContent(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm min-h-24"
                  placeholder="內容"
                  maxLength={2000}
                />
                <label className="flex items-center gap-2 text-xs text-[#adaaaa]">
                  <input
                    type="checkbox"
                    checked={announcementPinned}
                    onChange={(e) => setAnnouncementPinned(e.target.checked)}
                  />
                  發佈時即釘選於最上方
                </label>
                <button type="submit" className="w-full py-2 bg-[#fcc025] text-[#0e0e0e] rounded-lg text-xs font-black tracking-wide">
                  發佈公告
                </button>
              </form>
            </div>

            <div className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
              <h3 className="text-sm font-black tracking-wide text-white mb-4">現有公告（{announcements.length}）</h3>
              {announcements.length === 0 ? (
                <p className="text-xs text-[#adaaaa]">目前沒有公告</p>
              ) : (
                <ul className="space-y-3">
                  {announcements.map((ann) => {
                    const id = ann.announcementId || ann.id || ann.title;
                    return (
                      <li key={id} className="rounded-lg border border-[#494847]/30 bg-[#0e0e0e] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {ann.isPinned && <Pin size={12} className="text-[#fcc025]" />}
                              <p className={`text-sm font-bold ${ann.isActive ? 'text-white' : 'text-[#494847] line-through'}`}>
                                {ann.title}
                              </p>
                            </div>
                            <p className="text-xs text-[#adaaaa] mt-1 line-clamp-2 whitespace-pre-wrap">{ann.content}</p>
                            <p className="text-[9px] text-[#494847] mt-1">
                              {ann.publishedAt || ann.createdAt
                                ? new Date(ann.publishedAt || ann.createdAt!).toLocaleString()
                                : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => handleAnnouncementToggle(ann, 'isPinned')}
                              className="p-1.5 rounded border border-[#494847]/30 hover:bg-[#1a1919]"
                              title={ann.isPinned ? '取消釘選' : '置頂'}
                            >
                              {ann.isPinned ? <PinOff size={14} className="text-[#fcc025]" /> : <Pin size={14} className="text-[#adaaaa]" />}
                            </button>
                            <button
                              onClick={() => handleAnnouncementToggle(ann, 'isActive')}
                              className="p-1.5 rounded border border-[#494847]/30 hover:bg-[#1a1919]"
                              title={ann.isActive ? '隱藏' : '顯示'}
                            >
                              {ann.isActive ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} className="text-[#adaaaa]" />}
                            </button>
                            <button
                              onClick={() => handleAnnouncementDelete(ann)}
                              className="p-1.5 rounded border border-red-500/30 hover:bg-red-500/10"
                              title="刪除"
                            >
                              <Trash2 size={14} className="text-red-400" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {activeTab === 'catalog' && (
          <section className="space-y-6">
            <div className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
              <div className="flex items-center gap-2 mb-4">
                <Package size={18} className="text-[#fcc025]" />
                <h3 className="text-sm font-black tracking-wide text-white">新增 / 編輯 稱號・頭像</h3>
              </div>
              <p className="text-xs text-[#adaaaa] mb-3">
                以 <code className="bg-[#0e0e0e] px-1 rounded">itemId</code> 為唯一鍵，同 id 會直接覆蓋既有項目。新增的項目會在「說明中心 → 物品圖鑑」出現。
              </p>
              <form onSubmit={handleCatalogCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={catalogItemId}
                    onChange={(e) => setCatalogItemId(e.target.value)}
                    className="bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                    placeholder="itemId（唯一，英數）"
                  />
                  <select
                    value={catalogType}
                    onChange={(e) => setCatalogType(e.target.value as any)}
                    className="bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="avatar">頭像</option>
                    <option value="title">稱號</option>
                    <option value="buff">增益</option>
                    <option value="chest">寶箱</option>
                    <option value="key">鑰匙</option>
                    <option value="collectible">收藏</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={catalogName}
                  onChange={(e) => setCatalogName(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                  placeholder="顯示名稱（中文 ok）"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={catalogRarity}
                    onChange={(e) => setCatalogRarity(e.target.value as any)}
                    className="bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                  >
                    {Object.entries(RARITY_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={catalogIcon}
                    onChange={(e) => setCatalogIcon(e.target.value)}
                    className="bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
                    placeholder="Emoji / 圖示（可選）"
                  />
                </div>
                <textarea
                  value={catalogDescription}
                  onChange={(e) => setCatalogDescription(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm min-h-16"
                  placeholder="說明（可選）"
                  maxLength={500}
                />
                <button type="submit" className="w-full py-2 bg-[#fcc025] text-[#0e0e0e] rounded-lg text-xs font-black tracking-wide">
                  儲存項目
                </button>
              </form>
            </div>

            <div className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
              <h3 className="text-sm font-black tracking-wide text-white mb-4">
                已登錄的自訂稱號 / 頭像（{avatarsAndTitles.length}）
              </h3>
              {avatarsAndTitles.length === 0 ? (
                <p className="text-xs text-[#adaaaa]">目前沒有自訂項目</p>
              ) : (
                <ul className="space-y-2">
                  {avatarsAndTitles.map((item) => (
                    <li key={item.itemId} className="rounded-lg border border-[#494847]/30 bg-[#0e0e0e] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{item.icon || (item.type === 'avatar' ? '👤' : '🏷️')}</span>
                            <p className={`text-sm font-bold ${item.isActive ? 'text-white' : 'text-[#494847] line-through'}`}>
                              {item.name}
                            </p>
                            <span className="text-[9px] font-black tracking-widest uppercase text-[#fcc025]">
                              {TYPE_LABEL[item.type] || item.type} · {RARITY_LABEL[item.rarity] || item.rarity}
                            </span>
                          </div>
                          <p className="text-[9px] text-[#494847] mt-1">id: {item.itemId}</p>
                          {item.description && (
                            <p className="text-xs text-[#adaaaa] mt-1 line-clamp-2">{item.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => handleCatalogToggle(item)}
                            className="p-1.5 rounded border border-[#494847]/30 hover:bg-[#1a1919]"
                            title={item.isActive ? '停用' : '啟用'}
                          >
                            {item.isActive ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} className="text-[#adaaaa]" />}
                          </button>
                          <button
                            onClick={() => handleCatalogDelete(item)}
                            className="p-1.5 rounded border border-red-500/30 hover:bg-red-500/10"
                            title="刪除"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {activeTab === 'events' && (
          <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
            <h3 className="text-sm font-black tracking-wide text-white mb-4">最近事件（{events.length}）</h3>
            {loading && events.length === 0 ? (
              <div className="flex items-center gap-2 text-[#adaaaa] text-xs">
                <Loader2 size={12} className="animate-spin" /> 載入中...
              </div>
            ) : events.length === 0 ? (
              <p className="text-xs text-[#adaaaa]">沒有事件</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {events.map((evt, i) => (
                  <li key={evt.id || i} className="border-l-2 border-[#fcc025]/40 pl-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[9px] font-black uppercase ${
                          evt.severity === 'error'
                            ? 'text-red-400'
                            : evt.severity === 'warn' || evt.severity === 'important'
                            ? 'text-[#fcc025]'
                            : 'text-emerald-400'
                        }`}
                      >
                        {evt.severity || 'info'}
                      </span>
                      <span className="text-[9px] font-bold uppercase text-[#adaaaa]">
                        {evt.channel}/{evt.kind}
                      </span>
                    </div>
                    <p className="text-white mt-1 break-words">{evt.message}</p>
                    {evt.createdAt && (
                      <p className="text-[9px] text-[#494847] mt-1">{new Date(evt.createdAt).toLocaleString()}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
