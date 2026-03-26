import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';

export default function RoomLobbyView() {
  const { game } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const roomsQuery = useQuery({
    queryKey: ['rooms', game],
    queryFn: async () => {
      const res = await fetch(`/api/v1/games/rooms?game=${game}`);
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 5000,
  });

  const joinMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await fetch(`/api/v1/games/rooms/${roomId}/join`, { method: 'POST' });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        navigate(`/app/casino/${game}/room/${data.data.room.id}`);
      }
    },
  });

  const rooms = roomsQuery.data?.rooms || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4">
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-3xl font-bold text-white capitalize">{game} 遊戲大廳</h2>
          <p className="text-slate-400">選擇合適的房間進入對局</p>
        </div>
        <div className="bg-slate-800 px-4 py-2 rounded-lg text-yellow-500 font-bold border border-yellow-500/20">
          全服在線: {rooms.reduce((acc: number, r: any) => acc + r.players.length, 0)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room: any) => (
          <div key={room.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between h-56 group hover:border-blue-500/50 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-lg font-bold text-white mb-1">房間 #{room.id.split('_')[1]}</div>
                <div className="flex gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-black ${room.vipLevel > 0 ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-slate-300'}`}>
                        {room.vipLevel > 0 ? `VIP ${room.vipLevel}+` : '普通房'}
                    </span>
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-black">CASUAL</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{room.players.length}/{room.maxPlayers}</div>
                <div className="text-[10px] text-slate-500 font-bold">PLAYERS</div>
              </div>
            </div>

            <div className="flex -space-x-2 mt-4">
                {room.players.slice(0, 5).map((p: any) => (
                    <div key={p.userId} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-sm" title={p.displayName}>
                        {p.avatar}
                    </div>
                ))}
                {room.players.length > 5 && (
                    <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                        +{room.players.length - 5}
                    </div>
                )}
            </div>

            <button
                className="w-full mt-6 bg-slate-800 hover:bg-blue-600 text-white font-bold py-2 rounded-xl transition-all border border-slate-700 group-hover:border-blue-400"
                onClick={() => joinMutation.mutate(room.id)}
                disabled={joinMutation.isPending}
            >
                進入房間
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
