import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../store/api';

export default function ChatRoom() {
  const [inputText, setInputText] = useState('');
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const { username } = useUserStore();
  const { isAuthorized } = useAuthStore();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: chatData } = useQuery({
    queryKey: ['chat-messages'],
    queryFn: async () => {
      const res = await api.get('/api/v1/support/chat/messages');
      return res.data.data;
    },
    enabled: isAuthorized,
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      await api.post('/api/v1/support/chat/messages', { text, displayName: username });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
    },
  });

  const messages = chatData?.messages || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-[400px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 p-3">
        <span className="text-xs font-black uppercase tracking-widest text-blue-400">
          {isZh ? '\u5168\u57df\u804a\u5929' : 'Global Chat'}
        </span>
        <span className="text-[10px] text-slate-600">ONLINE: 42</span>
      </div>

      <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m: any) => (
          <div key={m.id} className="animate-in slide-in-from-bottom-1 fade-in text-xs">
            <span className="mr-2 font-black text-yellow-500">[{m.displayName}]:</span>
            <span className="text-slate-300">{m.text}</span>
          </div>
        ))}
      </div>

      <form
        className="flex gap-2 border-t border-slate-800 bg-slate-950 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!inputText.trim()) return;
          sendMutation.mutate(inputText);
          setInputText('');
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isZh ? '\u8aaa\u9ede\u4ec0\u9ebc...' : 'Say something...'}
          className="flex-1 rounded border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white transition-colors focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-blue-500"
          disabled={sendMutation.isPending}
        >
          {isZh ? '\u767c\u9001' : 'Send'}
        </button>
      </form>
    </div>
  );
}
