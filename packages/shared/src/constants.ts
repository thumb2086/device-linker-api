// packages/shared/src/constants.ts

// ─── Token ────────────────────────────────────────────────────────────────────
export const TOKENS = {
  ZHIXI: "zhixi",
  YJC: "yjc",
} as const;
export type Token = (typeof TOKENS)[keyof typeof TOKENS];

// ─── Supported Games ──────────────────────────────────────────────────────────
export const GAMES = {
  COINFLIP: "coinflip",
  ROULETTE: "roulette",
  HORSE: "horse",
  SLOTS: "slots",
  BLACKJACK: "blackjack",
  DRAGON: "dragon",
  SICBO: "sicbo",
  BINGO: "bingo",
  CRASH: "crash",
  DUEL: "duel",
  POKER: "poker",
  BLUFFDICE: "bluffdice",
} as const;
export type Game = (typeof GAMES)[keyof typeof GAMES];

export const GAME_LABELS: Record<Game, string> = {
  coinflip: "擲硬幣",
  roulette: "輪盤",
  horse: "賽馬",
  slots: "拉霸",
  blackjack: "21 點",
  dragon: "龍虎",
  sicbo: "骰寶",
  bingo: "賓果",
  crash: "暴漲",
  duel: "對決",
  poker: "德州撲克",
  bluffdice: "吹牛骰子",
};

export const SUPPORTED_GAMES = Object.values(GAMES);

// ─── Session ──────────────────────────────────────────────────────────────────
export const SESSION_STATUS = {
  PENDING: "pending",
  AUTHORIZED: "authorized",
  EXPIRED: "expired",
} as const;

export const SESSION_MODE = {
  LIVE: "live",
  CUSTODY: "custody",
} as const;

export const SESSION_DEFAULT_TTL_SECONDS = 3600;

// ─── Custody ──────────────────────────────────────────────────────────────────
export const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
export const CUSTODY_PASSWORD_MIN = 6;
export const CUSTODY_PASSWORD_MAX = 128;
export const CUSTODY_REGISTER_BONUS = "100000";

// ─── Airdrop ──────────────────────────────────────────────────────────────────
export const AIRDROP_BASE_REWARD = "100000";
export const AIRDROP_HALVING_STEP = "1000000000";
export const AIRDROP_MIN_REWARD = "10";

// ─── VIP Level Tiers (from lib/level.js) ─────────────────────────────────────
export interface LevelTier {
  threshold: number;
  label: string;
  maxBet: number;
}

export const LEVEL_TIERS: LevelTier[] = [
  { threshold: 0, label: "普通會員", maxBet: 1_000 },
  { threshold: 10_000, label: "青銅會員", maxBet: 5_000 },
  { threshold: 100_000, label: "白銀會員", maxBet: 20_000 },
  { threshold: 1_000_000, label: "黃金會員", maxBet: 100_000 },
  { threshold: 10_000_000, label: "白金會員", maxBet: 500_000 },
  { threshold: 50_000_000, label: "鑽石等級", maxBet: 2_000_000 },
  { threshold: 100_000_000, label: "黑鑽等級", maxBet: 10_000_000 },
  { threshold: 200_000_000, label: "菁英等級", maxBet: 20_000_000 },
  { threshold: 500_000_000, label: "宗師等級", maxBet: 50_000_000 },
  { threshold: 1_000_000_000, label: "王者等級", maxBet: 100_000_000 },
  { threshold: 2_000_000_000, label: "至尊等級", maxBet: 200_000_000 },
  { threshold: 5_000_000_000, label: "蒼穹等級", maxBet: 300_000_000 },
  { threshold: 10_000_000_000, label: "寰宇等級", maxBet: 500_000_000 },
  { threshold: 20_000_000_000, label: "星穹等級", maxBet: 700_000_000 },
  { threshold: 50_000_000_000, label: "萬界等級", maxBet: 850_000_000 },
  { threshold: 100_000_000_000, label: "創世等級", maxBet: 900_000_000 },
  { threshold: 1_000_000_000_000, label: "神諭等級", maxBet: 1_000_000_000 },
  { threshold: 2_000_000_000_000, label: "神諭一階", maxBet: 2_000_000_000 },
  { threshold: 5_000_000_000_000, label: "神諭二階", maxBet: 5_000_000_000 },
  { threshold: 10_000_000_000_000, label: "神諭三階", maxBet: 10_000_000_000 },
  { threshold: 20_000_000_000_000, label: "神諭四階", maxBet: 20_000_000_000 },
  { threshold: 50_000_000_000_000, label: "神諭五階", maxBet: 50_000_000_000 },
  { threshold: 100_000_000_000_000, label: "神諭六階", maxBet: 100_000_000_000 },
  { threshold: 200_000_000_000_000, label: "神諭七階", maxBet: 200_000_000_000 },
  { threshold: 500_000_000_000_000, label: "神諭八階", maxBet: 500_000_000_000 },
  { threshold: 1_000_000_000_000_000, label: "神諭九階", maxBet: 1_000_000_000_000 },
  { threshold: 2_000_000_000_000_000, label: "神諭十階", maxBet: 2_000_000_000_000 },
  { threshold: 5_000_000_000_000_000, label: "神諭十一階", maxBet: 5_000_000_000_000 },
  { threshold: 10_000_000_000_000_000, label: "神諭十二階", maxBet: 10_000_000_000_000 },
];

