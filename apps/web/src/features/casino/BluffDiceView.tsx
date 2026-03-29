// apps/web/src/features/casino/BluffDiceView.tsx

import React, { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./BluffDice.css";

interface GameResult {
  dice: number[];
  total: number;
}

export const BluffDiceView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [status, setStatus] = useState<"idle" | "rolling" | "settled">("idle");
  const [result, setResult] = useState<GameResult | null>(null);

  const handleRoll = async () => {
    if (!session) return;
    setStatus("rolling");
    try {
        const res = await api.post(`/api/v1/games/bluffdice/play`, {
            sessionId: session.id,
            amount: betAmount,
            action: { type: 'roll' }
        });
        setResult(res.data.result);
        setStatus("settled");
    } catch (e) {
        console.error(e);
        setStatus("idle");
    }
  };

  const getDiceIcon = (val: number) => {
    const icons = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    return icons[val - 1] || "?";
  };

  return (
    <div className="bluffdice-container">
      <div className="dice-cup">
        <div className={`cup-inner ${status === 'rolling' ? 'shaking' : ''}`}>
           {status === "idle" && <div className="dice-placeholder">🎲</div>}
           {status === "settled" && result && (
             <div className="dice-row">
               {result.dice.map((d, i) => (
                 <span key={i} className="dice-val" style={{ animationDelay: `${i * 0.1}s` }}>
                   {getDiceIcon(d)}
                 </span>
               ))}
             </div>
           )}
        </div>
      </div>

      <div className="bluff-stats">
        {result && status === "settled" && (
           <div className="total-stat">
             <span className="label">TOTAL:</span>
             <span className="value">{result.total}</span>
           </div>
        )}
      </div>

      <div className="bluff-controls">
        <input 
          type="number" 
          value={betAmount} 
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={status === "rolling"}
        />
        <button 
          className="roll-btn" 
          onClick={handleRoll}
          disabled={status === "rolling"}
        >
          {status === "rolling" ? "ROLLING..." : "SHAKE & ROLL"}
        </button>
      </div>
    </div>
  );
};
