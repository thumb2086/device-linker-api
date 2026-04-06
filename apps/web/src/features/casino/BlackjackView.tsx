import React, { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./Blackjack.css";
import { extractGameError, unwrapGameEnvelope } from "./gameClient";

interface Card {
  rank: string;
  suit: string;
  hidden?: boolean;
}

interface GameState {
  playerCards: Card[];
  dealerCards: Card[];
  playerTotal: number;
  dealerTotal: number;
  status: "idle" | "in_progress" | "settled";
  isWin: boolean;
  isPush?: boolean;
  multiplier: number;
  reason?: string;
}

const INITIAL_STATE: GameState = {
  playerCards: [],
  dealerCards: [],
  playerTotal: 0,
  dealerTotal: 0,
  status: "idle",
  isWin: false,
  isPush: false,
  multiplier: 0,
};

export const BlackjackView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [error, setError] = useState<string>("");

  const handleAction = async (action: "start" | "hit" | "stand") => {
    if (!session) return;

    try {
      setError("");
      const res = await api.post("/api/v1/games/blackjack/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        action,
        state: gameState.status === "idle" ? undefined : gameState,
      });

      const payload = unwrapGameEnvelope<any>(res.data);
      setGameState({
        playerCards: payload.playerCards || [],
        dealerCards: payload.dealerCards || [],
        playerTotal: payload.playerTotal || 0,
        dealerTotal: payload.dealerTotal || 0,
        status: payload.status || (payload.result ? "settled" : "idle"),
        isWin: Boolean(payload.isWin || payload.result === "win"),
        isPush: Boolean(payload.isPush || payload.result === "draw"),
        multiplier: payload.multiplier || 0,
        reason: payload.reason,
      });
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
    }
  };

  const renderCard = (card: Card, index: number) => (
    <div key={index} className={`card ${card.hidden ? "hidden-card" : ""}`}>
      {!card.hidden && (
        <>
          <span className="rank">{card.rank}</span>
          <span className="suit">{card.suit}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="blackjack-container">
      <div className="dealer-area">
        <h3>DEALER ({gameState.status === "in_progress" ? "?" : gameState.dealerTotal})</h3>
        <div className="hand">{gameState.dealerCards.map(renderCard)}</div>
      </div>

      <div className="player-area">
        <h3>YOU ({gameState.playerTotal})</h3>
        <div className="hand">{gameState.playerCards.map(renderCard)}</div>
      </div>

      <div className="controls">
        {gameState.status === "idle" || gameState.status === "settled" ? (
          <>
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} />
            <button className="start-btn" onClick={() => handleAction("start")}>DEAL</button>
          </>
        ) : (
          <>
            <button className="hit-btn" onClick={() => handleAction("hit")}>HIT</button>
            <button className="stand-btn" onClick={() => handleAction("stand")}>STAND</button>
          </>
        )}
      </div>

      {error && <div className="result-overlay lose"><h2>{error}</h2></div>}

      {gameState.status === "settled" && !error && (
        <div className={`result-overlay ${gameState.isWin ? "win" : gameState.isPush ? "push" : "lose"}`}>
          <h2>{gameState.isWin ? "YOU WIN!" : gameState.isPush ? "PUSH" : gameState.reason || "YOU LOSE"}</h2>
          {gameState.isWin && <p>Payout: {parseFloat(betAmount) * gameState.multiplier}</p>}
        </div>
      )}
    </div>
  );
};
