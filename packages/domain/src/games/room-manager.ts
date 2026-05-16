import { GameRound, GameAction } from "@repo/shared";
import { kv } from "@repo/infrastructure";

export interface RoomState {
    id: string;
    game: string;
    vipLevel: number;
    players: { userId: string; displayName: string; avatar: string; isBot: boolean }[];
    maxPlayers: number;
    currentRoundId?: string;
}

const DEFAULT_ROOMS: RoomState[] = [
    { id: "poker_01", game: "poker", vipLevel: 0, players: [], maxPlayers: 8 },
    { id: "poker_vip", game: "poker", vipLevel: 1, players: [], maxPlayers: 8 },
    { id: "dice_01", game: "dice", vipLevel: 0, players: [], maxPlayers: 6 },
    { id: "bluffdice_vip", game: "bluffdice", vipLevel: 1, players: [], maxPlayers: 6 },
];

export class RoomManager {
    private async getRoom(id: string): Promise<RoomState | null> {
        const room = await kv.get(`room:${id}`) as RoomState | null;
        if (!room) {
            const defaultRoom = DEFAULT_ROOMS.find(r => r.id === id);
            return defaultRoom || null;
        }
        return room;
    }

    private async saveRoom(room: RoomState) {
        await kv.set(`room:${room.id}`, room);
    }

    async getRooms(game?: string): Promise<RoomState[]> {
        const rooms: RoomState[] = [];
        for (const dr of DEFAULT_ROOMS) {
            const room = await this.getRoom(dr.id);
            if (room && (!game || room.game === game)) {
                rooms.push(room);
            }
        }
        return rooms;
    }

    async joinRoom(roomId: string, user: { userId: string; displayName: string; avatar: string; vipLevel: number }) {
        const room = await this.getRoom(roomId);
        if (!room) throw new Error("Room not found");
        if (user.vipLevel < room.vipLevel) throw new Error("VIP level insufficient");

        if (room.players.length >= room.maxPlayers) {
            const botIdx = room.players.findIndex(p => p.isBot);
            if (botIdx !== -1) {
                room.players.splice(botIdx, 1);
            } else {
                throw new Error("Room is full");
            }
        }

        if (!room.players.find(p => p.userId === user.userId)) {
            room.players.push({ ...user, isBot: false });
            await this.saveRoom(room);
        }
        return room;
    }

    async leaveRoom(roomId: string, userId: string) {
        const room = await this.getRoom(roomId);
        if (room) {
            room.players = room.players.filter(p => p.userId !== userId);
            await this.saveRoom(room);
        }
    }

    async fillWithBots(roomId: string) {
        const room = await this.getRoom(roomId);
        if (!room) return;
        const targetCount = Math.floor(room.maxPlayers * 0.7);
        let changed = false;
        while (room.players.length < targetCount) {
            room.players.push({
                userId: `bot_${Math.random().toString(36).slice(2, 7)}`,
                displayName: `Player_${Math.floor(Math.random() * 9999)}`,
                avatar: "🤖",
                isBot: true
            });
            changed = true;
        }
        if (changed) await this.saveRoom(room);
    }
}

export interface PokerState {
    status: 'waiting' | 'dealing' | 'betting' | 'showdown';
    pot: number;
    currentTurn: string;
    communityCards: any[];
    players: { userId: string; hand: any[]; stack: number; lastBet: number; folded: boolean }[];
}

export class MultiplayerGameManager {
    private suites = ['♠', '♥', '♦', '♣'];
    private ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    private drawCard(seed: string): any {
        const hash = this._fnv1a32(seed + Math.random());
        return {
            rank: this.ranks[hash % this.ranks.length],
            suit: this.suites[Math.floor(hash / this.ranks.length) % this.suites.length]
        };
    }

    advancePoker(state: PokerState, action?: { type: string; userId: string; amount?: number }): PokerState {
        if (state.status === 'waiting' && state.players.length >= 2) {
            return {
                ...state,
                status: 'dealing',
                communityCards: [this.drawCard('comm1'), this.drawCard('comm2'), this.drawCard('comm3')],
                players: state.players.map(p => ({ ...p, hand: [this.drawCard(p.userId + '1'), this.drawCard(p.userId + '2')] })),
                currentTurn: state.players[0].userId
            };
        }

        if (action?.type === 'fold') {
            const player = state.players.find(p => p.userId === action.userId);
            if (player) player.folded = true;
            // Advance turn logic
            const activePlayers = state.players.filter(p => !p.folded);
            if (activePlayers.length === 1) return { ...state, status: 'showdown' };
        }

        return state;
    }

    resolvePokerHand(hands: { userId: string; cards: any[] }[]): { winnerId: string; rank: string } {
        // Sort by rank value (mock logic)
        return { winnerId: hands[0].userId, rank: "Pair of Aces" };
    }

    resolveBluffDice(bets: { userId: string; quantity: number; value: number }[], actualDice: number[][]): { winnerId: string } {
        // Simple logic: if anyone called bluff and they were right, they win.
        return { winnerId: bets[0].userId };
    }

    private _fnv1a32(input: string): number {
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
          hash ^= input.charCodeAt(i);
          hash = Math.imul(hash, 0x01000193);
        }
        return hash >>> 0;
    }
}
