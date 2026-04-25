import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './HorseRacing.css';
import './CasinoCommon.css';
import { extractGameError, unwrapGameEnvelope } from './gameClient';
import { BetQuickActions } from './BetQuickActions';

const HORSES = [
  { id: 1, name: '烈焰奔馳', multiplier: 1.8 },
  { id: 2, name: '暴風衝刺', multiplier: 2.2 },
  { id: 3, name: '銀翼疾風', multiplier: 2.9 },
  { id: 4, name: '鐵蹄', multiplier: 4.0 },
  { id: 5, name: '皇家彗星', multiplier: 5.8 },
  { id: 6, name: '夜空火箭', multiplier: 8.5 },
];

type HorseResult = {
  selectedHorse: number;
  winnerId: number;
  winnerName: string;
  result: 'win' | 'lose';
  payout: number;
  multiplier: number;
};

export const HorseRacingView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [selectedHorseId, setSelectedHorseId] = useState(1);
  const [betAmount, setBetAmount] = useState('10');
  const [statusMsg, setStatusMsg] = useState('請選擇馬匹並下注。');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [result, setResult] = useState<HorseResult | null>(null);
  const [isRacing, setIsRacing] = useState(false);
  const [progress, setProgress] = useState<Record<number, number>>(() =>
    HORSES.reduce((acc, horse) => ({ ...acc, [horse.id]: 0 }), {})
  );

  const betMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No session');

      const res = await fetch('/api/v1/games/horse/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          betAmount: Number(betAmount),
          horseId: selectedHorseId,
        }),
      });

      const payload = await res.json();
      if (!res.ok || payload?.success === false) {
        throw new Error(extractGameError(payload));
      }

      return unwrapGameEnvelope<HorseResult>(payload);
    },
    onSuccess: (data) => {
      setResult(data);
      setIsRacing(true);
      setStatusMsg('🏇 比賽開始！');
      setStatusColor('#ffd36a');
      setProgress(HORSES.reduce((acc, horse) => ({ ...acc, [horse.id]: 0 }), {}));

      const winnerSpeed = 1.6;
      const raceTimer = window.setInterval(() => {
        setProgress((prev) => {
          let allFinished = true;
          const next: Record<number, number> = {};
          for (const horse of HORSES) {
            const speed = horse.id === data.winnerId ? winnerSpeed : 0.75 + Math.random() * 0.45;
            const value = Math.min(100, (prev[horse.id] ?? 0) + speed);
            next[horse.id] = value;
            if (value < 100) allFinished = false;
          }
          if (allFinished) {
            window.clearInterval(raceTimer);
            setIsRacing(false);
            setStatusMsg(`冠軍：${data.winnerName}（${data.multiplier}x）`);
            setStatusColor(data.result === 'win' ? '#00ff88' : '#ff4d4d');
          }
          return next;
        });
      }, 90);

      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setStatusMsg(`下注失敗：${err.message}`);
      setStatusColor('#ff4d4d');
    },
  });

  return (
    <div className="horse-racing-container">
      <h2>賽馬</h2>

      <div className="horse-choices">
        {HORSES.map((horse) => (
          <button
            key={horse.id}
            type="button"
            className={`horse-choice ${selectedHorseId === horse.id ? 'active' : ''}`}
            onClick={() => setSelectedHorseId(horse.id)}
          >
            <span>{horse.name}</span>
            <span className="multiplier">{horse.multiplier}x</span>
          </button>
        ))}
      </div>

      <div className="race-track">
        <div className="race-hud">
          <div className="pace-meter">
            <div className="pace-fill" style={{ width: `${Math.max(...Object.values(progress))}%` }} />
          </div>
        </div>
        {HORSES.map((horse) => (
          <div key={horse.id} className="lane">
            <span className="lane-tag">#{horse.id}</span>
            <span
              className={`horse-avatar ${isRacing ? 'running' : ''} ${result?.winnerId === horse.id && !isRacing ? 'winner' : ''}`}
              style={{ left: `${16 + (progress[horse.id] ?? 0) * 2.4}px` }}
            >
              🐎
            </span>
          </div>
        ))}
        <div className="status-panel" style={{ color: statusColor }}>
          {statusMsg}
          {result && (
            <div className="mt-2 text-sm text-slate-300">
              你選了 #{result.selectedHorse}，冠軍 #{result.winnerId}，派彩 {result.payout}
            </div>
          )}
        </div>
      </div>

      <div className="betting-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={betMutation.isPending || isRacing}
        />
        <BetQuickActions amount={betAmount} onChange={setBetAmount} disabled={betMutation.isPending || isRacing} />
        <button
          className="btn-bet"
          onClick={() => betMutation.mutate()}
          disabled={betMutation.isPending || isRacing}
        >
          {betMutation.isPending ? '下注中…' : isRacing ? '賽事進行中…' : '立即下注'}
        </button>
      </div>
    </div>
  );
};
