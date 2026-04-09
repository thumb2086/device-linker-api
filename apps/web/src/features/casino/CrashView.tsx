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
  const [targetCrashPoint, setTargetCrashPoint] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const settlingRef = useRef(false);

  const settleRound = async (cashout: boolean, elapsedSeconds: number, shownMultiplier: number) => {
    if (!session) return;
    if (settlingRef.current) return;
    settlingRef.current = true;

    try {
      setError("");
      const res = await api.post("/api/v1/games/crash/play", {
        sessionId: session.id,
        betAmount: Number(betAmount),
        elapsedSeconds,
        cashout,
      });

      const payload = unwrapGameEnvelope<any>(res.data);
      setLastResult(payload);
      setCrashPoint(payload.crashPoint || shownMultiplier);
      setMultiplier(payload.crashPoint || shownMultiplier);
      setStatus(payload.crashed ? "crashed" : "cashed_out");
    } catch (e: any) {
      setError(extractGameError(e?.response?.data || e));
      setStatus("idle");
    } finally {
      settlingRef.current = false;
    }
  };

  const startRace = async () => {
    if (!session || status === "running") return;
    setError("");
    setLastResult(null);
    setCrashPoint(0);
    setStatus("running");
    setMultiplier(1.0);
    startTimeRef.current = Date.now();
    const nextCrash = Number((1.05 + Math.random() * 3.5).toFixed(2));
    setTargetCrashPoint(nextCrash);

    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const current = Math.pow(Math.E, 0.08 * elapsed);
      setMultiplier(current);

      if (current >= nextCrash) {
        if (timerRef.current) clearInterval(timerRef.current);
        setMultiplier(nextCrash);
        setStatus("crashed");
        void settleRound(false, elapsed, nextCrash);
      }
    }, 80);
  };

  const cashOut = async () => {
    if (status !== "running" || !session) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
    setStatus("cashed_out");
    void settleRound(true, elapsedSeconds, multiplier);
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
      {status === "running" && targetCrashPoint && (
        <div className="last-result text-slate-400">本局進行中（倍率持續上升，未停利會自動爆線）</div>
      )}
    </div>
  );
};
