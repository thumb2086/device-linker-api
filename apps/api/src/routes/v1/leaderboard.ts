// apps/api/src/routes/v1/leaderboard.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { createApiEnvelope } from "@repo/shared";
import { LeaderboardManager } from "@repo/domain/leaderboard/leaderboard-manager.js";
import { OnchainWalletManager } from "@repo/domain";
import * as schema from "@repo/infrastructure/db/schema.js";
import { requireDb, WalletRepository } from "@repo/infrastructure/db/index.js";
import { ChainClient, kv } from "@repo/infrastructure";

const ASSET_LB_SYNC_KEY = "leaderboard:asset:last_onchain_sync_at";
const ASSET_LB_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export async function leaderboardRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const walletRepo = new WalletRepository();
  const onchainWallet = new OnchainWalletManager();

  // Helper to get context and address
  const getAddressFromRequest = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return undefined;
    
    const db = await requireDb();
    const session = await db.query.sessions.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.id, sessionId)
    });
    
    if (!session || session.status !== "authorized") return undefined;
    return session.address;
  };

  // GET /api/v1/leaderboard?type=all&limit=50&periodId=optional
  typedFastify.get("/", {
    schema: {
      querystring: z.object({
        type: z.enum(["all", "week", "month", "season", "asset", "winnings"]).default("all"),
        limit: z.coerce.number().min(1).max(100).default(50),
        periodId: z.string().optional(),
        sync: z.enum(["auto", "force", "off"]).default("auto"),
        sessionId: z.string().optional(),
      }),
    },
  }, async (request) => {
    const { type, limit, periodId, sync } = request.query as {
      type: "all" | "week" | "month" | "season" | "asset" | "winnings";
      limit: number;
      periodId?: string;
      sync: "auto" | "force" | "off";
    };
    
    const selfAddress = await getAddressFromRequest(request);

    try {
      const db = await requireDb();
      const manager = new LeaderboardManager(db);

      if (type === "asset") {
        const syncEnabled = String(process.env.ASSET_LEADERBOARD_SYNC_ONCHAIN_ON_READ ?? "true").toLowerCase() !== "false";
        if (syncEnabled && sync !== "off") {
          const now = Date.now();
          const lastSyncAt = Number(await kv.get<number>(ASSET_LB_SYNC_KEY) || 0);
          const syncEveryRead = String(process.env.ASSET_LEADERBOARD_SYNC_EVERY_READ ?? "true").toLowerCase() !== "false";
          const shouldSync = sync === "force"
            || syncEveryRead
            || (!syncEveryRead && (now - lastSyncAt >= ASSET_LB_SYNC_INTERVAL_MS));

          if (shouldSync) {
            try {
              const runtime = onchainWallet.getRuntimeConfig();
              const tokens = [
                { key: "zhixi" as const, config: runtime.tokens?.zhixi },
                { key: "yjc" as const, config: runtime.tokens?.yjc },
              ].filter((t) => t.config?.enabled && t.config?.contractAddress);

              if (runtime.rpcUrl && runtime.adminPrivateKey && tokens.length > 0) {
                const client = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
                const tokenMeta = await Promise.all(tokens.map(async (t) => ({
                  key: t.key,
                  contractAddress: t.config!.contractAddress,
                  decimals: await client.getDecimals(t.config!.contractAddress, 18),
                })));

                const userAddresses: Array<{ address: string }> = await db
                  .selectDistinct({ address: schema.users.address })
                  .from(schema.users);
                const sessionAddresses: Array<{ address: string | null }> = await db
                  .selectDistinct({ address: schema.sessions.address })
                  .from(schema.sessions)
                  .where(sql`${schema.sessions.address} IS NOT NULL`);
                const walletAddresses: Array<{ address: string }> = await db
                  .selectDistinct({ address: schema.walletAccounts.address })
                  .from(schema.walletAccounts);

                const addresses = Array.from(new Set([
                  ...userAddresses.map((r) => r.address),
                  ...sessionAddresses.map((r) => String(r.address || "").toLowerCase()).filter(Boolean),
                  ...walletAddresses.map((r) => r.address),
                ]));

                for (const addr of addresses) {
                  const normalizedAddr = addr.toLowerCase();
                  await Promise.all(tokenMeta.map(async (token) => {
                    try {
                      const raw = await client.getBalance(normalizedAddr, token.contractAddress);
                      const balance = client.formatUnits(raw, token.decimals);
                      await walletRepo.updateBalance(normalizedAddr, balance, token.key);
                    } catch {
                      // keep best effort sync; ignore per-user/per-token failures
                    }
                  }));
                }
                await kv.set(ASSET_LB_SYNC_KEY, now);
              }
            } catch (error) {
              request.log.warn({ error }, "asset leaderboard on-chain sync failed");
            }
          }
        }

        const includeMarketAssets = process.env.ASSET_LEADERBOARD_INCLUDE_MARKET === "true";
        const result = await manager.getAssetLeaderboard(selfAddress, limit, includeMarketAssets);
        return createApiEnvelope({ success: true, data: result }, request.id);
      }

      if (type === "winnings") {
        const includeMarketAssets = process.env.ASSET_LEADERBOARD_INCLUDE_MARKET === "true";
        const assetResult = await manager.getAssetLeaderboard(selfAddress, limit, includeMarketAssets);
        const result = {
          ...assetResult,
          type: "winnings" as const,
          periodId: "winnings",
          entries: assetResult.entries,
          selfRank: assetResult.selfRank,
        };
        return createApiEnvelope({ success: true, data: result }, request.id);
      }

      const result = await manager.getBetLeaderboard(
        type,
        selfAddress,
        limit,
        periodId
      );
      return createApiEnvelope({ success: true, data: result }, request.id);
    } catch (err: any) {
      console.error("[leaderboard] error:", err);
      return createApiEnvelope(
        { success: false, error: { code: "INTERNAL_ERROR", message: err.message } },
        request.id
      );
    }
  });
}
