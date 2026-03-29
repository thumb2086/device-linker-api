import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../store/api';

export default function ChatRoom() {
  const [inputText, setInputText] = useState('');
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
    <div className="flex flex-col h-[400px] bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="bg-slate-950 p-3 border-b border-slate-800 flex justify-between items-center">
        <span className="text-xs font-black text-blue-400 uppercase tracking-widest">Global Chat</span>
        <span className="text-[10px] text-slate-600">ONLINE: 42</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {messages.map((m: any) => (
          <div key={m.id} className="text-xs animate-in fade-in slide-in-from-bottom-1">
            <span className="font-black text-yellow-500 mr-2">[{m.displayName}]:</span>
            <span className="text-slate-300">{m.text}</span>
          </div>
        ))}
      </div>

      <form
        className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2"
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
          placeholder="說點什麼..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
          disabled={sendMutation.isPending}
        >
          發送
        </button>
      </form>
    </div>
  );
}
