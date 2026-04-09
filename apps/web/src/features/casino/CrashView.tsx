import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./Crash.css";
import { extractGameError, unwrapGameEnvelope } from "./gameClient";

export const CrashView: React.FC = () => {
  const { session } = useAuth();
  const [betAmount, setBetAmount] = useState<string>("100");
  const [status, setStatus] = useState<"idle" | "running" | "crashed" | "cashed_out">("idle");
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [crashPoint, setCrashPoint] = useState<number>(0);
  const [lastResult, setLastResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRace = async () => {
    if (!session) return;

    try {
      setError("");
      await api.post("/api/v1/games/crash/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        elapsedSeconds: 0,
        cashout: false,
      });

      setStatus("running");
      setMultiplier(1.0);
      startTimeRef.current = Date.now();

      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setMultiplier(Math.pow(Math.E, 0.08 * elapsed));
      }, 100);
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
      setStatus("idle");
    }
  };

  const cashOut = async () => {
    if (status !== "running" || !session) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;

    try {
      const res = await api.post("/api/v1/games/crash/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        elapsedSeconds,
        cashout: true,
      });

      const payload = unwrapGameEnvelope<any>(res.data);
      setLastResult(payload);
      setCrashPoint(payload.crashPoint || 0);

      if (payload.crashed) {
        setStatus("crashed");
        setMultiplier(payload.crashPoint || payload.multiplier || 1);
      } else {
        setStatus("cashed_out");
      }
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
      setStatus("idle");
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="crash-container">
      <div className="crash-display">
        <h1 className={status === "crashed" ? "crashed-text" : ""}>{multiplier.toFixed(2)}x</h1>
        {status === "crashed" && <div className="crash-msg">爆線！</div>}
        {status === "cashed_out" && <div className="win-msg">已停利！</div>}
      </div>

      <div className="crash-controls">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          disabled={status === "running"}
        />
        {status === "running" ? (
          <button className="cashout-btn" onClick={cashOut}>立即停利</button>
        ) : (
          <button className="bet-btn" onClick={startRace}>開始下注</button>
        )}
      </div>

      {error && <div className="last-result">錯誤：{error}</div>}
      {lastResult && (
        <div className="last-result">
          上局：{lastResult.result} ｜ 倍率 {lastResult.multiplier?.toFixed?.(2) || lastResult.multiplier}x ｜ 爆線點 {crashPoint.toFixed(2)}
        </div>
      )}
    </div>
  );
};
