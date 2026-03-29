import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  address: z.string().length(42),
  displayName: z.string().nullable(),
  isAdmin: z.boolean().default(false),
  isBlacklisted: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  token: z.string(),
  expiresAt: z.date(),
});

export type Session = z.infer<typeof SessionSchema>;
