// apps/web/src/features/casino/DragonTigerView.tsx

import React, { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./DragonTiger.css";

interface Card {
  rank: string;
  suit: string;
}

interface GameState {
  gate?: { left: Card; right: Card };
  shot?: Card;
  multiplier: number;
  requiresSideGuess: boolean;
  resultType: "lose" | "win" | "pillar" | "idle";
  isWin: boolean;
}

export const DragonTigerView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [state, setState] = useState<GameState>({
    multiplier: 0,
    requiresSideGuess: false,
    resultType: "idle",
    isWin: false
  });

  const handleAction = async (type: "gate" | "shoot") => {
    if (!session) return;
    try {
        const res = await api.post(`/api/v1/games/dragon/play`, {
            sessionId: session.id,
            amount: type === "gate" ? betAmount : "0",
            action: { type, state }
        });
        setState(res.data.result);
    } catch (e) {
        console.error(e);
        setState({ ...state, resultType: "lose" });
    }
  };

  const renderCard = (card: Card) => (
    <div className="card">
      <span className="rank">{card.rank}</span>
      <span className="suit">{card.suit}</span>
    </div>
  );

  return (
    <div className="dragon-tiger-container">
      <div className="gate-area">
        <div className="gate-side left">
          <h3>DRAGON</h3>
          {state.gate ? renderCard(state.gate.left) : <div className="card-slot">?</div>}
        </div>
        <div className="gate-multiplier">
          <span>{state.multiplier}x</span>
        </div>
        <div className="gate-side right">
          <h3>TIGER</h3>
          {state.gate ? renderCard(state.gate.right) : <div className="card-slot">?</div>}
        </div>
      </div>

      <div className="shot-area">
        <h3>YOUR SHOT</h3>
        {state.shot ? renderCard(state.shot) : <div className="card-slot highlight">?</div>}
      </div>

      <div className="controls">
        {!state.gate || state.resultType !== "idle" ? (
          <>
            <input 
              type="number" 
              value={betAmount} 
              onChange={(e) => setBetAmount(e.target.value)} 
            />
            <button className="gate-btn" onClick={() => handleAction("gate")}>OPEN GATE</button>
          </>
        ) : (
          <button className="shoot-btn" onClick={() => handleAction("shoot")}>SHOOT</button>
        )}
      </div>

      {state.resultType !== "idle" && state.gate && (
        <div className={`result-overlay ${state.isWin ? 'win' : (state.resultType === 'pillar' ? 'pillar' : 'lose')}`}>
          <h2>{state.isWin ? 'WIN!' : (state.resultType === 'pillar' ? 'PILLAR!' : 'LOSE')}</h2>
        </div>
      )}
    </div>
  );
};
