import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Slots.css';

const SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "🔔", "💎", "7️⃣"];

export const SlotsView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState('10');
  const [isSpinning, setIsSpinning] = useState(false);
  const [grid, setGrid] = useState<string[]>(["🍒", "🍋", "🍊", "🍇", "🔔", "💎", "7️⃣", "🍒", "🍋"].slice(0, 9));
  const [status, setStatus] = useState('🎬 點擊旋轉開始冒險！');
  const [winSymbols, setWinSymbols] = useState<number[]>([]);

  const spinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/games/slots/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id, amount: betAmount, action: {} })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '旋轉失敗');
      return data.data;
    },
    onSuccess: async (data) => {
      // Data contains result.symbols and result.multiplier
      const result = data.result;

      // Keep spinning for a bit
      await new Promise(r => setTimeout(r, 1500));

      setIsSpinning(false);
      // Construct a 3x3 grid from the result.
      // Legacy code used columns, but our domain simplified it to 3 symbols.
      // Let's adapt: we'll show the 3 winning symbols in the middle row.
      const newGrid = [...grid];
      newGrid[3] = result.symbols[0];
      newGrid[4] = result.symbols[1];
      newGrid[5] = result.symbols[2];
      setGrid(newGrid);

      if (result.multiplier > 0) {
        setStatus(`🏆 恭喜！獲得 ${result.multiplier}x 獎勵！`);
        setWinSymbols([3, 4, 5]);
      } else {
        setStatus('💀 很遺憾，這局沒有中獎。');
        setWinSymbols([]);
      }
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setIsSpinning(false);
      setStatus(`❌ 錯誤: ${err.message}`);
    }
  });

  const handleSpin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setStatus('🎰 盤面旋轉中...');
    setWinSymbols([]);
    spinMutation.mutate();
  };

  // Animation for spinning effect
  useEffect(() => {
    let interval: number;
    if (isSpinning) {
      interval = window.setInterval(() => {
        setGrid(prev => prev.map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isSpinning]);

  return (
    <div className="slots-container">
      <div className="slots-board">
        <div className="slots-grid">
          {grid.map((symbol, i) => (
            <div
              key={i}
              className={`slot-cell ${isSpinning ? 'spinning' : ''} ${winSymbols.includes(i) ? 'bg-yellow-500/20 border-2 border-yellow-500' : ''}`}
            >
              {symbol}
            </div>
          ))}
        </div>
      </div>

      <div className="slot-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={isSpinning}
          className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-lg text-white"
        />
        <button
          className="btn-spin"
          onClick={handleSpin}
          disabled={isSpinning}
        >
          {isSpinning ? 'SPINNING...' : '🎰 SPIN'}
        </button>
      </div>

      <div className="slots-status">
        {status}
      </div>
    </div>
  );
};
