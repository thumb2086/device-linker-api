import { useEffect, useState, FormEvent } from 'react';
import { Loader2, Send, Check, X, Clock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../store/api';
import { useAuthStore } from '../../store/useAuthStore';

interface Submission {
  submissionId: string;
  type: 'avatar' | 'title';
  name: string;
  icon?: string | null;
  description?: string | null;
  rarity: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string | null;
  createdAt?: string;
}

const STATUS_LABEL: Record<string, { text: string; cls: string; Icon: typeof Clock }> = {
  pending: { text: '待審核', cls: 'text-[#fcc025]', Icon: Clock },
  approved: { text: '已通過', cls: 'text-emerald-400', Icon: Check },
  rejected: { text: '已拒絕', cls: 'text-red-400', Icon: X },
};

const EMOJI_SUGGESTIONS = ['🎱', '🎲', '🃏', '🎰', '💎', '🌟', '⚡', '🔥', '🎯', '🪄', '👑', '🛡️', '🗡️', '🏆', '🎖️', '🎩', '🦾', '🐉', '🦁', '🐺'];

export default function SubmitRewardView() {
  const navigate = useNavigate();
  const { sessionId } = useAuthStore();

  const [type, setType] = useState<'avatar' | 'title'>('avatar');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [rarity, setRarity] = useState<'common' | 'rare' | 'epic' | 'legendary' | 'mythic'>('common');
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  async function refresh() {
    if (!sessionId) return;
    setLoadingList(true);
    try {
      const res = await api.get('/api/v1/rewards/submissions/me').catch(() => null);
      if (res?.data?.data?.submissions) setMySubmissions(res.data.data.submissions);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sessionId) {
      setResultMsg('請先登入');
      return;
    }
    if (!name.trim()) {
      setResultMsg('請輸入名稱');
      return;
    }
    if (type === 'avatar' && !icon.trim()) {
      setResultMsg('頭像必須填一個表情符號');
      return;
    }
    setSubmitting(true);
    setResultMsg(null);
    try {
      await api.post('/api/v1/rewards/submissions', {
        sessionId,
        type,
        name: name.trim(),
        icon: icon.trim() || undefined,
        description: description.trim() || undefined,
        rarity,
      });
      setResultMsg('已送出，請等待管理員審核');
      setName('');
      setIcon('');
      setDescription('');
      setRarity('common');
      refresh();
    } catch (err: any) {
      setResultMsg(err?.response?.data?.error?.message || err?.message || '送出失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0e0e] pb-20 text-white">
      <header className="sticky top-0 z-10 border-b border-[#494847]/20 bg-[#0f0e0e]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a1919] hover:bg-[#262626]"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-black tracking-wide">投稿稱號／頭像</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <section className="rounded-2xl border border-[#494847]/20 bg-[#1a1919] p-6">
          <h2 className="mb-3 text-sm font-black">新增投稿</h2>
          <p className="mb-4 text-xs text-[#adaaaa]">
            把你想要的頭像（表情符號）或稱號填下面送出，管理員會審核，通過後會加到全站的稱號頭像清單裡讓大家使用。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">類型</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType('avatar')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-black transition-all ${
                    type === 'avatar'
                      ? 'border-[#fcc025] bg-[#fcc025]/10 text-[#fcc025]'
                      : 'border-[#494847]/30 bg-[#262626] text-[#adaaaa]'
                  }`}
                >
                  頭像
                </button>
                <button
                  type="button"
                  onClick={() => setType('title')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-black transition-all ${
                    type === 'title'
                      ? 'border-[#fcc025] bg-[#fcc025]/10 text-[#fcc025]'
                      : 'border-[#494847]/30 bg-[#262626] text-[#adaaaa]'
                  }`}
                >
                  稱號
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                名稱（最多 32 字）
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                placeholder={type === 'avatar' ? '例如：火焰戰士' : '例如：百戰百勝'}
                className="w-full rounded-lg border border-[#494847]/30 bg-[#262626] px-3 py-2 text-sm text-white placeholder:text-[#494847] focus:border-[#fcc025] focus:outline-none"
              />
            </div>

            {type === 'avatar' && (
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                  表情符號（僅接受一個 emoji，不開放圖片上傳）
                </label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  maxLength={8}
                  placeholder="🔥"
                  className="mb-2 w-full rounded-lg border border-[#494847]/30 bg-[#262626] px-3 py-2 text-2xl text-white placeholder:text-[#494847] focus:border-[#fcc025] focus:outline-none"
                />
                <div className="flex flex-wrap gap-1">
                  {EMOJI_SUGGESTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setIcon(e)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-[#262626] text-lg hover:bg-[#fcc025]/20"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                說明（選填，最多 240 字）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={240}
                rows={3}
                placeholder="描述這個頭像或稱號的故事"
                className="w-full rounded-lg border border-[#494847]/30 bg-[#262626] px-3 py-2 text-sm text-white placeholder:text-[#494847] focus:border-[#fcc025] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                建議稀有度（管理員可調整）
              </label>
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value as any)}
                className="w-full rounded-lg border border-[#494847]/30 bg-[#262626] px-3 py-2 text-sm text-white focus:border-[#fcc025] focus:outline-none"
              >
                <option value="common">普通</option>
                <option value="rare">稀有</option>
                <option value="epic">史詩</option>
                <option value="legendary">傳說</option>
                <option value="mythic">神話</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#fcc025] px-4 py-3 text-sm font-black text-black hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              送出投稿
            </button>

            {resultMsg && (
              <p className="text-center text-xs text-[#fcc025]">{resultMsg}</p>
            )}
          </form>
        </section>

        <section className="rounded-2xl border border-[#494847]/20 bg-[#1a1919] p-6">
          <h2 className="mb-3 text-sm font-black">我的投稿紀錄</h2>
          {loadingList ? (
            <div className="flex items-center gap-2 text-xs text-[#adaaaa]">
              <Loader2 size={12} className="animate-spin" /> 載入中...
            </div>
          ) : mySubmissions.length === 0 ? (
            <p className="text-xs text-[#adaaaa]">你還沒有任何投稿</p>
          ) : (
            <ul className="space-y-3">
              {mySubmissions.map((sub) => {
                const status = STATUS_LABEL[sub.status] || STATUS_LABEL.pending;
                const StatusIcon = status.Icon;
                return (
                  <li
                    key={sub.submissionId}
                    className="rounded-lg border border-[#494847]/20 bg-[#262626] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1a1919] text-2xl">
                        {sub.icon || (sub.type === 'avatar' ? '👤' : '🏷')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black">{sub.name}</span>
                          <span className="text-[9px] font-bold uppercase text-[#adaaaa]">
                            {sub.type === 'avatar' ? '頭像' : '稱號'}
                          </span>
                          <span className={`flex items-center gap-1 text-[9px] font-bold uppercase ${status.cls}`}>
                            <StatusIcon size={10} />
                            {status.text}
                          </span>
                        </div>
                        {sub.description && (
                          <p className="mt-1 text-xs text-[#adaaaa] break-words">{sub.description}</p>
                        )}
                        {sub.reviewNote && (
                          <p className="mt-1 text-[10px] text-[#adaaaa]">管理員備註：{sub.reviewNote}</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
