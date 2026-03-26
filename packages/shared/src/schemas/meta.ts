import { z } from "zod";

export const RewardGrantSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  rewardId: z.string(),
  type: z.enum(["title", "avatar", "item"]),
  source: z.string(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});

export type RewardGrant = z.infer<typeof RewardGrantSchema>;

export const MarketOrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  itemId: z.string(),
  quantity: z.number(),
  price: z.string(),
  total: z.string(),
  status: z.enum(["pending", "completed", "cancelled"]),
  createdAt: z.date(),
});

export type MarketOrder = z.infer<typeof MarketOrderSchema>;

export const SupportTicketSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  subject: z.string(),
  content: z.string(),
  status: z.enum(["open", "replied", "closed"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SupportTicket = z.infer<typeof SupportTicketSchema>;
