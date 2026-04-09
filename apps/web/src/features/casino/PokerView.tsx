import React, { useMemo, useState } from "react";
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

const MAX_BET = 1_000_000;

export const PokerView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [status, setStatus] = useState<"idle" | "playing" | "settled">("idle");
  const [result, setResult] = useState<PokerResult | null>(null);
  const [error, setError] = useState("");

  const chips = useMemo(() => Array.from({ length: 14 }, (_, index) => index), []);

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
    } catch (e: unknown) {
      setError(extractGameError(e));
      setStatus("idle");
    }
  };

  return (
    <div className="poker-container luxury-theme">
      <div className="poker-table">
        <div className="table-inner">
          {status === "playing" && (
            <div className="chip-rain" aria-hidden="true">
              {chips.map((chip) => (
                <span key={chip} className="chip" style={{ animationDelay: `${chip * 0.08}s` }} />
              ))}
            </div>
          )}

          {status === "idle" && <div className="poker-msg">準備發牌？</div>}
          {status === "playing" && <div className="poker-msg animating">洗牌中…</div>}
          {status === "settled" && result && (
            <div className={`poker-result ${result.result === "win" ? "win" : "lose"}`}>
              <div className="hand-name">{result.hand}</div>
              <div className="result-text">{result.result === "win" ? "恭喜獲勝！" : "本局未中，再接再厲"}</div>
              {result.result === "win" && <div className="payout">+{result.payout}</div>}
            </div>
          )}
          {error && <div className="result-text text-red-400">{error}</div>}
        </div>
      </div>

      <div className="poker-controls">
        <input
          type="number"
          min={1}
          max={MAX_BET}
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={status === "playing"}
        />
        <button
          type="button"
          className="allin-btn"
          disabled={status === "playing"}
          onClick={() => setBetAmount(String(MAX_BET))}
        >
          全下
        </button>
        <button className="deal-btn" onClick={handlePlay} disabled={status === "playing"}>
          {status === "settled" ? "再來一局" : "發牌"}
        </button>
      </div>
    </div>
  );
};
