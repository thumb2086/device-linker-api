import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Bingo.css';
import { extractGameError, unwrapGameEnvelope } from './gameClient';

export const BingoView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState('10');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [status, setStatus] = useState('? 隢??8 ??蝣潘?1-75嚗敺?憪?瘜剁?');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [result, setResult] = useState<any>(null);

  const toggleNumber = (n: number) => {
    setSelectedNumbers((prev) => {
      if (prev.includes(n)) return prev.filter((value) => value !== n);
      if (prev.length >= 8) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const randomPick = () => {
    const pool = Array.from({ length: 75 }, (_, i) => i + 1);
    const shuffled = pool.sort(() => 0.5 - Math.random());
    setSelectedNumbers(shuffled.slice(0, 8).sort((a, b) => a - b));
  };

  const betMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No session');

      const res = await fetch('/api/v1/games/bingo/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          betAmount: Number(betAmount),
          numbers: selectedNumbers,
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
      setStatus(`?? ?剖?嚗?敺?${data.payout}`);
      setStatusColor(data.result === 'win' ? '#00ff88' : '#ff4d4d');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setStatus(`???航炊: ${err.message}`);
      setStatusColor('#ff4d4d');
    },
  });

  return (
    <div className="bingo-container">
      <div className="drawn-balls">
        {selectedNumbers.map((n) => (
          <div key={n} className="bingo-ball">{n}</div>
        ))}
      </div>

      <div className="bingo-grid">
        {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`bingo-cell ${selectedNumbers.includes(n) ? 'selected' : ''}`}
            onClick={() => toggleNumber(n)}
          >
            {n}
          </div>
        ))}
      </div>

      <div className="bingo-controls">
        <button className="bg-slate-700 px-4 py-2 rounded" onClick={randomPick}>?冽??貉?</button>
        <button className="bg-slate-700 px-4 py-2 rounded" onClick={() => setSelectedNumbers([])}>?身</button>
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 p-2 rounded text-white font-mono"
        />
        <button
          className="bg-yellow-500 text-black font-bold px-8 rounded hover:bg-yellow-400 disabled:opacity-50"
          onClick={() => betMutation.mutate()}
          disabled={selectedNumbers.length === 0 || betMutation.isPending}
        >
          {betMutation.isPending ? '??銝?..' : '蝣箄?銝釣'}
        </button>
      </div>

      <div className="bingo-status" style={{ color: statusColor }}>
        {status}
        {result && (
          <div className="mt-2 text-sm text-slate-300">
            matches: {(result.matches || []).join(', ') || 'none'}
          </div>
        )}
      </div>
    </div>
  );
};
