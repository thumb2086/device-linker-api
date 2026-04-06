import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Duel.css';

export const DuelView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [stakeTier, setStakeTier] = useState(1000);
  const [status, setStatus] = useState('⚔️ 選擇檔位加入配對，與其他玩家進行 1v1 對戰！');
  const [logs, setLogs] = useState<string[]>([]);

  // Periodically poll for duel status
  const { data: duelData } = useQuery({
    queryKey: ['duel-status'],
    queryFn: async () => {
      const res = await fetch('/api/v1/games/duel/status');
      if (!res.ok) return { status: 'idle' };
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 3000,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/games/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id, amount: stakeTier.toString(), action: { type: 'join' } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '加入失敗');
      return data.data;
    },
    onSuccess: () => {
      setStatus('✅ 已加入隊列，正在尋找對手...');
      setLogs(prev => [`[${new Date().toLocaleTimeString()}] 你加入了 ${stakeTier} 檔位的配對隊列`, ...prev]);
      queryClient.invalidateQueries({ queryKey: ['duel-status'] });
    },
    onError: (err: Error) => {
      setStatus(`❌ 錯誤: ${err.message}`);
    }
  });

  const rollMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/games/duel/rounds/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'roll' })
      });
      return res.json();
    },
    onSuccess: () => {
      setStatus('🎲 已擲骰，等待對手結果...');
      queryClient.invalidateQueries({ queryKey: ['duel-status'] });
    }
  });

  const isIdle = !duelData || duelData.status === 'idle';
  const isWaiting = duelData?.status === 'waiting';
  const isMatch = duelData?.status === 'match';
  const match = duelData?.match;

  return (
    <div className="duel-container">
      <div className="duel-stage">
        <div className={`player-card ${isMatch ? 'active' : ''}`}>
          <div className="text-sm text-slate-500 mb-2">YOU</div>
          <div className="text-xl font-bold">{match?.self?.displayName || 'PLAYER 1'}</div>
          <div className="player-score">{match?.score?.self || 0}</div>
          <div className="text-xs text-slate-500 uppercase">Score</div>
        </div>

        <div className="vs-badge">VS</div>

        <div className={`player-card ${isMatch ? 'active' : ''}`}>
          <div className="text-sm text-slate-500 mb-2">OPPONENT</div>
          <div className="text-xl font-bold">{match?.opponent?.displayName || (isWaiting ? 'WAITING...' : 'PLAYER 2')}</div>
          <div className="player-score">{match?.score?.opponent || 0}</div>
          <div className="text-xs text-slate-500 uppercase">Score</div>
        </div>
      </div>

      {isIdle && (
        <>
          <div className="stake-selector">
            {[1000, 5000, 10000].map(tier => (
              <div
                key={tier}
                className={`stake-tier ${stakeTier === tier ? 'active' : ''}`}
                onClick={() => setStakeTier(tier)}
              >
                {tier} ZXC
              </div>
            ))}
          </div>
          <button
            className="w-full bg-yellow-500 text-black font-bold py-4 rounded-xl text-lg hover:bg-yellow-400 disabled:opacity-50"
            onClick={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
          >
            {joinMutation.isPending ? '加入中...' : '⚔️ 加入對戰隊列'}
          </button>
        </>
      )}

      {isWaiting && (
        <div className="text-center p-8 bg-slate-900/50 rounded-xl border border-slate-800">
          <div className="animate-pulse text-yellow-500 text-xl font-bold mb-4">MATCHMAKING...</div>
          <p className="text-slate-400">目前檔位: {duelData.waiting?.stakeTier} ZXC</p>
          <button
            className="mt-6 text-red-500 hover:text-red-400 underline"
            onClick={async () => {
              await fetch('/api/v1/games/duel/rounds/actions', { method: 'POST', body: JSON.stringify({ type: 'cancel' }) });
              queryClient.invalidateQueries({ queryKey: ['duel-status'] });
            }}
          >
            取消配對
          </button>
        </div>
      )}

      {isMatch && (
        <div className="flex gap-4">
          <button
            className="flex-1 bg-green-500 text-black font-bold py-4 rounded-xl hover:bg-green-400 disabled:opacity-50"
            onClick={() => rollMutation.mutate()}
            disabled={match?.canRoll === false || rollMutation.isPending}
          >
            🎲 擲骰子
          </button>
        </div>
      )}

      <div className="mt-8">
        <h4 className="text-slate-500 text-sm uppercase font-bold mb-4">對戰日誌</h4>
        <div className="duel-logs">
          {logs.map((log, i) => (
            <div key={i} className="log-entry">{log}</div>
          ))}
          {match?.log?.map((l: string, i: number) => (
            <div key={i} className="log-entry">{l}</div>
          ))}
          {logs.length === 0 && !match?.log && <div className="text-center py-4 text-slate-700">尚未有戰鬥日誌</div>}
        </div>
      </div>

      <div className="mt-6 text-center text-yellow-500 font-bold">
        {status}
      </div>
    </div>
  );
};
