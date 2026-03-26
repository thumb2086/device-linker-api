import { useQuery } from '@tanstack/react-query';

export default function RewardsView() {
  const rewardsQuery = useQuery({
    queryKey: ['rewards-summary'],
    queryFn: async () => {
      const res = await fetch('/api/v1/rewards/summary');
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Rewards</h2>
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-bold mb-4">Inventory</h3>
        <div className="text-slate-500">No rewards granted yet.</div>
      </div>
    </div>
  );
}
