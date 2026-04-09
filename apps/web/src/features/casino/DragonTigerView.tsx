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

interface OpenGateData {
  gateId: string;
  left: string;
  right: string;
  lo: number;
  hi: number;
  multiplier: number;
}

const SUIT = "♦";

export const DragonTigerView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [openGate, setOpenGate] = useState<OpenGateData | null>(null);
  const [result, setResult] = useState<DragonResult | null>(null);
  const [error, setError] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const multiplier = useMemo(() => {
    if (openGate) return openGate.multiplier;
    if (!result) return 0;
    const diff = Math.abs((result.hi ?? 0) - (result.lo ?? 0));
    return diff === 0 ? 0 : Number((12 / diff).toFixed(2));
  }, [openGate, result]);

  const renderCard = (card?: Card) => (
    <div className="card">
      {card ? (
        <>
          <span className="rank">{card.rank}</span>
          <span className="suit">{card.suit}</span>
        </>
      ) : ("?")}
    </div>
  );

  const handleOpenGate = async () => {
    if (!session) return;

    try {
      setError("");
      setResult(null);
      setIsOpening(true);
      const res = await api.post("/api/v1/games/shoot-dragon-gate/open", {
        sessionId: session.id
      });
      setOpenGate(unwrapGameEnvelope<OpenGateData>(res.data));
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
    } finally {
      setIsOpening(false);
    }
  };

  const handlePlay = async () => {
    if (!session || !openGate) return;

    try {
      setError("");
      setIsPlaying(true);
      const res = await api.post("/api/v1/games/shoot-dragon-gate/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        gateId: openGate.gateId,
        token: "zhixi",
      });
      setResult(unwrapGameEnvelope<DragonResult>(res.data));
      setOpenGate(null);
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
    } finally {
      setIsPlaying(false);
    }
  };

  const leftCard = openGate ? { rank: openGate.left, suit: SUIT } : result ? { rank: result.left, suit: SUIT } : undefined;
  const rightCard = openGate ? { rank: openGate.right, suit: SUIT } : result ? { rank: result.right, suit: SUIT } : undefined;
  const midCard = result ? { rank: result.mid, suit: SUIT } : undefined;

  return (
    <div className="dragon-tiger-container">
      <div className="gate-area">
        <div className="gate-side left">
          <h3>龍門左牌</h3>
          {leftCard ? renderCard(leftCard) : <div className="card-slot">?</div>}
        </div>
        <div className="gate-multiplier">
          <span>{multiplier || 0}x 倍率</span>
        </div>
        <div className="gate-side right">
          <h3>龍門右牌</h3>
          {rightCard ? renderCard(rightCard) : <div className="card-slot">?</div>}
        </div>
      </div>

      <div className="shot-area">
        <h3>你的射牌</h3>
        {midCard ? renderCard(midCard) : <div className="card-slot highlight">?</div>}
      </div>

      <div className="controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={isPlaying}
          placeholder="下注金額"
        />
        <button className="gate-btn" onClick={handleOpenGate} disabled={isOpening || isPlaying}>
          {isOpening ? "開門中..." : "1. 先開門"}
        </button>
        <button className="gate-btn" onClick={handlePlay} disabled={!openGate || isPlaying || isOpening}>
          {isPlaying ? "結算中..." : "2. 決定下注並開射"}
        </button>
      </div>

      {!openGate && !result && !error && (
        <div className="text-center text-sm text-gray-300">先開門看兩張門牌，再決定是否下注。</div>
      )}

      {error && <div className="result-overlay lose"><h2>{error}</h2></div>}

      {result && !error && (
        <div className={`result-overlay ${result.result === "win" ? "win" : result.result === "draw" ? "pillar" : "lose"}`}>
          <h2>{result.result === "win" ? "贏了！" : result.result === "draw" ? "平手" : "未中"}</h2>
        </div>
      )}
    </div>
  );
};
