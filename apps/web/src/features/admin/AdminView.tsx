import { useQuery } from '@tanstack/react-query';

export default function AdminView() {
  const healthQuery = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ops/health');
      return res.json();
    },
  });

  const eventsQuery = useQuery({
    queryKey: ['admin-events'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ops/events');
      return res.json();
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${healthQuery.data?.data?.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          SYSTEM: {healthQuery.data?.data?.status || 'OK'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-slate-500">Total Bets</div>
            <div className="text-2xl font-bold">1.2M ZXC</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-slate-500">Active Players</div>
            <div className="text-2xl font-bold">42</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-slate-500">Pending Tx</div>
            <div className="text-2xl font-bold text-orange-600">3</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-slate-500">24h Revenue</div>
            <div className="text-2xl font-bold text-green-600">+15k</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="p-4 border-b bg-slate-50 font-bold">Operational Events (Single Source of Truth)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="p-3">Time</th>
                <th className="p-3">Source</th>
                <th className="p-3">Kind</th>
                <th className="p-3">Message</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {eventsQuery.data?.data?.events?.map((ev: any) => (
                <tr key={ev.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 text-slate-400">{new Date(ev.createdAt).toLocaleTimeString()}</td>
                  <td className="p-3 font-mono">{ev.source}</td>
                  <td className="p-3"><span className="px-2 py-0.5 bg-slate-200 rounded">{ev.kind}</span></td>
                  <td className="p-3">{ev.message}</td>
                  <td className="p-3 text-green-600 font-bold">SUCCESS</td>
                </tr>
              ))}
              {!eventsQuery.data?.data?.events?.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic">No events recorded in this session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
