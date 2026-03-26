import { useQuery } from '@tanstack/react-query';

export default function MarketView() {
  const marketQuery = useQuery({
    queryKey: ['market-summary'],
    queryFn: async () => {
      const res = await fetch('/api/v1/market/summary');
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Market</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {marketQuery.data?.data?.items?.map((item: any) => (
          <div key={item.id} className="bg-white p-4 rounded shadow border">
            <div className="font-bold">{item.symbol}</div>
            <div className="text-xl">{item.price}</div>
          </div>
        ))}
        {marketQuery.data?.data?.items?.length === 0 && <div className="text-slate-500">No items available.</div>}
      </div>
    </div>
  );
}