// ─── YJC VIP Tiers ────────────────────────────────────────────────────────────
export interface YjcVipTier {
  key: string;
  label: string;
  minBalance: number;
  maxBalance: number;
  roomAccess: string[];
  perks?: string[];
}

export const YJC_VIP_TIERS: YjcVipTier[] = [
  { key: "none", label: "未達 VIP", minBalance: 0, maxBalance: 0, roomAccess: [] },
  { key: "vip1", label: "VIP 1", minBalance: 1, maxBalance: 999, roomAccess: ["table_1"] },
  { key: "vip2", label: "VIP 2", minBalance: 1000, maxBalance: Number.POSITIVE_INFINITY, roomAccess: ["table_1", "table_2"], perks: ["zero_fee"] },
];

// ─── VIP Chat Rooms ───────────────────────────────────────────────────────────
export const VIP_CHAT_ROOMS = [
  {
    id: "public",
    label: "公共大廳",
    requiredLevel: null as string | null,
    announcement: "全服聊天室，所有玩家都可加入。",
    bettingToken: { symbol: "子熙幣", key: "zixi", chainStatus: "live", bettingEnabled: true },
  },
  {
    id: "vip",
    label: "VIP 大廳",
    requiredLevel: "黃金會員",
    announcement: "VIP 專屬聊天室，僅開放黃金會員以上玩家加入。",
    bettingToken: { symbol: "優件幣", key: "youjian", chainStatus: "reserved", bettingEnabled: false },
  },
];

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const CHAT_STREAM_KEY = "chat:stream:v1:public";
export const CHAT_MAX_ITEMS = 120;
export const WINNER_BARRAGE_DEDUPE_TTL_SECONDS = 24 * 60 * 60;

// ─── Error Codes ──────────────────────────────────────────────────────────────
export const ERROR_CODES = {
  SESSION_EXPIRED: "SESSION_EXPIRED",
  BLACKLISTED: "BLACKLISTED",
  MAINTENANCE: "MAINTENANCE",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  BET_LIMIT_EXCEEDED: "BET_LIMIT_EXCEEDED",
  INVALID_GAME: "INVALID_GAME",
  TX_BROADCAST_ERROR: "TX_BROADCAST_ERROR",
  TX_RECEIPT_ERROR: "TX_RECEIPT_ERROR",
  RECONCILIATION_ERROR: "RECONCILIATION_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  DOMAIN_ERROR: "DOMAIN_ERROR",
  API_ERROR: "API_ERROR",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
} as const;

// ─── Transfer / Wallet ────────────────────────────────────────────────────────
export const MAX_TRANSFER_AMOUNT = 100_000_000;
export const SECURE_TRANSFER_FEE_RATE = 0.05;

// ─── Market Simulation ────────────────────────────────────────────────────────
export const MARKET_TICK_MS = 30_000;
export const DEFAULT_MARKET_STARTING_CASH = 100_000;

// ─── Maintenance ─────────────────────────────────────────────────────────────
export const MAINTENANCE_KV_KEY = "maintenance:status";
export const DEFAULT_MAINTENANCE_TITLE = "系統維護中";
export const DEFAULT_MAINTENANCE_MESSAGE = "目前暫停登入與遊戲，請稍後再試。";

// ─── Airdrop KV Key ───────────────────────────────────────────────────────────
export const AIRDROP_DISTRIBUTED_TOTAL_KEY = "airdrop:distributed_total";

// ─── Market Symbols ──────────────────────────────────────────────────────────
export const MARKET_SYMBOLS = {
  "BTC/USD": { basePrice: 50000, volatility: 0.05, phase: 0 },
  "ETH/USD": { basePrice: 3000, volatility: 0.08, phase: 1 },
  "SOL/USD": { basePrice: 100, volatility: 0.12, phase: 2 },
  "YJC/USD": { basePrice: 0.1, volatility: 0.2, phase: 3 },
};
