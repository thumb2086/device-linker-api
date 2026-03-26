import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useUserStore } from '../../store/useUserStore';

export default function CasinoView() {
  const { game } = useParams();
  const { address, token } = useUserStore();

  const roundQuery = useQuery({
    queryKey: ['casino-round', game],
    queryFn: async () => {
      const res = await fetch(`/api/v1/games/${game}/rounds`, { method: 'POST' });
      return res.json();
    },
    refetchInterval: 5000,
  });

  const betMutation = useMutation({
    mutationFn: async ({ amount, payload }: { amount: string, payload: any }) => {
      const roundId = roundQuery.data?.data?.round?.id;
      if (!roundId) throw new Error('No active round');
      const res = await fetch(`/api/v1/games/${game}/rounds/${roundId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bet', amount, token, payload }),
      });
      return res.json();
    },
  });

  if (roundQuery.isLoading) return <div>Loading...</div>;

  const round = roundQuery.data?.data?.round;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold uppercase">{game}</h2>
      <div className="bg-slate-900 text-white p-8 rounded-xl text-center">
        <div className="text-sm opacity-60 mb-2">ROUND ID: {round?.externalRoundId}</div>
        <div className="text-3xl font-mono mb-4">STATUS: {round?.status}</div>
        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
          <button
            className="bg-red-600 hover:bg-red-700 p-4 rounded-lg font-bold"
            onClick={() => betMutation.mutate({ amount: '10', payload: { selection: 'red' } })}
            disabled={betMutation.isPending}
          >
            RED (10)
          </button>
          <button
            className="bg-slate-800 hover:bg-slate-700 p-4 rounded-lg font-bold"
            onClick={() => betMutation.mutate({ amount: '10', payload: { selection: 'black' } })}
            disabled={betMutation.isPending}
          >
            BLACK (10)
          </button>
        </div>
      </div>
    </div>
  );
}
