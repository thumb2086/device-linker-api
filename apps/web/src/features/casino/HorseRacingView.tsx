import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import './HorseRacing.css';

// Constants from legacy logic
const HORSE_ROUND_MS = 20000;
const HORSE_LOCK_MS = 3000;
const TRACKS = ['乾地', '濕地', '夜賽'];

const HORSE_CONFIG: Record<number, any> = {
  1: { id: 1, name: '赤焰', multiplier: 1.8, weight: 25, speed: 92, stamina: 88, burst: 86 },
  2: { id: 2, name: '雷霆', multiplier: 2.2, weight: 23, speed: 89, stamina: 90, burst: 84 },
  3: { id: 3, name: '幻影', multiplier: 2.9, weight: 19, speed: 86, stamina: 84, burst: 91 },
  4: { id: 4, name: '夜刃', multiplier: 4.0, weight: 15, speed: 82, stamina: 80, burst: 94 },
  5: { id: 5, name: '霜牙', multiplier: 5.8, weight: 11, speed: 80, stamina: 93, burst: 78 },
  6: { id: 6, name: '流星', multiplier: 8.5, weight: 7, speed: 95, stamina: 72, burst: 97 }
};

const HORSE_STATS_FIXED = [
  { id: 1, name: '赤焰', races: 1800, wins: 450, winRate: 25.0, last5: [1, 2, 1, 3, 2] },
  { id: 2, name: '雷霆', races: 1800, wins: 414, winRate: 23.0, last5: [2, 1, 3, 2, 2] },
  { id: 3, name: '幻影', races: 1800, wins: 342, winRate: 19.0, last5: [3, 4, 1, 2, 3] },
  { id: 4, name: '夜刃', races: 1800, wins: 270, winRate: 15.0, last5: [4, 3, 2, 4, 1] },
  { id: 5, name: '霜牙', races: 1800, wins: 198, winRate: 11.0, last5: [5, 2, 6, 3, 4] },
  { id: 6, name: '流星', races: 1800, wins: 126, winRate: 7.0, last5: [6, 5, 4, 2, 1] }
];

