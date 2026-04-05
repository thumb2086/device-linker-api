import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { authRoutes } from "./routes/v1/auth.js";
import { walletRoutes } from "./routes/v1/wallet.js";
import { gameRoutes } from "./routes/v1/games.js";
import { marketRoutes } from "./routes/v1/market.js";
import { rewardRoutes } from "./routes/v1/rewards.js";
import { adminRoutes } from "./routes/v1/admin.js";
import { meRoutes } from "./routes/v1/me.js";
import { statsRoutes } from "./routes/v1/stats.js";
import { supportRoutes } from "./routes/v1/support.js";
import { profileRoutes } from "./routes/v1/profile.js";
import { announcementRoutes } from "./routes/v1/announcements.js";
import { transactionRoutes } from "./routes/v1/transactions.js";
import { legacyRoutes } from "./routes/legacy/index.js";
// Phase 3: New routes
import { leaderboardRoutes } from "./routes/v1/leaderboard.js";
import { vipRoutes } from "./routes/v1/vip.js";
// Phase 3: 12 Game routes
import { slotsRoutes } from "./routes/v1/games/slots.js";
import { coinflipRoutes } from "./routes/v1/games/coinflip.js";
import { rouletteRoutes } from "./routes/v1/games/roulette.js";
import { horseRoutes } from "./routes/v1/games/horse.js";
import { sicboRoutes } from "./routes/v1/games/sicbo.js";
import { bingoRoutes } from "./routes/v1/games/bingo.js";
import { duelRoutes } from "./routes/v1/games/duel.js";
import { blackjackRoutes } from "./routes/v1/games/blackjack.js";
import { crashRoutes } from "./routes/v1/games/crash.js";
import { pokerRoutes } from "./routes/v1/games/poker.js";
import { bluffdiceRoutes } from "./routes/v1/games/bluffdice.js";
import { shootDragonGateRoutes } from "./routes/v1/games/shoot-dragon-gate.js";
import postgres from "postgres";

const fastify = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

// Global Error Handler
fastify.setErrorHandler((error, request, reply) => {
  console.error("Global Error Handler:", error);
  if (error.validation) {
    reply.status(400).send({
        success: false,
        error: "VALIDATION_ERROR",
        message: error.message,
    });
    return;
  }
  reply.status(500).send({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: error.message,
  });
});

// Enhanced Diagnostic Route
fastify.get("/api/diag", async () => {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    let dbStatus = "unknown";
    let tables: string[] = [];
    let dbHost: string | null = null;
    let dbName: string | null = null;
    let sessionsExists = false;

    const mask = (value: string | null) => {
        if (!value) return null;
        if (value.length <= 8) return value;
        return `${value.slice(0, 4)}...${value.slice(-4)}`;
    };

    if (connectionString) {
        try {
            const parsed = new URL(connectionString);
            dbHost = parsed.hostname || null;
            dbName = parsed.pathname?.replace(/^\/+/, "") || null;
        } catch (e) {
            dbStatus = "error: invalid_database_url";
        }
    }

    if (connectionString) {
        try {
            const sql = postgres(connectionString, { ssl: 'require', connect_timeout: 5 });
            const result = await sql`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`;
            tables = result.map(r => r.tablename);
            sessionsExists = tables.includes("sessions");
            dbStatus = "connected";
            await sql.end();
        } catch (e: any) {
            dbStatus = `error: ${e.message}`;
        }
    } else {
        dbStatus = "missing_env";
    }

    return {
        status: "ok",
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        db: {
            status: dbStatus,
            tables: tables,
            tables_count: tables.length,
            sessions_exists: sessionsExists,
            url_present: !!connectionString,
            host: mask(dbHost),
            database: dbName
        }
    };
});

