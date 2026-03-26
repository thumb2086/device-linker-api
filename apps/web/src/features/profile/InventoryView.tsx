import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '../../store/useUserStore';

export default function InventoryView() {
  const { address } = useUserStore();
  const inventoryQuery = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const res = await fetch('/api/v1/me/inventory');
      const data = await res.json();
      return data.data;
    },
    enabled: !!address,
  });

  const items = inventoryQuery.data?.inventory || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <h2 className="text-3xl font-bold text-white">我的背包</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item: any, i: number) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center space-y-3">
            <div className="text-4xl">{item.icon || '📦'}</div>
            <div>
              <div className="font-bold text-white">{item.name}</div>
              <div className="text-xs text-slate-500">數量: {item.qty}</div>
            </div>
            <button className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs py-2 rounded-lg font-bold">
              使用
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl">
            背包空空如也
          </div>
        )}
      </div>
    </div>
  );
}
