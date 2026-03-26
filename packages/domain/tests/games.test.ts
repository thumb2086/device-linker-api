import { GameManager } from "../src/games/game-manager.js";

const manager = new GameManager();
const userId = "550e8400-e29b-41d4-a716-446655440000";

const opensAt = new Date();
const closesAt = new Date(Date.now() + 30000);
const bettingClosesAt = new Date(Date.now() + 25000);

const round = manager.createRound("coinflip", "round_123", opensAt, closesAt, bettingClosesAt);
console.log("Created Round:", round.game, round.externalRoundId, round.status);

const locked = manager.lockRound(round);
console.log("Locked Round:", locked.status);

const action = manager.createAction(userId, round.id, "coinflip", "10", "ZXC", { selection: "heads" });
console.log("Created Action:", action.game, action.amount, action.payload);

const settled = manager.settleRound(locked, { winner: "heads" });
console.log("Settled Round:", settled.status, settled.result);
