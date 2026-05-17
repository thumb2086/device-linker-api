import { useEffect, useState } from 'react';
import { CalendarClock, Gift, ArrowLeft, Loader2, X } from 'lucide-react';
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

const REWARD_NAMES: Record<string, string> = {
  title_newbie: '初心者',
  title_gambler: '賭徒',
  title_highroller: '豪客',
  title_god: '賭神',
  title_member_1: '普通會員',
  title_member_2: '銅牌會員',
  title_member_3: '銀牌會員',
  title_member_4: '金牌會員',
  title_member_5: '白金會員',
  title_member_6: '鑽石會員',
  title_member_7: '星辰會員',
  title_member_8: '皓月會員',
  title_member_9: '驕陽會員',
  title_member_10: '至尊會員',
  title_member_11: '天選之人',
  title_member_12: '不朽傳奇',
  title_member_13: '永恆神話',
  title_member_14: '深淵凝視',
  title_member_15: '虛空行者',
  title_member_16: '混沌主宰',
  title_member_17: '命運編織者',
  title_member_18: '時光守護者',
  title_member_19: '創世之光',
  title_member_20: '終焉審判',
  title_member_21: '輪迴之主',
  title_member_22: '太初之始',
  title_member_23: '無極之境',
  title_member_24: '大道歸一',
  title_member_25: '鴻蒙聖人',
  title_member_26: '天道化身',
  title_member_27: '規則制定者',
  title_member_28: '宇宙之心',
  title_member_29: '萬物之源',
  title_member_30: '超越者',
  title_member_31: '至高神座',
  title_member_32: '神諭十二階',
};

function resolveRewardName(id: string): string {
  return REWARD_NAMES[id] || id;
}

function formatRewardSummary(r: any): string {
  if (!r || typeof r !== 'object') return '獎勵';
  const parts: string[] = [];
  if (typeof r.zxc === 'number' && r.zxc > 0) parts.push(`${r.zxc.toLocaleString()} ZXC`);
  if (typeof r.yjc === 'number' && r.yjc > 0) parts.push(`${r.yjc.toLocaleString()} YJC`);
  if (Array.isArray(r.items) && r.items.length > 0) {
    const labels = r.items.map((it: any) => {
      const name = it.name || resolveRewardName(it.id || '') || it.id || '道具';
      const qty = it.qty || 1;
      return qty > 1 ? `${name} ×${qty}` : name;
    });
    parts.push(labels.join('、'));
  }
  if (Array.isArray(r.avatars) && r.avatars.length) {
    const labels = r.avatars.map((a: string) => resolveRewardName(a));
    parts.push(`頭像：${labels.join('、')}`);
  }
  if (Array.isArray(r.titles) && r.titles.length) {
    const labels = r.titles.map((t: string) => resolveRewardName(t));
    parts.push(`稱號：${labels.join('、')}`);
  }
  return parts.length ? parts.join(' + ') : '獎勵';
}

export default function EventsView() {
  const navigate = useNavigate();
  const { sessionId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [successBundle, setSuccessBundle] = useState<any>(null);

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

  useEffect(() => {
    if (msg) { const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t); }
  }, [msg]);

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
      setSuccessBundle(payload?.bundle || null);
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
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-[#1a1919] border border-[#fcc025]/40 shadow-lg shadow-black/50 text-sm font-bold text-white animate-[fadeIn_0.3s_ease-out] whitespace-nowrap">
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

      {successBundle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setSuccessBundle(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[#494847]/20 bg-[#1a1919] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-[#fcc025]">🎉 領取成功</h3>
              <button type="button" onClick={() => setSuccessBundle(null)} className="rounded-lg p-1 hover:bg-white/10">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-xs text-white">
              {successBundle.zxc > 0 && <p>+ {Number(successBundle.zxc).toLocaleString()} ZXC</p>}
              {successBundle.yjc > 0 && <p>+ {Number(successBundle.yjc).toLocaleString()} YJC</p>}
              {Array.isArray(successBundle.items) && successBundle.items.map((it: any, i: number) => (
                <p key={i}>道具：{it.name || resolveRewardName(it.id) || it.id} {it.qty > 1 ? `×${it.qty}` : ''}</p>
              ))}
              {Array.isArray(successBundle.avatars) && successBundle.avatars.map((a: any, i: number) => (
                <p key={i}>頭像：{a.name || resolveRewardName(a.id || a) || a.id || a}</p>
              ))}
              {Array.isArray(successBundle.titles) && successBundle.titles.map((t: any, i: number) => (
                <p key={i}>稱號：{t.name || resolveRewardName(t.id || t) || t.id || t}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSuccessBundle(null)}
              className="mt-4 w-full rounded-lg bg-[#fcc025] px-3 py-2 text-xs font-black text-black"
            >
              確定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
