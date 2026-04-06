import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './HorseRacing.css';
import { extractGameError, unwrapGameEnvelope } from './gameClient';

const HORSES = [
  { id: 1, name: 'Blaze Runner', multiplier: 1.8 },
  { id: 2, name: 'Storm Dash', multiplier: 2.2 },
  { id: 3, name: 'Silver Wind', multiplier: 2.9 },
  { id: 4, name: 'Iron Hoof', multiplier: 4.0 },
  { id: 5, name: 'Royal Comet', multiplier: 5.8 },
  { id: 6, name: 'Night Rocket', multiplier: 8.5 },
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
  const [statusMsg, setStatusMsg] = useState('Choose a horse and place a bet.');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [result, setResult] = useState<HorseResult | null>(null);

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
      setStatusMsg(`Winner: ${data.winnerName} (${data.multiplier}x)`);
      setStatusColor(data.result === 'win' ? '#00ff88' : '#ff4d4d');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setStatusMsg(`Bet failed: ${err.message}`);
      setStatusColor('#ff4d4d');
    },
  });

  return (
    <div className="horse-racing-container">
      <h2>Horse Racing</h2>

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
        <div className="status-panel" style={{ color: statusColor }}>
          {statusMsg}
          {result && (
            <div className="mt-2 text-sm text-slate-300">
              You picked #{result.selectedHorse}, winner #{result.winnerId}, payout {result.payout}
            </div>
          )}
        </div>
      </div>

      <div className="betting-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={betMutation.isPending}
        />
        <button
          className="btn-bet"
          onClick={() => betMutation.mutate()}
          disabled={betMutation.isPending}
        >
          {betMutation.isPending ? 'Placing...' : 'Place Bet'}
        </button>
      </div>
    </div>
  );
};
