import { useEffect, useState } from 'react';
import { CalendarClock, Gift, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../store/api';
import { useAuthStore } from '../../store/useAuthStore';

interface Campaign {
  campaignId: string;
  title: string;
  description?: string | null;
  isActive?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  maxClaimsPerUser?: number;
  rewards?: any;
  claimed?: boolean;
}

function formatRewardSummary(r: any): string {
  if (!r || typeof r !== 'object') return '獎勵';
  const parts: string[] = [];
  if (typeof r.zxc === 'number' && r.zxc > 0) parts.push(`${r.zxc.toLocaleString()} ZXC`);
  if (typeof r.yjc === 'number' && r.yjc > 0) parts.push(`${r.yjc.toLocaleString()} YJC`);
  if (Array.isArray(r.items) && r.items.length) parts.push(`${r.items.length} 件道具`);
  if (Array.isArray(r.avatars) && r.avatars.length) parts.push(`${r.avatars.length} 個頭像`);
  if (Array.isArray(r.titles) && r.titles.length) parts.push(`${r.titles.length} 個稱號`);
  return parts.length ? parts.join(' + ') : '獎勵';
}

export default function EventsView() {
  const navigate = useNavigate();
  const { sessionId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/rewards/campaigns').catch(() => null);
      setCampaigns(res?.data?.data?.campaigns || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [sessionId]);

  async function claim(campaignId: string) {
    if (!sessionId) {
      setMsg('請先登入');
      return;
    }
    setMsg(null);
    try {
      const res = await api.post(
        `/api/v1/rewards/campaigns/${encodeURIComponent(campaignId)}/claim`,
        { sessionId },
      );
      const payload = res?.data?.data;
      if (payload?.error) {
        setMsg(payload.error.message || payload.error.code || '領取失敗');
        return;
      }
      setMsg('領取成功');
      refresh();
    } catch (err: any) {
      setMsg(
        err?.response?.data?.data?.error?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          '領取失敗',
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0e0e] pb-20 text-white">
      <header className="sticky top-0 z-10 border-b border-[#494847]/20 bg-[#0f0e0e]/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg bg-[#1a1919] p-2 hover:bg-[#fcc025]/10"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-[#fcc025]" />
            <h1 className="text-sm font-black">活動中心</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 space-y-4">
        {msg && (
          <div className="rounded-lg border border-[#fcc025]/40 bg-[#fcc025]/10 px-3 py-2 text-xs text-[#fcc025]">
            {msg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-[#fcc025]" size={24} />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-2xl border border-[#494847]/20 bg-[#1a1919] px-4 py-8 text-center text-xs text-[#adaaaa]">
            目前沒有進行中的活動
          </div>
        ) : (
          campaigns.map((c) => (
            <section
              key={c.campaignId}
              className="rounded-2xl border border-[#494847]/20 bg-[#1a1919] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-white">{c.title}</h2>
                  {c.description && (
                    <p className="mt-1 text-[11px] text-[#adaaaa] break-words">{c.description}</p>
                  )}
                </div>
                <Gift size={18} className="shrink-0 text-[#fcc025]" />
              </div>
              <div className="mt-3 rounded-lg bg-[#262626] px-3 py-2 text-[11px] text-[#fcc025]">
                {formatRewardSummary(c.rewards)}
              </div>
              {(c.startAt || c.endAt) && (
                <p className="mt-2 text-[10px] text-[#adaaaa]">
                  {c.startAt ? new Date(c.startAt).toLocaleString() : '即刻'} ~{' '}
                  {c.endAt ? new Date(c.endAt).toLocaleString() : '無期限'}
                </p>
              )}
              <button
                type="button"
                disabled={Boolean(c.claimed) || !sessionId}
                onClick={() => claim(c.campaignId)}
                className="mt-3 w-full rounded-lg bg-[#fcc025] px-3 py-2 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-110"
              >
                {c.claimed ? '已領取' : !sessionId ? '請先登入' : '領取獎勵'}
              </button>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
