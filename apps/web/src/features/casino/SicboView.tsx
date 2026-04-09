import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Sicbo.css';
import './CasinoCommon.css';
import { extractGameError, unwrapGameEnvelope } from './gameClient';
import { BetQuickActions } from './BetQuickActions';

export const SicboView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState('10');
  const [selectedBet, setSelectedBet] = useState<'big' | 'small'>('big');
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState('🎲 請選擇大小並下注');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [dicePreview, setDicePreview] = useState([1, 1, 1]);
  const [isRevealing, setIsRevealing] = useState(false);
  const [roundNo, setRoundNo] = useState(1);

  const betMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('未登入');

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
      setIsRevealing(true);
      setStatus('🎲 開獎中...');
      setStatusColor('#ffd36a');
      window.setTimeout(() => {
        setResult(data);
        setDicePreview(data.dice || [1, 1, 1]);
        setStatus(`🎯 第 ${roundNo} 局開獎總點 ${data.total}（${data.isBig ? '大' : '小'}）`);
        setStatusColor(data.result === 'win' ? '#00ff88' : '#ff4d4d');
        setRoundNo((prev) => prev + 1);
        setIsRevealing(false);
        queryClient.invalidateQueries({ queryKey: ['user'] });
      }, 1100);
    },
    onError: (err: Error) => {
      setStatus(`❌ 下注失敗：${err.message}`);
      setStatusColor('#ff4d4d');
    },
  });

  useEffect(() => {
    if (!betMutation.isPending && !isRevealing) return;
    const rolling = window.setInterval(() => {
      setDicePreview([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
    }, 120);
    return () => window.clearInterval(rolling);
  }, [betMutation.isPending, isRevealing]);

  return (
    <div className="sicbo-container">
      <div className="dice-area">
        {((betMutation.isPending || isRevealing) ? dicePreview : result?.dice || dicePreview).map((d: number, i: number) => (
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
          disabled={betMutation.isPending || isRevealing}
        />
        <BetQuickActions amount={betAmount} onChange={setBetAmount} disabled={betMutation.isPending || isRevealing} />
        <button
          className="bg-yellow-500 text-black font-bold px-12 rounded-lg hover:bg-yellow-400 disabled:opacity-50"
          onClick={() => betMutation.mutate()}
          disabled={betMutation.isPending || isRevealing}
        >
          {betMutation.isPending || isRevealing ? '開獎中…' : '下注並開獎'}
        </button>
      </div>

      <div className="sicbo-status" style={{ color: statusColor }}>{status}</div>
    </div>
  );
};
