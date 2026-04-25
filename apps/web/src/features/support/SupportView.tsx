import { useEffect, useState, FormEvent } from 'react';
import { LifeBuoy, Send, Megaphone, MessageCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';
import { useAuthStore } from '../../store/useAuthStore';

interface Announcement {
  id: string;
  title: string;
  content: string;
  isPinned?: boolean;
  publishedAt?: string;
}

interface ChatMessage {
  id: string;
  displayName?: string;
  address?: string;
  text: string;
  createdAt?: string;
}

const CATEGORIES = [
  { value: 'bug', label: '回報錯誤' },
  { value: 'account', label: '帳號問題' },
  { value: 'payment', label: '金流問題' },
  { value: 'gameplay', label: '遊戲玩法' },
  { value: 'other', label: '其他' },
];

export default function SupportView() {
  const { t } = useTranslation();
  const { sessionId, isAuthorized } = useAuthStore();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketResult, setTicketResult] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get('/api/v1/support/announcements');
        if (!cancelled) {
          setAnnouncements(res.data?.data?.announcements || []);
        }
      } finally {
        if (!cancelled) setAnnouncementsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadChat() {
      setChatLoading(true);
      try {
        const res = await api.get('/api/v1/support/chat/messages');
        if (!cancelled) {
          setChatMessages(res.data?.data?.messages || []);
        }
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    }
    loadChat();
    const id = setInterval(loadChat, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function handleSubmitTicket(e: FormEvent) {
    e.preventDefault();
    if (!sessionId) {
      setTicketResult('請先登入再提交工單');
      return;
    }
    if (!title.trim() || !message.trim()) {
      setTicketResult('請填寫標題與內容');
      return;
    }
    setSubmitting(true);
    setTicketResult(null);
    try {
      const res = await api.post('/api/v1/support/tickets', {
        sessionId,
        title: title.trim(),
        category,
        message: message.trim(),
        contact: contact.trim() || undefined,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      });
      const data = res.data?.data;
      if (data?.success) {
        setTicketResult(`已建立工單：${data.reportId}`);
        setTitle('');
        setMessage('');
        setContact('');
      } else {
        setTicketResult(res.data?.data?.error?.message || '建立工單失敗');
      }
    } catch (err: any) {
      setTicketResult(err?.response?.data?.data?.error?.message || err?.message || '建立工單失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    if (!sessionId || !chatText.trim()) return;
    setChatSending(true);
    try {
      await api.post('/api/v1/support/chat/messages', {
        sessionId,
        text: chatText.trim(),
      });
      setChatText('');
      const res = await api.get('/api/v1/support/chat/messages');
      setChatMessages(res.data?.data?.messages || []);
    } catch {
      // swallow; user will see stale list
    } finally {
      setChatSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <LifeBuoy className="text-[#fcc025]" />
            <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('support.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone size={18} className="text-[#fcc025]" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white">最新公告</h2>
          </div>
          {announcementsLoading ? (
            <div className="flex items-center gap-2 text-[#adaaaa] text-sm"><Loader2 size={14} className="animate-spin" /> 載入中...</div>
          ) : announcements.length === 0 ? (
            <p className="text-sm text-[#adaaaa]">目前沒有公告</p>
          ) : (
            <ul className="space-y-3">
              {announcements.slice(0, 5).map((a) => (
                <li key={a.id} className="border-l-2 border-[#fcc025]/50 pl-3">
                  <div className="flex items-center gap-2">
                    {a.isPinned && <span className="text-[9px] font-black uppercase text-[#fcc025]">釘選</span>}
                    <h3 className="text-sm font-bold text-white">{a.title}</h3>
                  </div>
                  <p className="text-xs text-[#adaaaa] mt-1 whitespace-pre-wrap">{a.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <Send size={18} className="text-[#fcc025]" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white">提交工單</h2>
          </div>
          {!isAuthorized ? (
            <p className="text-sm text-[#adaaaa]">請先登入後再提交工單。</p>
          ) : (
            <form onSubmit={handleSubmitTicket} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#adaaaa] mb-1">標題</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm focus:border-[#fcc025]/50 focus:outline-none"
                  placeholder="簡短描述問題"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#adaaaa] mb-1">分類</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm focus:border-[#fcc025]/50 focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#adaaaa] mb-1">內容</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm focus:border-[#fcc025]/50 focus:outline-none min-h-24"
                  placeholder="詳細描述、重現步驟、預期行為"
                  maxLength={2000}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#adaaaa] mb-1">聯絡方式（選填）</label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm focus:border-[#fcc025]/50 focus:outline-none"
                  placeholder="Email / Discord / Telegram"
                  maxLength={200}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#fcc025] text-[#0e0e0e] font-black uppercase tracking-widest text-xs py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                提交工單
              </button>
              {ticketResult && (
                <p className="text-xs text-[#fcc025] mt-2">{ticketResult}</p>
              )}
            </form>
          )}
        </section>

        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle size={18} className="text-[#fcc025]" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white">全站聊天室</h2>
          </div>
          <div className="bg-[#0e0e0e] border border-[#494847]/20 rounded-lg p-3 h-60 overflow-y-auto flex flex-col gap-2 mb-3">
            {chatLoading && chatMessages.length === 0 ? (
              <div className="flex items-center gap-2 text-[#adaaaa] text-xs"><Loader2 size={12} className="animate-spin" /> 載入中...</div>
            ) : chatMessages.length === 0 ? (
              <p className="text-xs text-[#adaaaa]">目前沒有訊息，來打聲招呼吧。</p>
            ) : (
              chatMessages.slice(-50).map((msg) => (
                <div key={msg.id} className="text-xs">
                  <span className="font-bold text-[#fcc025] mr-2">{msg.displayName || msg.address?.slice(0, 6) || '匿名玩家'}</span>
                  <span className="text-white whitespace-pre-wrap">{msg.text}</span>
                </div>
              ))
            )}
          </div>
          {isAuthorized ? (
            <form onSubmit={handleSendChat} className="flex gap-2">
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                className="flex-1 bg-[#0e0e0e] border border-[#494847]/30 rounded-lg px-3 py-2 text-sm focus:border-[#fcc025]/50 focus:outline-none"
                placeholder="輸入訊息..."
                maxLength={500}
              />
              <button
                type="submit"
                disabled={chatSending || !chatText.trim()}
                className="bg-[#fcc025] text-[#0e0e0e] font-black uppercase tracking-widest text-xs px-4 rounded-lg disabled:opacity-50"
              >
                {chatSending ? <Loader2 size={14} className="animate-spin" /> : '送出'}
              </button>
            </form>
          ) : (
            <p className="text-xs text-[#adaaaa]">登入後才能發言</p>
          )}
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