fastify.get("/api/diag-thumb", async () => {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    let dbStatus = "unknown";
    let dbHost: string | null = null;
    let dbName: string | null = null;
    let custodyAccountsThumbCount = 0;
    let custodyUsersThumbCount = 0;

    const mask = (value: string | null) => {
        if (!value) return null;
        if (value.length <= 8) return value;
        return `${value.slice(0, 4)}...${value.slice(-4)}`;
    };

    if (connectionString) {
        try {
            const parsed = new URL(connectionString);
            dbHost = parsed.hostname || null;
            dbName = parsed.pathname?.replace(/^\/+/, "") || null;
        } catch (e) {
            dbStatus = "error: invalid_database_url";
        }
    }

    if (!connectionString) {
        dbStatus = "missing_env";
    } else {
        try {
            const sql = postgres(connectionString, { ssl: 'require', connect_timeout: 5 });
            const custodyAccountRows = await sql`
                SELECT COUNT(*)::int AS count
                FROM custody_accounts
                WHERE lower(username) = 'thumb'
            `;

            const legacyTable = await sql`
                SELECT to_regclass('public.custody_users') AS table_name
            `;

            if (legacyTable[0]?.table_name) {
                const custodyUserRows = await sql`
                    SELECT COUNT(*)::int AS count
                    FROM custody_users
                    WHERE lower(username) = 'thumb'
                `;
                custodyUsersThumbCount = custodyUserRows[0]?.count || 0;
            }

            custodyAccountsThumbCount = custodyAccountRows[0]?.count || 0;
            dbStatus = "connected";
            await sql.end();
        } catch (e: any) {
            dbStatus = `error: ${e.message}`;
        }
    }

    return {
        status: "ok",
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        db: {
            status: dbStatus,
            host: mask(dbHost),
            database: dbName,
            thumb_in_custody_accounts: custodyAccountsThumbCount,
            thumb_in_custody_users: custodyUsersThumbCount
        }
    };
});

// 註冊路由
fastify.register(legacyRoutes, { prefix: "/api" });
fastify.register(authRoutes, { prefix: "/api/v1/auth" });
fastify.register(walletRoutes, { prefix: "/api/v1/wallet" });
fastify.register(gameRoutes, { prefix: "/api/v1/games" });
fastify.register(marketRoutes, { prefix: "/api/v1/market" });
fastify.register(rewardRoutes, { prefix: "/api/v1/rewards" });
fastify.register(meRoutes, { prefix: "/api/v1/me" });
fastify.register(statsRoutes, { prefix: "/api/v1/stats" });
fastify.register(adminRoutes, { prefix: "/api/v1/admin" });
fastify.register(supportRoutes, { prefix: "/api/v1/support" });
fastify.register(profileRoutes, { prefix: "/api/v1/profile" });
fastify.register(announcementRoutes, { prefix: "/api/v1/announcements" });
fastify.register(transactionRoutes, { prefix: "/api/v1/transactions" });
// Phase 3: New routes
fastify.register(leaderboardRoutes, { prefix: "/api/v1/leaderboard" });
fastify.register(vipRoutes, { prefix: "/api/v1/vip" });
// Phase 3: 12 Game routes
fastify.register(slotsRoutes, { prefix: "/api/v1/games/slots" });
fastify.register(coinflipRoutes, { prefix: "/api/v1/games/coinflip" });
fastify.register(rouletteRoutes, { prefix: "/api/v1/games/roulette" });
fastify.register(horseRoutes, { prefix: "/api/v1/games/horse" });
fastify.register(sicboRoutes, { prefix: "/api/v1/games/sicbo" });
fastify.register(bingoRoutes, { prefix: "/api/v1/games/bingo" });
fastify.register(duelRoutes, { prefix: "/api/v1/games/duel" });
fastify.register(blackjackRoutes, { prefix: "/api/v1/games/blackjack" });
fastify.register(crashRoutes, { prefix: "/api/v1/games/crash" });
fastify.register(pokerRoutes, { prefix: "/api/v1/games/poker" });
fastify.register(bluffdiceRoutes, { prefix: "/api/v1/games/bluffdice" });
fastify.register(shootDragonGateRoutes, { prefix: "/api/v1/games/shoot-dragon-gate" });

fastify.get("/health", async () => {
  return { status: "ok", env: process.env.NODE_ENV };
});

// Vercel 部署使用的 Handler
export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

// 本機執行啟動
const port = Number(process.env.PORT) || 3000;
const start = async () => {
  try {
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 Server ready at http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

if (!process.env.VERCEL) {
  start();
}
