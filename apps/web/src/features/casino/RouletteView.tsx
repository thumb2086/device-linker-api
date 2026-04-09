import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import './Roulette.css';
import './CasinoCommon.css';
import { extractGameError, unwrapGameEnvelope } from './gameClient';
import { BetQuickActions } from './BetQuickActions';

const EUROPEAN_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const BET_OPTIONS = {
  color: [
    { value: 'red', label: '紅' },
    { value: 'black', label: '黑' },
  ],
  parity: [
    { value: 'odd', label: '單' },
    { value: 'even', label: '雙' },
  ],
  range: [
    { value: 'low', label: '小 (1-18)' },
    { value: 'high', label: '大 (19-36)' },
  ],
  dozen: [
    { value: '1', label: '1-12' },
    { value: '2', label: '13-24' },
    { value: '3', label: '25-36' },
  ],
} as const;

function getColor(num: number) {
  if (num === 0) return 'green';
  const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return reds.includes(num) ? 'red' : 'black';
}

export function RouletteView() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [betAmount, setBetAmount] = useState('10');
  const [betType, setBetType] = useState<'color' | 'parity' | 'range' | 'dozen' | 'number'>('color');
  const [betValue, setBetValue] = useState('red');
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<{ number: number; color: string } | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const betMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No session');

      const res = await fetch('/api/v1/games/roulette/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          betAmount: Number(betAmount),
          bets: [
            {
              type: betType,
              value: betType === 'number' ? Number(betValue) : betValue,
            },
          ],
        }),
      });

      const payload = await res.json();
      if (!res.ok || payload?.success === false) {
        throw new Error(extractGameError(payload));
      }

      return unwrapGameEnvelope<any>(payload);
    },
    onSuccess: (data) => {
      if (typeof data?.winningNumber === 'number') {
        animateWheel(data.winningNumber);
      }
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const animateWheel = (winningNumber: number) => {
    setIsSpinning(true);
    const index = EUROPEAN_LAYOUT.indexOf(winningNumber);
    const anglePerSlot = 360 / EUROPEAN_LAYOUT.length;
    const targetAngle = 360 - (index * anglePerSlot);
    const newRotation = rotation + 2520 + ((targetAngle - (rotation % 360) + 360) % 360);

    setRotation(newRotation);

    setTimeout(() => {
      setIsSpinning(false);
      setResult({ number: winningNumber, color: getColor(winningNumber) });
    }, 5200);
  };

  const renderWheelLabels = () => {
    const anglePerSlot = 360 / EUROPEAN_LAYOUT.length;
    return EUROPEAN_LAYOUT.map((num, idx) => {
      const angle = idx * anglePerSlot;
      const color = getColor(num);
      return (
        <span
          key={idx}
          className={`wheel-label wheel-label-${color}`}
          style={{
            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-114px) rotate(${-angle}deg)`,
          }}
        >
          {num}
        </span>
      );
    });
  };

  return (
    <div className="roulette-container space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">輪盤</h2>
        <Link
          to="/app/casino/lobby"
          className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-200 transition-colors hover:bg-slate-700"
        >
          <ChevronLeft size={14} />
          返回大廳
        </Link>
      </div>

      <div className="roulette-stage">
        <div className="wheel-container">
          <div className="wheel-pointer"></div>
          <div
            ref={wheelRef}
            className={`wheel-outer ${isSpinning ? 'is-spinning' : ''}`}
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            {renderWheelLabels()}
          </div>
          <div className={`wheel-inner win-${result?.color || ''}`}>
            {result ? result.number : '?'}
          </div>
        </div>

        <div className="bet-controls bg-white p-6 rounded-lg shadow border space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-bold">下注類型</label>
              <select
                className="w-full border p-2 rounded"
                value={betType}
                onChange={(e) => {
                  const nextType = e.target.value as typeof betType;
                  setBetType(nextType);
                  if (nextType === 'number') setBetValue('0');
                  else setBetValue(BET_OPTIONS[nextType][0].value);
                }}
              >
                <option value="color">顏色</option>
                <option value="parity">單雙</option>
                <option value="range">大小區間</option>
                <option value="dozen">12區段</option>
                <option value="number">指定號碼</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold">選項</label>
              <select
                className="w-full border p-2 rounded"
                value={betValue}
                onChange={(e) => setBetValue(e.target.value)}
              >
                {betType === 'number'
                  ? Array.from({ length: 37 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))
                  : BET_OPTIONS[betType].map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="number"
              className="min-w-0 flex-1 border p-2 rounded"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
            />
            <BetQuickActions amount={betAmount} onChange={setBetAmount} disabled={betMutation.isPending || isSpinning} />
            <button
              className="bg-gold rounded px-8 py-2 font-bold text-black hover:opacity-90 disabled:opacity-50"
              onClick={() => betMutation.mutate()}
              disabled={betMutation.isPending || isSpinning}
            >
              旋轉開獎
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
