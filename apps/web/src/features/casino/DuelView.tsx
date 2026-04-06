import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './Duel.css';
import { extractGameError, unwrapGameEnvelope } from './gameClient';

export const DuelView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [stakeTier, setStakeTier] = useState(1000);
  const [selection, setSelection] = useState<'heads' | 'tails'>('heads');
  const [result, setResult] = useState<any>(null);
  const opponentSelection = useMemo(() => (selection === 'heads' ? 'tails' : 'heads'), [selection]);

  const duelMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No session');

      const res = await fetch('/api/v1/games/duel/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          betAmount: stakeTier,
          p1Selection: selection,
          p2Selection: opponentSelection,
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
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  return (
    <div className="duel-container">
      <div className="duel-stage">
        <div className="player-card active">
          <div className="text-sm text-slate-500 mb-2">YOU</div>
          <div className="text-xl font-bold">{selection.toUpperCase()}</div>
          <div className="player-score">{result?.winner === 1 ? 1 : 0}</div>
        </div>
        <div className="vs-badge">VS</div>
        <div className="player-card active">
          <div className="text-sm text-slate-500 mb-2">OPPONENT</div>
          <div className="text-xl font-bold">{opponentSelection.toUpperCase()}</div>
          <div className="player-score">{result?.winner === 2 ? 1 : 0}</div>
        </div>
      </div>

      <div className="stake-selector">
        {[1000, 5000, 10000].map((tier) => (
          <div
            key={tier}
            className={`stake-tier ${stakeTier === tier ? 'active' : ''}`}
            onClick={() => setStakeTier(tier)}
          >
            {tier} ZXC
          </div>
        ))}
      </div>

      <div className="choice-buttons grid grid-cols-2 gap-4 mb-6">
        <button className={`btn-choice ${selection === 'heads' ? 'active' : ''}`} onClick={() => setSelection('heads')}>HEADS</button>
        <button className={`btn-choice ${selection === 'tails' ? 'active' : ''}`} onClick={() => setSelection('tails')}>TAILS</button>
      </div>

      <button
        className="w-full bg-yellow-500 text-black font-bold py-4 rounded-xl text-lg hover:bg-yellow-400 disabled:opacity-50"
        onClick={() => duelMutation.mutate()}
        disabled={duelMutation.isPending}
      >
        {duelMutation.isPending ? '?銝?..' : '?? ?撠??'}
      </button>

      {duelMutation.error && (
        <div className="duel-logs mt-6">
          <div className="log-entry">{(duelMutation.error as Error).message}</div>
        </div>
      )}
    </div>
  );
};
