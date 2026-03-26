import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useUserStore } from '../../store/useUserStore';

export default function WalletFeature() {
  const { address, balance, token, setToken, setBalance } = useUserStore();
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const summaryQuery = useQuery({
    queryKey: ['wallet-summary', token],
    queryFn: async () => {
      const res = await fetch(`/api/v1/wallet/summary?token=${token}`);
      return res.json();
    },
    enabled: !!address,
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount: string) => {
      const res = await fetch('/api/v1/wallet/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, amount }),
      });
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Wallet</h2>
      <div className="bg-white p-6 rounded-lg shadow border">
        <div className="flex justify-between items-center mb-4">
          <div className="text-lg">Balance: <span className="font-mono font-bold">{balance} {token}</span></div>
          <select
            className="border p-2 rounded"
            value={token}
            onChange={(e) => setToken(e.target.value as 'ZXC' | 'YJC')}
          >
            <option value="ZXC">ZXC</option>
            <option value="YJC">YJC</option>
          </select>
        </div>
        <div className="flex space-x-2">
          <input
            type="number"
            placeholder="Amount"
            className="border p-2 rounded flex-1"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            onClick={() => withdrawMutation.mutate(withdrawAmount)}
            disabled={withdrawMutation.isPending}
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}
