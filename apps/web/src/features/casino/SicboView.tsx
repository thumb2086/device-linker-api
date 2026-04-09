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
  const [now, setNow] = useState(Date.now());

  const ROUND_MS = 20000;
  const LOCK_MS = 4000;
  const currentRoundId = Math.floor(now / ROUND_MS);
  const closesAt = (currentRoundId + 1) * ROUND_MS;
  const isBettingOpen = now < closesAt - LOCK_MS;
  const secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const betMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('未登入');
      if (!isBettingOpen) throw new Error('封盤中，請等下一局');

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
      setDicePreview(data.dice || [1, 1, 1]);
      setStatus(`🎯 開獎總點 ${data.total}（${data.isBig ? '大' : '小'}）`);
      setStatusColor(data.result === 'win' ? '#00ff88' : '#ff4d4d');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setStatus(`❌ 下注失敗：${err.message}`);
      setStatusColor('#ff4d4d');
    },
  });

  useEffect(() => {
    if (!betMutation.isPending) return;
    const rolling = window.setInterval(() => {
      setDicePreview([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
    }, 120);
    return () => window.clearInterval(rolling);
  }, [betMutation.isPending]);

  return (
    <div className="sicbo-container">
      <div className="text-center text-sm">
        <div className="text-slate-300">第 {currentRoundId} 局</div>
        <div className={isBettingOpen ? 'text-yellow-500' : 'text-red-500'}>
          {isBettingOpen ? `封盤倒數 ${secLeft} 秒` : `開獎中 ${secLeft} 秒`}
        </div>
      </div>
      <div className="dice-area">
        {(betMutation.isPending ? dicePreview : result?.dice || dicePreview).map((d: number, i: number) => (
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
          disabled={betMutation.isPending || !isBettingOpen}
        />
        <BetQuickActions amount={betAmount} onChange={setBetAmount} disabled={betMutation.isPending || !isBettingOpen} />
        <button
          className="bg-yellow-500 text-black font-bold px-12 rounded-lg hover:bg-yellow-400 disabled:opacity-50"
          onClick={() => betMutation.mutate()}
          disabled={betMutation.isPending || !isBettingOpen}
        >
          {betMutation.isPending ? '搖骰中…' : isBettingOpen ? '立即下注' : '封盤中'}
        </button>
      </div>

      <div className="sicbo-status" style={{ color: statusColor }}>{status}</div>
    </div>
  );
};
