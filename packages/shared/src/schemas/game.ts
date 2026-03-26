import { z } from "zod";

export const GameRoundStatusSchema = z.enum(["betting", "locked", "calculating", "settled", "failed"]);
export type GameRoundStatus = z.infer<typeof GameRoundStatusSchema>;

export const GameRoundSchema = z.object({
  id: z.string().uuid(),
  game: z.string(),
  externalRoundId: z.string(), // The deterministic roundId
  status: GameRoundStatusSchema,
  result: z.any().nullable(),
  opensAt: z.date(),
  closesAt: z.date(),
  bettingClosesAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type GameRound = z.infer<typeof GameRoundSchema>;

export const GameActionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  roundId: z.string().uuid(),
  game: z.string(),
  type: z.enum(["bet"]),
  payload: z.any(),
  amount: z.string(),
  token: z.enum(["ZXC", "YJC"]),
  txIntentId: z.string().uuid().nullable().optional(),
  status: z.enum(["pending", "processed", "failed"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type GameAction = z.infer<typeof GameActionSchema>;

export const GameSettlementStatusSchema = z.enum(["pending", "settled", "failed"]);
export type GameSettlementStatus = z.infer<typeof GameSettlementStatusSchema>;

export const GameSettlementSchema = z.object({
  id: z.string().uuid(),
  roundId: z.string(),
  userId: z.string().uuid(),
  address: z.string(),
  game: z.string(),
  token: z.enum(["ZXC", "YJC"]),
  betAmount: z.string(),
  payoutAmount: z.string(),
  netResult: z.string(),
  multiplier: z.string(),
  isWin: z.boolean(),
  status: GameSettlementStatusSchema,
  betTxHash: z.string().nullable().optional(),
  payoutTxHash: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  settledAt: z.date(),
});

export type GameSettlement = z.infer<typeof GameSettlementSchema>;
