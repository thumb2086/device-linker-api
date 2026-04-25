import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router-dom';
import AppBottomNav from '../../components/AppBottomNav';

type TxRow = {
  id: string;
  roundId: string | number;
  userAddress: string;
  type: 'bet' | 'payout' | 'deposit' | 'withdrawal' | 'transfer';
  amount: string;
  tokenSymbol?: string;
  status: 'pending' | 'broadcasted' | 'confirmed' | 'failed';
  txHash?: string;
  createdAt: string;
  gameType?: string;
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  broadcasted: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

function toExplorerUrl(txHash: string) {
  const base = import.meta.env.VITE_EXPLORER_BASE_URL || 'https://sepolia.etherscan.io/tx/';
  return `${base}${txHash}`;
}

export default function TransactionsDashboardView() {
  const [status, setStatus] = useState<string>('');
  const [address, setAddress] = useState('');
  const [gameType, setGameType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = useMemo(() => ({
    status: status || undefined,
    address: address || undefined,
    gameType: gameType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit: 20,
  }), [status, address, gameType, startDate, endDate, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-transactions', queryParams],
    queryFn: async () => {
      const res = await axios.get('/api/v1/dashboard/transactions', { params: queryParams });
      return res.data?.data as { items: TxRow[]; total: number };
    },
    refetchInterval: 10000,
  });

  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary', address],
    queryFn: async () => {
      const res = await axios.get('/api/v1/dashboard/summary', {
        params: { address: address || undefined },
      });
      return res.data?.data as {
        total: number;
        confirmed: number;
        failed: number;
        pending: number;
        successRate: number;
      };
    },
    refetchInterval: 10000,
  });

  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const statusCounts = (data?.items || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-28 text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="app-shell flex items-center justify-between py-4">
          <h1 className="text-lg font-black uppercase tracking-[0.1em] text-[#fcc025]">Dashboard / Transactions</h1>
          <Link to="/app" className="text-xs font-bold text-[#adaaaa] hover:text-[#fcc025]">Back</Link>
        </div>
      </header>

      <main className="app-shell pt-24 space-y-4">
        <section className="grid gap-3 md:grid-cols-5">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg bg-[#1a1919] p-2 text-sm">
            <option value="">All status</option>
            <option value="pending">pending</option>
            <option value="broadcasted">broadcasted</option>
            <option value="confirmed">confirmed</option>
            <option value="failed">failed</option>
          </select>
          <input value={address} onChange={(e) => { setAddress(e.target.value); setPage(1); }} placeholder="Address" className="rounded-lg bg-[#1a1919] p-2 text-sm" />
          <input value={gameType} onChange={(e) => { setGameType(e.target.value); setPage(1); }} placeholder="Game type" className="rounded-lg bg-[#1a1919] p-2 text-sm" />
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="rounded-lg bg-[#1a1919] p-2 text-sm" />
          <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="rounded-lg bg-[#1a1919] p-2 text-sm" />
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#494847]/20 bg-gradient-to-br from-[#1e1d1d] to-[#151414] p-3 text-sm">Total: <b>{summary?.total ?? 0}</b></div>
          <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 to-[#151414] p-3 text-sm">Confirmed: <b>{summary?.confirmed ?? 0}</b></div>
          <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-900/20 to-[#151414] p-3 text-sm">Pending: <b>{summary?.pending ?? 0}</b></div>
          <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-900/20 to-[#151414] p-3 text-sm">Success: <b>{((summary?.successRate ?? 0) * 100).toFixed(2)}%</b></div>
        </section>

        <section className="grid gap-2 md:grid-cols-4">
          {['confirmed', 'pending', 'broadcasted', 'failed'].map((st) => (
            <div key={st} className="rounded-lg border border-[#494847]/20 bg-[#141313] p-2 text-xs uppercase text-[#adaaaa]">
              {st}: <span className="text-white font-bold">{statusCounts[st] || 0}</span>
            </div>
          ))}
        </section>

        <section className="overflow-x-auto rounded-xl border border-[#494847]/10 bg-[#1a1919]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#494847]/20 text-left text-[#adaaaa]">
                <th className="p-3">時間</th>
                <th className="p-3">回合ID</th>
                <th className="p-3">地址</th>
                <th className="p-3">類型</th>
                <th className="p-3">金額</th>
                <th className="p-3">狀態</th>
                <th className="p-3">TxHash</th>
                <th className="p-3">遊戲</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td className="p-3" colSpan={8}>Loading...</td></tr>
              ) : (data?.items || []).map((row) => (
                <tr key={row.id} className="border-b border-[#494847]/10">
                  <td className="p-3">{new Date(row.createdAt).toLocaleString('zh-TW')}</td>
                  <td className="p-3">{String(row.roundId)}</td>
                  <td className="p-3">{row.userAddress}</td>
                  <td className="p-3 uppercase">{row.type}</td>
                  <td className="p-3">{row.amount} {row.tokenSymbol || ''}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColors[row.status] || 'bg-white/10 text-white border-white/20'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {row.txHash ? (
                      <a className="text-[#fcc025] underline" href={toExplorerUrl(row.txHash)} target="_blank" rel="noreferrer">{row.txHash.slice(0, 10)}...</a>
                    ) : '--'}
                  </td>
                  <td className="p-3">{row.gameType || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="flex items-center justify-between text-sm text-[#adaaaa]">
          <button className="rounded border border-[#494847]/30 px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button className="rounded border border-[#494847]/30 px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
        </div>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
