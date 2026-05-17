// apps/api/src/routes/v1/leaderboard.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { createApiEnvelope, ITEM_DROP_TABLES } from "@repo/shared";
import { LeaderboardManager } from "@repo/domain/leaderboard/leaderboard-manager.js";
import { OnchainWalletManager } from "@repo/domain";
import * as schema from "@repo/infrastructure/db/schema.js";
import { requireDb, WalletRepository } from "@repo/infrastructure/db/index.js";
import { ChainClient, kv, RewardCatalogRepository } from "@repo/infrastructure";
import { TITLES } from "@repo/domain";

const ASSET_LB_SYNC_KEY = "leaderboard:asset:last_onchain_sync_at";
const ASSET_LB_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export async function leaderboardRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const walletRepo = new WalletRepository();
  const onchainWallet = new OnchainWalletManager();
  const rewardCatalogRepo = new RewardCatalogRepository();

  // Attach each leaderboard entry's equipped avatar + title (emoji + label)
  const enrichEntriesWithCosmetics = async (entries: Array<any>) => {
    if (!entries?.length) return;
    const customItems = await rewardCatalogRepo.listItems({}).catch(() => [] as any[]);
    const avatarMap = new Map<string, { id: string; icon?: string; label?: string }>();
    const titleMap = new Map<string, { id: string; label?: string }>();
    for (const t of TITLES) titleMap.set(t.id, { id: t.id, label: t.label });
    for (const row of customItems as any[]) {
      if (row.type === "avatar") avatarMap.set(row.itemId, { id: row.itemId, icon: row.icon, label: row.name });
      if (row.type === "title") titleMap.set(row.itemId, { id: row.itemId, label: row.name });
    }
    for (const rarity of Object.keys(ITEM_DROP_TABLES) as (keyof typeof ITEM_DROP_TABLES)[]) {
      for (const item of ITEM_DROP_TABLES[rarity]) {
        if (item.type === "avatar" && !avatarMap.has(item.id)) {
          avatarMap.set(item.id, { id: item.id, icon: item.icon, label: item.name });
        }
        if (item.type === "title" && !titleMap.has(item.id)) {
          titleMap.set(item.id, { id: item.id, label: item.name });
        }
      }
    }

    await Promise.all(entries.map(async (entry) => {
      const addr = String(entry?.address || "").toLowerCase();
      if (!addr) return;
      let [avId, tiId] = await Promise.all([
        kv.get<string>(`active_avatar:${addr}`).catch(() => null),
        kv.get<string>(`active_title:${addr}`).catch(() => null),
      ]);
      // Fallback: read from DB if KV misses
      if (!avId || !tiId) {
        try {
          const db2 = await requireDb();
          const profile = await db2.query.userProfiles.findFirst({
            where: (p: any, { eq }: any) => eq(p.address, addr),
          });
          if (profile) {
            if (!avId) avId = profile.selectedAvatarId || "classic_chip";
            if (!tiId) tiId = profile.selectedTitleId || "newbie";
          }
        } catch {}
      }
      const av = avatarMap.get(avId || "classic_chip") || avatarMap.get("classic_chip");
      const ti = titleMap.get(tiId || "newbie") || titleMap.get("newbie");
      entry.activeAvatarId = av?.id ?? null;
      entry.activeAvatarIcon = av?.icon ?? null;
      entry.activeTitleId = ti?.id ?? null;
      entry.activeTitleLabel = ti?.label ?? null;
    }));
  };

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
        type: z.enum(["all", "week", "month", "season", "asset", "kings"]).default("all"),
        limit: z.coerce.number().min(1).max(100).default(50),
        periodId: z.string().optional(),
        sync: z.enum(["auto", "force", "off"]).default("auto"),
        sessionId: z.string().optional(),
      }),
    },
  }, async (request) => {
    const { type, limit, periodId, sync } = request.query as {
      type: "all" | "week" | "month" | "season" | "asset" | "kings";
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
        await enrichEntriesWithCosmetics(result.entries);
        if (result.selfRank) await enrichEntriesWithCosmetics([result.selfRank]);
        return createApiEnvelope({ success: true, data: result }, request.id);
      }

      if (type === "kings") {
        const counts = await kv.get<Record<string, number>>("leaderboard:king:counts") || {};
        const names = await kv.get<Record<string, string>>("leaderboard:king:names") || {};
        const sorted = Object.entries(counts)
          .map(([address, count]) => ({ address, count, displayName: names[address] || null }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit)
          .map((entry, i) => ({
            rank: i + 1,
            address: entry.address,
            displayName: entry.displayName,
            amount: entry.count,
          }));
        const result = { type: "kings", periodId: "all", entries: sorted, selfRank: null, updatedAt: new Date().toISOString() };
        await enrichEntriesWithCosmetics(result.entries);
        return createApiEnvelope({ success: true, data: result }, request.id);
      }

      const result = await manager.getBetLeaderboard(type, selfAddress, limit, periodId);

      // Track king (#1 on all-time betting leaderboard)
      if (type === "all" && result.entries?.[0]) {
        const kingAddr = result.entries[0].address.toLowerCase();
        const kingName = result.entries[0].displayName;
        const counts = await kv.get<Record<string, number>>("leaderboard:king:counts") || {};
        const names = await kv.get<Record<string, string>>("leaderboard:king:names") || {};
        const prevCount = counts[kingAddr] || 0;
        if (prevCount === 0) {
          counts[kingAddr] = 1;
        } else {
          counts[kingAddr] = prevCount + 1;
        }
        names[kingAddr] = kingName || names[kingAddr] || "";
        await kv.set("leaderboard:king:counts", counts);
        await kv.set("leaderboard:king:names", names);
      }
      await enrichEntriesWithCosmetics(result.entries);
      if (result.selfRank) await enrichEntriesWithCosmetics([result.selfRank]);
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
