import { useQuery } from '@tanstack/react-query';

export default function AdminView() {
  const healthQuery = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ops/health');
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Admin Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-bold mb-4">System Health</h3>
          <div className="text-green-600 font-bold uppercase">{healthQuery.data?.data?.status || 'OK'}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-bold mb-4">Transaction Intents</h3>
          <div className="text-slate-500">No intents to display.</div>
        </div>
      </div>
    </div>
  );
}
