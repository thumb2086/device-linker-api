import { useEffect, useState, FormEvent } from 'react';
import { ShieldAlert, Activity, AlertOctagon, Ban, Coins, Megaphone, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

export default function AdminView() {
  const { t } = useTranslation();
  const { sessionId, isAuthorized } = useAuthStore();

  const [authErr, setAuthErr] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [loading, setLoading] = useState(true);

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

  const [actionResult, setActionResult] = useState<string | null>(null);

  async function refresh() {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [healthRes, eventsRes] = await Promise.all([
        api.get('/api/v1/admin/ops/health').catch((err) => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            setAuthErr('你不是管理員或未登入');
          }
          return null;
        }),
        api.get('/api/v1/admin/ops/events?limit=20').catch(() => null),
      ]);
      if (healthRes?.data?.data) {
        const h = healthRes.data.data;
        setHealth(h);
        setMaintenanceOn(Boolean(h.maintenance));
      }
      if (eventsRes?.data?.data?.events) {
        setEvents(eventsRes.data.data.events);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [sessionId]);

  async function handleMaintenance(e: FormEvent) {
    e.preventDefault();
    setActionResult(null);
    try {
      await api.post('/api/v1/admin/maintenance', {
        sessionId,
        enabled: !maintenanceOn,
        message: maintenanceMessage || undefined,
      });
      setMaintenanceOn(!maintenanceOn);
      setActionResult(!maintenanceOn ? '維護模式已啟用' : '維護模式已停用');
      refresh();
    } catch (err: any) {
      setActionResult(err?.response?.data?.data?.error?.message || err?.message || '操作失敗');
    }
  }

  async function handleBlacklist(e: FormEvent) {
    e.preventDefault();
    if (!blacklistAddress.trim()) return;
    setActionResult(null);
    try {
      await api.post('/api/v1/admin/blacklist', {
        sessionId,
        address: blacklistAddress.trim(),
        reason: blacklistReason.trim() || undefined,
      });
      setActionResult(`已加入黑名單：${blacklistAddress}`);
      setBlacklistAddress('');
      setBlacklistReason('');
      refresh();
    } catch (err: any) {
      setActionResult(err?.response?.data?.data?.error?.message || err?.message || '操作失敗');
    }
  }

  async function handleAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustAddress.trim() || !adjustAmount.trim()) return;
    setActionResult(null);
    try {
      const res = await api.post('/api/v1/admin/adjust-balance', {
        sessionId,
        address: adjustAddress.trim(),
        amount: adjustAmount.trim(),
        token: adjustToken,
        reason: adjustReason.trim() || 'admin_adjust',
      });
      const data = res.data?.data;
      setActionResult(`餘額已調整：${data?.balanceBefore ?? '?'} → ${data?.balanceAfter ?? '?'}`);
      setAdjustAmount('');
      setAdjustReason('');
      refresh();
    } catch (err: any) {
      setActionResult(err?.response?.data?.data?.error?.message || err?.message || '操作失敗');
    }
  }

  async function handleAnnouncement(e: FormEvent) {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim()) return;
    setActionResult(null);
    try {
      await api.post('/api/v1/admin/announcements', {
        sessionId,
        title: announcementTitle.trim(),
        content: announcementContent.trim(),
        pinned: announcementPinned,
      });
      setActionResult(`公告已發布：${announcementTitle}`);
      setAnnouncementTitle('');
      setAnnouncementContent('');
      setAnnouncementPinned(false);
    } catch (err: any) {
      setActionResult(err?.response?.data?.data?.error?.message || err?.message || '操作失敗');
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="app-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <ShieldAlert className="text-[#fcc025]" />
            <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('nav.admin')}</h1>
          </div>
          <button onClick={refresh} className="p-2 rounded-lg border border-[#494847]/30 hover:bg-[#262626]">
            <RefreshCw size={16} className={loading ? 'animate-spin text-[#fcc025]' : 'text-[#adaaaa]'} />
          </button>
        </div>
      </header>

      <main className="app-shell space-y-8 pt-24">
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

        {actionResult && (
          <section className="bg-[#1a1919] rounded-2xl p-4 border border-[#fcc025]/30">
            <p className="text-xs text-[#fcc025]">{actionResult}</p>
          </section>
        )}

        {/* System Health */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Activity size={16} className="text-[#adaaaa]" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">SYSTEM HEALTH / 系統狀態</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'QUEUED TX', value: health?.queuedTxIntents ?? '-' },
              { label: 'PENDING SETTLEMENT', value: health?.pendingSettlements ?? '-' },
              { label: 'OPEN TICKETS', value: health?.openTickets ?? '-' },
              { label: 'MAINTENANCE', value: maintenanceOn ? 'ON' : 'OFF' },
            ].map((s) => (
              <div key={s.label} className="bg-[#1a1919] rounded-2xl p-4 border border-[#494847]/20">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#adaaaa]">{s.label}</p>
                <p className="text-2xl font-black italic tracking-tighter text-[#fcc025] mt-2">{s.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Maintenance */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <AlertOctagon size={18} className="text-[#fcc025]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white">維護模式</h3>
          </div>
          <form onSubmit={handleMaintenance} className="space-y-3">
            <input
              type="text"
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm"
              placeholder="維護訊息（可選）"
              maxLength={200}
            />
            <button type="submit" className={`w-full py-2 rounded-lg text-xs font-black uppercase tracking-widest ${maintenanceOn ? 'bg-[#494847] text-white' : 'bg-[#fcc025] text-[#0e0e0e]'}`}>
              {maintenanceOn ? '停用維護模式' : '啟用維護模式'}
            </button>
          </form>
        </section>

        {/* Blacklist */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <Ban size={18} className="text-[#fcc025]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white">黑名單</h3>
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
              placeholder="原因"
              maxLength={200}
            />
            <button type="submit" className="w-full py-2 bg-red-600 text-white rounded-lg text-xs font-black uppercase tracking-widest">
              加入黑名單
            </button>
          </form>
        </section>

        {/* Adjust Balance */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <Coins size={18} className="text-[#fcc025]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white">調整餘額</h3>
          </div>
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
                <option value="zhixi">ZXC</option>
                <option value="yjc">YJC</option>
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
            <button type="submit" className="w-full py-2 bg-[#fcc025] text-[#0e0e0e] rounded-lg text-xs font-black uppercase tracking-widest">
              調整餘額
            </button>
          </form>
        </section>

        {/* Announcement */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone size={18} className="text-[#fcc025]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white">發佈公告</h3>
          </div>
          <form onSubmit={handleAnnouncement} className="space-y-3">
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
              className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm min-h-20"
              placeholder="內容"
              maxLength={2000}
            />
            <label className="flex items-center gap-2 text-xs text-[#adaaaa]">
              <input type="checkbox" checked={announcementPinned} onChange={(e) => setAnnouncementPinned(e.target.checked)} />
              釘選於公告最上方
            </label>
            <button type="submit" className="w-full py-2 bg-[#fcc025] text-[#0e0e0e] rounded-lg text-xs font-black uppercase tracking-widest">
              發佈公告
            </button>
          </form>
        </section>

        {/* Ops Events */}
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4">最近事件</h3>
          {loading && events.length === 0 ? (
            <div className="flex items-center gap-2 text-[#adaaaa] text-xs"><Loader2 size={12} className="animate-spin" /> 載入中...</div>
          ) : events.length === 0 ? (
            <p className="text-xs text-[#adaaaa]">沒有事件</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {events.map((evt, i) => (
                <li key={evt.id || i} className="border-l-2 border-[#fcc025]/40 pl-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase ${evt.severity === 'error' ? 'text-red-400' : evt.severity === 'warn' ? 'text-[#fcc025]' : 'text-emerald-400'}`}>
                      {evt.severity || 'info'}
                    </span>
                    <span className="text-[9px] font-bold uppercase text-[#adaaaa]">{evt.channel}/{evt.kind}</span>
                  </div>
                  <p className="text-white mt-1">{evt.message}</p>
                  {evt.createdAt && <p className="text-[9px] text-[#494847] mt-1">{new Date(evt.createdAt).toLocaleString()}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
