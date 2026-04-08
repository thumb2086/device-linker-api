import React, { useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./BluffDice.css";
import { extractGameError, unwrapGameEnvelope } from "./gameClient";

interface GameResult {
  dice: number[];
  total: number;
  result: string;
  payout: number;
}

const MAX_BET = 1_000_000;

export const BluffDiceView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [status, setStatus] = useState<"idle" | "rolling" | "settled">("idle");
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState("");

  const chips = useMemo(() => Array.from({ length: 12 }, (_, index) => index), []);

  const handleRoll = async () => {
    if (!session) return;
    setStatus("rolling");
    setError("");

    try {
      const res = await api.post("/api/v1/games/bluffdice/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        action: "roll",
        token: "yjc",
      });
      setResult(unwrapGameEnvelope<GameResult>(res.data));
      setStatus("settled");
    } catch (e: unknown) {
      setError(extractGameError(e));
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
        <div className={`cup-inner ${status === "rolling" ? "shaking" : ""}`}>
          {status === "rolling" && (
            <div className="chip-rain" aria-hidden="true">
              {chips.map((chip) => (
                <span key={chip} className="chip" style={{ animationDelay: `${chip * 0.08}s` }} />
              ))}
            </div>
          )}
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
            <span className="label">總點數：</span>
            <span className="value">{result.total}</span>
            <span className={`result-badge ${result.result === "win" ? "win" : "lose"}`}>
              {result.result === "win" ? "命中" : "未中"}
            </span>
          </div>
        )}
        {error && <div className="total-stat text-red-400">{error}</div>}
      </div>

      <div className="bluff-controls">
        <input
          type="number"
          min={1}
          max={MAX_BET}
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={status === "rolling"}
        />
        <button
          type="button"
          className="allin-btn"
          onClick={() => setBetAmount(String(MAX_BET))}
          disabled={status === "rolling"}
        >
          ALL-IN
        </button>
        <button className="roll-btn" onClick={handleRoll} disabled={status === "rolling"}>
          {status === "rolling" ? "搖骰中…" : "搖骰開盅"}
        </button>
      </div>
    </div>
  );
};
