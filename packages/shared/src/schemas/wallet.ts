import { z } from "zod";

export const TokenSymbolSchema = z.enum(["ZXC", "YJC"]);
export type TokenSymbol = z.infer<typeof TokenSymbolSchema>;

export const WalletAccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  token: TokenSymbolSchema,
  balance: z.string(), // Decimals represented as string
  lockedBalance: z.string().default("0"),
  updatedAt: z.date(),
});

export type WalletAccount = z.infer<typeof WalletAccountSchema>;

export const TxIntentStatusSchema = z.enum(["pending", "broadcasted", "confirmed", "failed", "reverted"]);
export type TxIntentStatus = z.infer<typeof TxIntentStatusSchema>;

export const TxIntentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  token: TokenSymbolSchema,
  type: z.enum(["bet", "payout", "deposit", "withdrawal", "transfer"]),
  amount: z.string(),
  status: TxIntentStatusSchema,
  requestId: z.string().optional(),
  roundId: z.string().optional(),
  game: z.string().optional(),
  txHash: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TxIntent = z.infer<typeof TxIntentSchema>;
