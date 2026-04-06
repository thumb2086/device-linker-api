import React, { useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./DragonTiger.css";
import { extractGameError, unwrapGameEnvelope } from "./gameClient";

interface Card {
  rank: string;
  suit: string;
}

interface DragonResult {
  left: string;
  right: string;
  mid: string;
  lo: number;
  hi: number;
  result: "win" | "lose" | "draw";
  payout: number;
}

const SUIT = "?";

export const DragonTigerView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [result, setResult] = useState<DragonResult | null>(null);
  const [error, setError] = useState("");

  const multiplier = useMemo(() => {
    if (!result) return 0;
    const diff = Math.abs(result.hi - result.lo);
    return diff === 0 ? 0 : Number((12 / diff).toFixed(2));
  }, [result]);

  const renderCard = (card?: Card) => (
    <div className="card">
      {card ? (
        <>
          <span className="rank">{card.rank}</span>
          <span className="suit">{card.suit}</span>
        </>
      ) : (
        "?"
      )}
    </div>
  );

  const handlePlay = async () => {
    if (!session) return;

    try {
      setError("");
      const res = await api.post("/api/v1/games/shoot-dragon-gate/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        token: "zhixi",
      });

      setResult(unwrapGameEnvelope<DragonResult>(res.data));
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
    }
  };

  const leftCard = result ? { rank: result.left, suit: SUIT } : undefined;
  const rightCard = result ? { rank: result.right, suit: SUIT } : undefined;
  const midCard = result ? { rank: result.mid, suit: SUIT } : undefined;

  return (
    <div className="dragon-tiger-container">
      <div className="gate-area">
        <div className="gate-side left">
          <h3>DRAGON</h3>
          {leftCard ? renderCard(leftCard) : <div className="card-slot">?</div>}
        </div>
        <div className="gate-multiplier">
          <span>{multiplier || 0}x</span>
        </div>
        <div className="gate-side right">
          <h3>TIGER</h3>
          {rightCard ? renderCard(rightCard) : <div className="card-slot">?</div>}
        </div>
      </div>

      <div className="shot-area">
        <h3>YOUR SHOT</h3>
        {midCard ? renderCard(midCard) : <div className="card-slot highlight">?</div>}
      </div>

      <div className="controls">
        <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} />
        <button className="gate-btn" onClick={handlePlay}>OPEN GATE</button>
      </div>

      {error && <div className="result-overlay lose"><h2>{error}</h2></div>}

      {result && !error && (
        <div className={`result-overlay ${result.result === "win" ? "win" : result.result === "draw" ? "pillar" : "lose"}`}>
          <h2>{result.result === "win" ? "WIN!" : result.result === "draw" ? "DRAW" : "LOSE"}</h2>
        </div>
      )}
    </div>
  );
};
