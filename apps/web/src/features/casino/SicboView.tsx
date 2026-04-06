import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Sicbo.css';

const SICBO_ROUND_MS = 20000;
const SICBO_LOCK_MS = 4000;

export const SicboView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState('10');
  const [selectedBet, setSelectedBet] = useState<'big' | 'small' | 'total'>('big');
  const [dice, setDice] = useState<number[]>([1, 1, 1]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState('🎲 猜大小或點數總和！');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [pendingBets, setPendingBets] = useState<any[]>([]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const currentRoundId = Math.floor(now / SICBO_ROUND_MS);
  const closesAt = (currentRoundId + 1) * SICBO_ROUND_MS;
  const isBettingOpen = now < (closesAt - SICBO_LOCK_MS);
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
    setStatus('🎲 骰子正在滾動中...');
    setStatusColor('#ffd36a');

    // Deterministic result
    const seed = `sicbo:${roundId}`;
    const hash = Array.from(seed).reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const resultDice = [
      (hash % 6) + 1,
      (Math.floor(hash / 6) % 6) + 1,
      (Math.floor(hash / 36) % 6) + 1
    ];
    const total = resultDice.reduce((a, b) => a + b, 0);
    const isBig = total >= 11 && total <= 17;
    const isSmall = total >= 4 && total <= 10;

    // Shake animation
    for (let i = 0; i < 10; i++) {
      setDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ]);
      await new Promise(r => setTimeout(r, 100));
    }

    setDice(resultDice);

    const roundBets = pendingBets.filter(b => b.roundId === roundId);
    if (roundBets.length > 0) {
      let win = false;
      roundBets.forEach(b => {
        if (b.type === 'big' && isBig) win = true;
        if (b.type === 'small' && isSmall) win = true;
      });

      if (win) {
        setStatus(`🏆 恭喜！總和 ${total} (${isBig ? '大' : '小'})，獲得派彩！`);
        setStatusColor('#00ff88');
      } else {
        setStatus(`💀 總和 ${total} (${isBig ? '大' : '小'})，未中獎。`);
        setStatusColor('#ff4d4d');
      }
      setPendingBets(prev => prev.filter(b => b.roundId !== roundId));
      queryClient.invalidateQueries({ queryKey: ['user'] });
    } else {
      setStatus(`🏁 第 ${roundId} 局結果：${total} (${isBig ? '大' : (isSmall ? '小' : '豹子')})`);
      setStatusColor('#ffd36a');
    }

    setIsDrawing(false);
  };

  const betMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/games/sicbo/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id, amount: betAmount, action: { bets: [{ type: selectedBet }] } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '下注失敗');
      return data.data;
    },
    onSuccess: (data) => {
      const responseData = data?.data || data;
      setPendingBets(prev => [...prev, { amount: parseFloat(betAmount), type: selectedBet, roundId: responseData.roundId }]);
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
    <div className="sicbo-container">
      <div className="text-center mb-6">
        <h3 className="text-slate-400">第 {currentRoundId} 局</h3>
        <p className={isBettingOpen ? "text-yellow-500 font-mono" : "text-red-500 font-mono"}>
          {isBettingOpen ? `BETTING CLOSES: ${secLeft}s` : `DICE ROLLING: ${secLeft}s`}
        </p>
      </div>

      <div className="dice-area">
        {dice.map((d, i) => (
          <div key={i} className={`die ${isDrawing ? 'animate-bounce' : ''}`}>
            {d === 1 ? '⚀' : d === 2 ? '⚁' : d === 3 ? '⚂' : d === 4 ? '⚃' : d === 5 ? '⚄' : '⚅'}
          </div>
        ))}
      </div>

      <div className="sicbo-betting-grid">
        <div
          className={`bet-option ${selectedBet === 'small' ? 'active' : ''}`}
          onClick={() => !isDrawing && setSelectedBet('small')}
        >
          <span className="bet-label">小 (4-10)</span>
          <span className="bet-odds">x2.0</span>
        </div>
        <div
          className={`bet-option ${selectedBet === 'big' ? 'active' : ''}`}
          onClick={() => !isDrawing && setSelectedBet('big')}
        >
          <span className="bet-label">大 (11-17)</span>
          <span className="bet-odds">x2.0</span>
        </div>
        <div className="bet-option opacity-50 cursor-not-allowed">
          <span className="bet-label">全圍 (豹子)</span>
          <span className="bet-odds">x24.0</span>
        </div>
      </div>

      <div className="sicbo-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={isDrawing || !isBettingOpen}
          className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-lg text-white font-mono"
        />
        <button
          className="bg-yellow-500 text-black font-bold px-12 rounded-lg hover:bg-yellow-400 disabled:opacity-50"
          onClick={() => betMutation.mutate()}
          disabled={isDrawing || !isBettingOpen || betMutation.isPending}
        >
          {betMutation.isPending ? '處理中...' : '確認下注'}
        </button>
      </div>

      <div className="sicbo-status" style={{ color: statusColor }}>
        {status}
      </div>
    </div>
  );
};
