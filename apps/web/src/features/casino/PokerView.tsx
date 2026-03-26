// apps/web/src/features/casino/PokerView.tsx

import React, { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./Poker.css";

interface PokerResult {
  isWin: boolean;
  multiplier: number;
  hand: string;
}

export const PokerView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [status, setStatus] = useState<"idle" | "playing" | "settled">("idle");
  const [result, setResult] = useState<PokerResult | null>(null);

  const handlePlay = async () => {
    if (!session) return;
    setStatus("playing");
    try {
        const res = await api.post(`/api/v1/games/poker/play`, {
            sessionId: session.id,
            amount: betAmount,
            action: { type: 'deal' }
        });
        setResult(res.data.result);
        setStatus("settled");
    } catch (e) {
        console.error(e);
        setStatus("idle");
    }
  };

  return (
    <div className="poker-container">
      <div className="poker-table">
        <div className="table-inner">
           {status === "idle" && <div className="poker-msg">READY TO DEAL?</div>}
           {status === "playing" && <div className="poker-msg animating">SHUFFLING...</div>}
           {status === "settled" && result && (
             <div className={`poker-result ${result.isWin ? 'win' : 'lose'}`}>
                <div className="hand-name">{result.hand}</div>
                <div className="result-text">{result.isWin ? 'YOU WIN!' : 'BETTER LUCK NEXT TIME'}</div>
                {result.isWin && <div className="payout">+{parseFloat(betAmount) * result.multiplier}</div>}
             </div>
           )}
        </div>
      </div>

      <div className="poker-controls">
        <input 
          type="number" 
          value={betAmount} 
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={status === "playing"}
        />
        <button 
          className="deal-btn" 
          onClick={handlePlay}
          disabled={status === "playing"}
        >
          {status === "settled" ? "RE-DEAL" : "DEAL"}
        </button>
      </div>
    </div>
  );
};
