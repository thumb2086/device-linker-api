import React, { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./Poker.css";
import { extractGameError, unwrapGameEnvelope } from "./gameClient";

interface PokerResult {
  result: string;
  hand: string;
  multiplier: number;
  payout: number;
}

export const PokerView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [status, setStatus] = useState<"idle" | "playing" | "settled">("idle");
  const [result, setResult] = useState<PokerResult | null>(null);
  const [error, setError] = useState("");

  const handlePlay = async () => {
    if (!session) return;
    setStatus("playing");
    setError("");

    try {
      const res = await api.post("/api/v1/games/poker/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        action: "deal",
        token: "yjc",
      });
      setResult(unwrapGameEnvelope<PokerResult>(res.data));
      setStatus("settled");
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
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
            <div className={`poker-result ${result.result === "win" ? "win" : "lose"}`}>
              <div className="hand-name">{result.hand}</div>
              <div className="result-text">{result.result === "win" ? "YOU WIN!" : "BETTER LUCK NEXT TIME"}</div>
              {result.result === "win" && <div className="payout">+{result.payout}</div>}
            </div>
          )}
          {error && <div className="result-text text-red-400">{error}</div>}
        </div>
      </div>

      <div className="poker-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={status === "playing"}
        />
        <button className="deal-btn" onClick={handlePlay} disabled={status === "playing"}>
          {status === "settled" ? "RE-DEAL" : "DEAL"}
        </button>
      </div>
    </div>
  );
};
