// apps/web/src/features/casino/CrashView.tsx

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./Crash.css";

export const CrashView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [status, setStatus] = useState<"idle" | "running" | "crashed" | "cashed_out">("idle");
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [crashPoint, setCrashPoint] = useState<number>(0);
  const [lastResult, setLastResult] = useState<any>(null);
  
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRace = async () => {
    if (!session) return;
    setStatus("running");
    setMultiplier(1.0);
    startTimeRef.current = Date.now();
    
    // In a real socket app, this would be live. 
    // Here we simulate the rise until we crash or user stops.
    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const nextMult = Math.pow(Math.E, 0.08 * elapsed);
      setMultiplier(nextMult);
    }, 100);
  };

  const cashOut = async () => {
    if (status !== "running") return;
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Send to API to settle
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    try {
        const res = await api.post(`/api/v1/games/crash/play`, {
            sessionId: session?.id,
            amount: betAmount,
            action: { elapsed }
        });
        setLastResult(res.data);
        if (res.data.result.crashed) {
            setStatus("crashed");
            setMultiplier(res.data.result.crashPoint);
        } else {
            setStatus("cashed_out");
        }
    } catch (e) {
        console.error(e);
        setStatus("idle");
    }
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="crash-container">
      <div className="crash-display">
        <h1 className={status === "crashed" ? "crashed-text" : ""}>
          {multiplier.toFixed(2)}x
        </h1>
        {status === "crashed" && <div className="crash-msg">CRASHED!</div>}
        {status === "cashed_out" && <div className="win-msg">CASHED OUT!</div>}
      </div>

      <div className="crash-controls">
        <input 
          type="number" 
          value={betAmount} 
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={status === "running"}
        />
        {status === "running" ? (
          <button className="cashout-btn" onClick={cashOut}>CASH OUT</button>
        ) : (
          <button className="bet-btn" onClick={startRace}>BET</button>
        )}
      </div>

      {lastResult && (
        <div className="last-result">
          Last: {lastResult.isWin ? "WIN" : "LOSE"} | {lastResult.multiplier}x
        </div>
      )}
    </div>
  );
};
