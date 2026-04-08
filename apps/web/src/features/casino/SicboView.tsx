import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Sicbo.css';
import { extractGameError, unwrapGameEnvelope } from './gameClient';

export const SicboView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState('10');
  const [selectedBet, setSelectedBet] = useState<'big' | 'small'>('big');
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState('🎲 請選擇大小並下注');
  const [statusColor, setStatusColor] = useState('#ffd36a');

  const betMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No session');

      const res = await fetch('/api/v1/games/sicbo/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          betAmount: Number(betAmount),
          bets: [{ type: selectedBet }],
        }),
      });

      const payload = await res.json();
      if (!res.ok || payload?.success === false) {
        throw new Error(extractGameError(payload));
      }

      return unwrapGameEnvelope<any>(payload);
    },
    onSuccess: (data) => {
      setResult(data);
      setStatus(`🎯 開獎總點 ${data.total}（${data.isBig ? '大' : '小'}）`);
      setStatusColor(data.result === 'win' ? '#00ff88' : '#ff4d4d');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setStatus(`❌ 下注失敗：${err.message}`);
      setStatusColor('#ff4d4d');
    },
  });

  return (
    <div className="sicbo-container">
      <div className="dice-area">
        {(result?.dice || [1, 1, 1]).map((d: number, i: number) => (
          <div key={i} className="die">{d}</div>
        ))}
      </div>

      <div className="sicbo-betting-grid">
        <div className={`bet-option ${selectedBet === 'small' ? 'active' : ''}`} onClick={() => setSelectedBet('small')}>
          <span className="bet-label">小 (4-10)</span>
          <span className="bet-odds">x2.0</span>
        </div>
        <div className={`bet-option ${selectedBet === 'big' ? 'active' : ''}`} onClick={() => setSelectedBet('big')}>
          <span className="bet-label">大 (11-17)</span>
          <span className="bet-odds">x2.0</span>
        </div>
      </div>

      <div className="sicbo-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-lg text-white font-mono"
        />
        <button
          className="bg-yellow-500 text-black font-bold px-12 rounded-lg hover:bg-yellow-400 disabled:opacity-50"
          onClick={() => betMutation.mutate()}
          disabled={betMutation.isPending}
        >
          {betMutation.isPending ? '下注中…' : '立即下注'}
        </button>
      </div>

      <div className="sicbo-status" style={{ color: statusColor }}>{status}</div>
    </div>
  );
};
