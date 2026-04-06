import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Coinflip.css';

const COINFLIP_ROUND_MS = 15000;
const COINFLIP_LOCK_MS = 4000;

export const CoinflipView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState('10');
  const [selection, setSelection] = useState<'heads' | 'tails'>('heads');
  const [isDrawing, setIsDrawing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState('🎲 選擇正面或反面，然後開始！');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [pendingBets, setPendingBets] = useState<any[]>([]);

  // Timer logic for round tracking
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const currentRoundId = Math.floor(now / COINFLIP_ROUND_MS);
  const closesAt = (currentRoundId + 1) * COINFLIP_ROUND_MS;
  const isBettingOpen = now < (closesAt - COINFLIP_LOCK_MS);
  const secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

  const [lastRoundId, setLastRoundId] = useState<number | null>(null);

  useEffect(() => {
    if (lastRoundId !== null && lastRoundId !== currentRoundId) {
      handleDraw(lastRoundId);
    }
    setLastRoundId(currentRoundId);
  }, [currentRoundId]);

  const handleDraw = async (roundId: number) => {
    if (isDrawing) return;
    setIsDrawing(true);
    setStatus('🎲 硬幣正在翻轉中...');
    setStatusColor('#ffd36a');

    // Deterministic result based on roundId
    const seed = `coinflip:${roundId}`;
    const hash = Array.from(seed).reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const winner = hash % 2 === 0 ? 'heads' : 'tails';

    // Animation: 4 full spins (1440 deg) + target
    const baseRotation = rotation + 1440;
    const targetRotation = baseRotation + (winner === 'heads' ? (360 - (rotation % 360)) : (180 - (rotation % 360) + 360) % 360);
    setRotation(targetRotation);

    await new Promise(r => setTimeout(r, 1500));

    const roundBets = pendingBets.filter(b => b.roundId === roundId);
    if (roundBets.length > 0) {
      const winCount = roundBets.filter(b => b.selection === winner).length;
      if (winCount > 0) {
        setStatus(`🏆 恭喜！結果是 ${winner === 'heads' ? '正面' : '反面'}，獲得派彩！`);
        setStatusColor('#00ff88');
      } else {
        setStatus(`💀 結果是 ${winner === 'heads' ? '正面' : '反面'}，下次好運！`);
        setStatusColor('#ff4d4d');
      }
      setPendingBets(prev => prev.filter(b => b.roundId !== roundId));
      queryClient.invalidateQueries({ queryKey: ['user'] });
    } else {
      setStatus(`🏁 第 ${roundId} 局結果：${winner === 'heads' ? '正面' : '反面'}`);
      setStatusColor('#ffd36a');
    }

    setIsDrawing(false);
  };

  const betMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('未登入');
      const res = await fetch('/api/v1/games/coinflip/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: session.id, 
          amount: betAmount,  // Changed from betAmount to amount (string)
          action: { selection }  // Wrap selection in action object
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '下注失敗');
      return data.data;
    },
    onSuccess: (data) => {
      setPendingBets(prev => [...prev, { amount: parseFloat(betAmount), selection, roundId: data.roundId }]);
      setStatus('✅ 下注成功，等待開獎...');
      setStatusColor('#00ff88');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setStatus(`❌ 錯誤: ${err.message}`);
      setStatusColor('#ff4d4d');
    }
  });

  return (
    <div className="coinflip-container">
      <div className="text-center">
        <h3 className="text-slate-400">第 {currentRoundId} 局</h3>
        <p className={isBettingOpen ? "text-yellow-500" : "text-red-500"}>
          {isBettingOpen ? `截止下注：${secLeft} 秒` : `即將開獎：${secLeft} 秒`}
        </p>
      </div>

      <div className="coin-wrapper">
        <div className="coin" style={{ transform: `rotateY(${rotation}deg)` }}>
          <div className="coin-face coin-front">🪙</div>
          <div className="coin-face coin-back">📀</div>
        </div>
      </div>

      <div className="status-text" style={{ color: statusColor }}>
        {status}
      </div>

      <div className="coinflip-controls">
        <div className="choice-buttons">
          <button
            className={`btn-choice ${selection === 'heads' ? 'active' : ''}`}
            onClick={() => !isDrawing && setSelection('heads')}
          >
            正面 (Heads)
          </button>
          <button
            className={`btn-choice ${selection === 'tails' ? 'active' : ''}`}
            onClick={() => !isDrawing && setSelection('tails')}
          >
            反面 (Tails)
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            disabled={isDrawing || !isBettingOpen}
            className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-lg text-white"
          />
          <button
            className="btn-play px-8"
            onClick={() => betMutation.mutate()}
            disabled={isDrawing || !isBettingOpen || betMutation.isPending}
          >
            {betMutation.isPending ? '處理中...' : '確認下注'}
          </button>
        </div>
      </div>

      {pendingBets.length > 0 && (
        <div className="text-sm text-slate-500">
          目前下注：{pendingBets.map(b => `${b.selection === 'heads' ? '正' : '反'}(#${b.roundId})`).join(', ')}
        </div>
      )}
    </div>
  );
};
