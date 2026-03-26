// apps/web/src/features/casino/BlackjackView.tsx

import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./Blackjack.css";

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
  isPush: boolean;
  multiplier: number;
  reason?: string;
}

export const BlackjackView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [gameState, setGameState] = useState<GameState>({
    playerCards: [],
    dealerCards: [],
    playerTotal: 0,
    dealerTotal: 0,
    status: "idle",
    isWin: false,
    isPush: false,
    multiplier: 0
  });

  const handleAction = async (type: "start" | "hit" | "stand") => {
    if (!session) return;
    try {
        const res = await api.post(`/api/v1/games/blackjack/play`, {
            sessionId: session.id,
            amount: type === "start" ? betAmount : "0",
            action: { type, state: gameState }
        });
        setGameState(res.data.result);
    } catch (e) {
        console.error(e);
        setGameState({ ...gameState, status: "idle" });
    }
  };

  const renderCard = (card: Card, index: number) => (
    <div key={index} className={`card ${card.hidden ? 'hidden-card' : ''}`}>
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
        <h3>DEALER ({gameState.status === 'in_progress' ? '?' : gameState.dealerTotal})</h3>
        <div className="hand">
          {gameState.dealerCards.map(renderCard)}
        </div>
      </div>

      <div className="player-area">
        <h3>YOU ({gameState.playerTotal})</h3>
        <div className="hand">
          {gameState.playerCards.map(renderCard)}
        </div>
      </div>

      <div className="controls">
        {gameState.status === "idle" || gameState.status === "settled" ? (
          <>
            <input 
              type="number" 
              value={betAmount} 
              onChange={(e) => setBetAmount(e.target.value)} 
            />
            <button className="start-btn" onClick={() => handleAction("start")}>DEAL</button>
          </>
        ) : (
          <>
            <button className="hit-btn" onClick={() => handleAction("hit")}>HIT</button>
            <button className="stand-btn" onClick={() => handleAction("stand")}>STAND</button>
          </>
        )}
      </div>

      {gameState.status === "settled" && (
        <div className={`result-overlay ${gameState.isWin ? 'win' : (gameState.isPush ? 'push' : 'lose')}`}>
          <h2>{gameState.isWin ? 'YOU WIN!' : (gameState.isPush ? 'PUSH' : (gameState.reason || 'YOU LOSE'))}</h2>
          {gameState.isWin && <p>Payout: {parseFloat(betAmount) * gameState.multiplier}</p>}
        </div>
      )}
    </div>
  );
};
