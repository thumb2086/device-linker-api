// apps/web/src/features/wallet/WalletView.tsx

import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";
import "./Wallet.css";

interface TransferTarget {
  address: string;
  amount: string;
  token: "zhixi" | "yjc";
}

export const WalletView: React.FC = () => {
  const { isAuthorized, session } = useAuth();
  const [balances, setBalances] = useState<{ zhixi: string; yjc: string }>({ zhixi: "0", yjc: "0" });
  const [totalBet, setTotalBet] = useState<string>("0");
  const [transfer, setTransfer] = useState<TransferTarget>({ address: "", amount: "", token: "zhixi" });
  const [loading, setLoading] = useState(false);

  const fetchSummary = async () => {
    if (!isAuthorized) return;
    try {
      const res = await api.get(`/api/v1/wallet/summary`, { params: { sessionId: session?.id } });
      setBalances(res.data.balances);
      setTotalBet(res.data.totalBet);
    } catch (e) {
      console.error("Failed to fetch wallet summary", e);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [isAuthorized]);

  const handleTransfer = async () => {
    if (!transfer.address || !transfer.amount) return;
    setLoading(true);
    try {
      const res = await api.post(`/api/v1/wallet/transfer`, {
        sessionId: session?.id,
        to: transfer.address,
        amount: transfer.amount,
        token: transfer.token
      });
      if (res.data.error) {
        alert(res.data.error.message);
      } else {
        alert("轉帳成功！");
        setTransfer({ ...transfer, address: "", amount: "" });
        fetchSummary();
      }
    } catch (e) {
      alert("轉帳失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wallet-container">
      <div className="wallet-header">
        <h2 className="text-2xl font-black italic text-blue-500 uppercase tracking-tighter">My Wallet</h2>
        <div className="address-badge">{session?.address}</div>
      </div>

      <div className="balance-grid">
        <div className="balance-card zhixi">
          <div className="label">ZHIXI BALANCE</div>
          <div className="value">{parseFloat(balances.zhixi).toLocaleString()}</div>
          <div className="symbol">ZXC</div>
        </div>
        <div className="balance-card yjc">
          <div className="label">YJC BALANCE</div>
          <div className="value">{parseFloat(balances.yjc).toLocaleString()}</div>
          <div className="symbol">YJC</div>
        </div>
        <div className="balance-card stats">
          <div className="label">TOTAL WAGERED</div>
          <div className="value">{parseFloat(totalBet).toLocaleString()}</div>
          <div className="symbol">LVL UP progres...</div>
        </div>
      </div>

      <div className="transfer-section bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Secure Transfer</h3>
        <div className="space-y-4">
          <div className="flex gap-4">
            <input 
              type="text" 
              placeholder="Recipient Address (0x...)" 
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-all"
              value={transfer.address}
              onChange={(e) => setTransfer({ ...transfer, address: e.target.value })}
            />
            <select 
              className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white uppercase font-bold text-xs"
              value={transfer.token}
              onChange={(e) => setTransfer({ ...transfer, token: e.target.value as any })}
            >
              <option value="zhixi">ZXC</option>
              <option value="yjc">YJC</option>
            </select>
          </div>
          <div className="flex gap-4">
            <input 
              type="number" 
              placeholder="Amount to send" 
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-all"
              value={transfer.amount}
              onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })}
            />
            <button 
              disabled={loading}
              onClick={handleTransfer}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black px-8 py-3 rounded-xl shadow-lg shadow-blue-900/20 disabled:opacity-50 transition-all uppercase tracking-widest text-xs"
            >
              Confirm Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