// Deterministic Hashing Logic
function hash32(input: string | number) {
  let str = String(input);
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashFloat(input: string | number) {
  return (hash32(input) % 1000000) / 1000000;
}

function simulateRaceDeterministic(roundId: number) {
  const trackIdx = Math.floor(hashFloat('horse:track:' + roundId) * TRACKS.length) % TRACKS.length;
  const trackCondition = TRACKS[trackIdx];

  const metrics = Object.values(HORSE_CONFIG).map((horse) => {
    const baseScore = horse.weight * 2 + horse.speed * 0.6 + horse.stamina * 0.5 + horse.burst * 0.7;
    const volatility = (hashFloat('horse:vol:' + roundId + ':' + horse.id) * 40) - 20;

    const trackBias = trackCondition === '濕地'
      ? horse.stamina * 0.06
      : trackCondition === '夜賽'
        ? horse.burst * 0.07
        : horse.speed * 0.05;

    const raceScore = baseScore + trackBias + volatility;

    return {
      id: horse.id,
      name: horse.name,
      finishTime: parseFloat((66 - raceScore / 18).toFixed(2)),
      topSpeed: parseFloat((54 + raceScore / 12).toFixed(1)),
      reactionMs: Math.round(180 + ((hashFloat('horse:react:' + roundId + ':' + horse.id) * 100) - 40) - horse.burst * 0.35)
    };
  });

  metrics.sort((a, b) => a.finishTime - b.finishTime);
  const rankedMetrics = metrics.map((m, idx) => ({ ...m, rank: idx + 1 }));

  return {
    roundId,
    trackCondition,
    metrics: rankedMetrics,
    winnerId: rankedMetrics[0].id,
    winnerName: rankedMetrics[0].name
  };
}

export const HorseRacingView: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [selectedHorseId, setSelectedHorseId] = useState(1);
  const [betAmount, setBetAmount] = useState('10');
  const [raceInProgress, setRaceInProgress] = useState(false);
  const [statusMsg, setStatusMsg] = useState('🎬 比賽即將開始，請把握時間下注');
  const [statusColor, setStatusColor] = useState('#ffd36a');
  const [pace, setPace] = useState(0);
  const [lights, setLights] = useState<number>(0); // 0, 1, 2, 3, 99 (GO)
  const [positions, setPositions] = useState<Record<number, number>>({ 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60 });
  const [lastObservedRoundId, setLastObservedRoundId] = useState<number | null>(null);
  const [pendingBets, setPendingBets] = useState<any[]>([]);
  const [raceResult, setRaceResult] = useState<any>(null);

  const timerRef = useRef<number | null>(null);

  // Round State Management
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  const currentRoundId = Math.floor(now / HORSE_ROUND_MS);
  const closesAt = (currentRoundId + 1) * HORSE_ROUND_MS;
  const bettingClosesAt = closesAt - HORSE_LOCK_MS;
  const isBettingOpen = now < bettingClosesAt;
  const secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

  // Trigger Race Animation on Round Switch
  useEffect(() => {
    if (lastObservedRoundId !== null && lastObservedRoundId !== currentRoundId) {
      startRaceAnimation(lastObservedRoundId);
    }
    setLastObservedRoundId(currentRoundId);
  }, [currentRoundId]);

  const startRaceAnimation = async (roundId: number) => {
    if (raceInProgress) return;
    setRaceInProgress(true);
    setRaceResult(null);
    setPace(0);
    setPositions({ 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60 });

    const sim = simulateRaceDeterministic(roundId);
    setStatusMsg(`🏁 第 ${roundId} 局比賽開始！`);
    setStatusColor('#ffd36a');

    // Countdown
    setLights(1); await new Promise(r => setTimeout(r, 520));
    setLights(2); await new Promise(r => setTimeout(r, 520));
    setLights(3); await new Promise(r => setTimeout(r, 520));
    setLights(99);
    setStatusMsg('出閘！衝啊！');

    // Animation Loop
    const totalTicks = 34;
    const targets: Record<number, number> = {};
    sim.metrics.forEach(m => {
      let base = m.rank === 1 ? 920 : m.rank === 2 ? 870 : m.rank === 3 ? 820 : 770;
      targets[m.id] = base;
    });

    let currentPositions = { 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60 };
    for (let tick = 1; tick <= totalTicks; tick++) {
      const p = tick / totalTicks;
      setPace(p * 100);

      sim.metrics.forEach(m => {
        const id = m.id;
        const rankPower = (5 - m.rank) * 0.75;
        const baseStep = 13.5 + rankPower;
        let surge = 0;
        if (p > 0.42 && p < 0.72 && hashFloat(`horse:mid:${roundId}:${id}:${tick}`) > 0.75) surge += 5.5;

        currentPositions[id as keyof typeof currentPositions] += baseStep + surge;
        const maxAllowed = 60 + (targets[id] - 60) * p + 9;
        if (currentPositions[id as keyof typeof currentPositions] > maxAllowed) {
            currentPositions[id as keyof typeof currentPositions] = maxAllowed;
        }
      });

      setPositions({ ...currentPositions });
      await new Promise(r => setTimeout(r, 170));
    }

    // Wrap up
    setPace(100);
    setRaceResult(sim);
    setLights(0);
    setStatusMsg(`🏆 第 ${roundId} 局結果：${sim.winnerName} 奪冠`);

    // Check pending bets
    const roundBets = pendingBets.filter(b => b.roundId === roundId);
    if (roundBets.length > 0) {
      let winAmount = 0;
      roundBets.forEach(b => {
        if (b.horseId === sim.winnerId) {
          winAmount += b.amount * HORSE_CONFIG[b.horseId].multiplier;
        }
      });

      if (winAmount > 0) {
        setStatusMsg(`🤑 恭喜！第 ${roundId} 局贏得 ${winAmount.toFixed(2)} 子熙幣！`);
        setStatusColor('#00ff88');
      } else {
        setStatusMsg(`💀 第 ${roundId} 局結算：未中獎`);
        setStatusColor('#ff4d4d');
      }
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setPendingBets(prev => prev.filter(b => b.roundId !== roundId));
    }

    setRaceInProgress(false);
  };

  const betMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/games/horse/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session?.id, amount: betAmount, action: { horseId: selectedHorseId } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '下注失敗');
      return data.data;
    },
    onSuccess: (data) => {
      const responseData = data?.data || data;
      setPendingBets(prev => [...prev, { amount: parseFloat(betAmount), horseId: selectedHorseId, roundId: responseData.roundId }]);
      setStatusMsg(`✅ 下注成功！等待第 ${responseData.roundId} 局開獎`);
      setStatusColor('#00ff88');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: Error) => {
      setStatusMsg(`❌ 錯誤: ${err.message}`);
      setStatusColor('#ff4d4d');
    }
  });

  const handleBet = () => {
    if (raceInProgress || !isBettingOpen || betMutation.isPending) return;
    betMutation.mutate();
  };

  return (
    <div className="horse-racing-container">
      <h2>🏇 極速賽馬</h2>
      <p style={{ color: '#888', fontSize: '0.9rem' }}>
        {isBettingOpen
          ? `第 ${currentRoundId} 局截止下注：${secLeft} 秒`
          : `第 ${currentRoundId} 局封盤中，即將開賽...`}
      </p>

      <div className="race-track">
        {[1, 2, 3, 4, 5, 6].map(id => (
          <div key={id} className="lane">
            <span className="lane-tag">{id}</span>
            <div
              className={`horse-avatar ${raceInProgress ? 'running' : ''} ${raceResult?.winnerId === id ? 'winner' : ''}`}
              style={{ left: `${positions[id] / 10}%` }}
            >
              🏇
            </div>
          </div>
        ))}
      </div>

      <div className="race-hud">
        <div className="start-lights">
          <div className={`light ${lights >= 1 ? 'red' : ''}`} />
          <div className={`light ${lights >= 2 ? 'red' : ''}`} />
          <div className={`light ${lights >= 3 ? 'red' : ''}`} />
          <div className={`light ${lights === 99 ? 'green' : ''}`} />
        </div>
        <div className="pace-meter">
          <div className="pace-fill" style={{ width: `${pace}%` }} />
        </div>
      </div>

      <div className="status-panel" style={{ color: statusColor }}>
        {statusMsg}
        {pendingBets.length > 0 && (
          <div style={{ fontSize: '0.8rem', marginTop: 5, color: '#aaa' }}>
            待結算：{pendingBets.map(b => `#${b.roundId}`).join(', ')}
          </div>
        )}
      </div>

      <div className="horse-choices">
        {Object.values(HORSE_CONFIG).map((h) => (
          <div
            key={h.id}
            className={`horse-choice ${selectedHorseId === h.id ? 'active' : ''}`}
            onClick={() => !raceInProgress && setSelectedHorseId(h.id)}
          >
            <div>
              <strong>{h.id}號 {h.name}</strong>
              <div style={{ fontSize: '0.7rem', color: '#888' }}>
                SPD: {h.speed} / STM: {h.stamina} / BST: {h.burst}
              </div>
            </div>
            <span className="multiplier">x{h.multiplier}</span>
          </div>
        ))}
      </div>

      <div className="betting-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={raceInProgress || !isBettingOpen}
        />
        <button
          className="btn-bet"
          onClick={handleBet}
          disabled={raceInProgress || !isBettingOpen || betMutation.isPending}
        >
          {betMutation.isPending ? '處理中...' : '確認下注'}
        </button>
      </div>

      <div className="data-panel">
        <h3>📊 賽馬資訊 (場地: {raceResult?.trackCondition || '未知'})</h3>
        <table className="stats-table">
          <thead>
            <tr>
              <th>馬匹</th>
              <th>戰績</th>
              <th>勝率</th>
              <th>近五場</th>
            </tr>
          </thead>
          <tbody>
            {HORSE_STATS_FIXED.map(s => (
              <tr key={s.id}>
                <td>{s.id}號 {s.name}</td>
                <td>{s.wins}勝 / {s.races}場</td>
                <td>{s.winRate}%</td>
                <td>{s.last5.map(r => `#${r}`).join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
