import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Bingo.css';

const BINGO_ROUND_MS = 30000;
const BINGO_LOCK_MS = 5000;

export const BingoView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState('10');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState('🎱 請選擇 8 個號碼（1-75）然後開始下注！');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [pendingBets, setPendingBets] = useState<any[]>([]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const currentRoundId = Math.floor(now / BINGO_ROUND_MS);
  const closesAt = (currentRoundId + 1) * BINGO_ROUND_MS;
  const isBettingOpen = now < (closesAt - BINGO_LOCK_MS);
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
    setStatus('🎱 正在滾動開獎中...');
    setStatusColor('#ffd36a');
    setDrawnNumbers([]);

    // Deterministic draw logic
    const pool = Array.from({ length: 75 }, (_, i) => i + 1);
    const seed = `bingo:${roundId}`;
    const hash = (input: string) => Array.from(input).reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

    // Simulate ball draw
    const currentDrawn: number[] = [];
    for (let i = 0; i < 20; i++) {
        const k = hash(`${seed}:${i}`) % (pool.length - i);
        const ball = pool.splice(k, 1)[0];
        currentDrawn.push(ball);
        setDrawnNumbers(prev => [...prev, ball].sort((a,b) => a-b));
        await new Promise(r => setTimeout(r, 100));
    }

    const roundBets = pendingBets.filter(b => b.roundId === roundId);
    if (roundBets.length > 0) {
      let win = false;
      let totalWinnings = 0;
      roundBets.forEach(b => {
        const hits = b.numbers.filter((n: number) => currentDrawn.includes(n)).length;
        if (hits >= 4) {
            win = true;
            const mult = hits === 8 ? 50 : hits === 7 ? 10 : hits === 6 ? 3 : hits === 5 ? 1.5 : 1;
            totalWinnings += b.amount * mult;
        }
      });

      if (win) {
        setStatus(`🏆 恭喜！開獎命中，獲得派彩！`);
        setStatusColor('#00ff88');
      } else {
        setStatus(`💀 很遺憾，本局未中獎。`);
        setStatusColor('#ff4d4d');
      }
      setPendingBets(prev => prev.filter(b => b.roundId !== roundId));
      queryClient.invalidateQueries({ queryKey: ['user'] });
    } else {
      setStatus(`🏁 第 ${roundId} 局開獎完成。`);
      setStatusColor('#ffd36a');
    }

    setIsDrawing(false);
  };

  const toggleNumber = (n: number) => {
    if (isDrawing) return;
    setSelectedNumbers(prev => {
      if (prev.includes(n)) return prev.filter(x => x !== n);
      if (prev.length >= 8) return prev;
      return [...prev, n].sort((a,b) => a-b);
    });
  };

  const randomPick = () => {
    if (isDrawing) return;
    const pool = Array.from({ length: 75 }, (_, i) => i + 1);
    const shuffled = pool.sort(() => 0.5 - Math.random());
    setSelectedNumbers(shuffled.slice(0, 8).sort((a,b) => a-b));
  };

  const betMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/games/bingo/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id, amount: betAmount, action: { numbers: selectedNumbers } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '下注失敗');
      return data.data;
    },
    onSuccess: (data) => {
      setPendingBets(prev => [...prev, { amount: parseFloat(betAmount), numbers: selectedNumbers, roundId: data.roundId }]);
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
    <div className="bingo-container">
      <div className="text-center mb-6">
        <h3 className="text-slate-400">第 {currentRoundId} 局</h3>
        <p className={isBettingOpen ? "text-yellow-500 font-mono" : "text-red-500 font-mono"}>
          {isBettingOpen ? `BETTING CLOSES: ${secLeft}s` : `DICE ROLLING: ${secLeft}s`}
        </p>
      </div>

      <div className="drawn-balls">
        {drawnNumbers.map(n => (
          <div key={n} className="bingo-ball">{n}</div>
        ))}
      </div>

      <div className="bingo-grid">
        {Array.from({ length: 75 }, (_, i) => i + 1).map(n => (
          <div
            key={n}
            className={`bingo-cell ${selectedNumbers.includes(n) ? 'selected' : ''} ${drawnNumbers.includes(n) ? 'drawn' : ''} ${selectedNumbers.includes(n) && drawnNumbers.includes(n) ? 'hit' : ''}`}
            onClick={() => toggleNumber(n)}
          >
            {n}
          </div>
        ))}
      </div>

      <div className="bingo-controls">
        <button className="bg-slate-700 px-4 py-2 rounded" onClick={randomPick} disabled={isDrawing}>隨機選號</button>
        <button className="bg-slate-700 px-4 py-2 rounded" onClick={() => setSelectedNumbers([])} disabled={isDrawing}>重設</button>
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={isDrawing || !isBettingOpen}
          className="flex-1 bg-slate-800 border border-slate-700 p-2 rounded text-white font-mono"
        />
        <button
          className="bg-yellow-500 text-black font-bold px-8 rounded hover:bg-yellow-400 disabled:opacity-50"
          onClick={() => betMutation.mutate()}
          disabled={isDrawing || !isBettingOpen || selectedNumbers.length !== 8 || betMutation.isPending}
        >
          {betMutation.isPending ? '處理中...' : '確認下注'}
        </button>
      </div>

      <div className="bingo-status" style={{ color: statusColor }}>
        {status}
      </div>
    </div>
  );
};
