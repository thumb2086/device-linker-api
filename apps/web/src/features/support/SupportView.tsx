// apps/web/src/features/support/SupportView.tsx

import React, { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../../store/api";

export const SupportView: React.FC = () => {
    const { session } = useAuth();
    const [ticket, setTicket] = useState({ title: "", category: "bug", message: "" });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/api/v1/support/tickets', {
                sessionId: session?.id,
                ...ticket
            });
            alert("感謝您的回饋！我們將盡快處理。");
            setTicket({ title: "", category: "bug", message: "" });
        } catch (e) {
            alert("提交失敗");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl">
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Support Center</h2>
                <p className="text-slate-500 text-sm mb-6">遇到問題或有任何建議？請填寫下表與我們聯繫。</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">問題標題</label>
                            <input 
                              type="text" 
                              required
                              className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white focus:border-blue-500 transition-all outline-none"
                              value={ticket.title}
                              onChange={e => setTicket({...ticket, title: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">分類</label>
                            <select 
                              className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white font-bold text-xs"
                              value={ticket.category}
                              onChange={e => setTicket({...ticket, category: e.target.value})}
                            >
                                <option value="bug">回報 Bug</option>
                                <option value="suggestion">產品建議</option>
                                <option value="account">帳號相關</option>
                                <option value="payment">支付/儲值</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">詳細內容</label>
                        <textarea 
                          required
                          rows={6}
                          className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white focus:border-blue-500 transition-all outline-none resize-none"
                          value={ticket.message}
                          onChange={e => setTicket({...ticket, message: e.target.value})}
                        />
                    </div>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-900/40 transition-all disabled:opacity-50 uppercase tracking-widest text-sm"
                    >
                        {loading ? '提交中...' : '提交工單'}
                    </button>
                </form>
            </div>
        </div>
    );
};
