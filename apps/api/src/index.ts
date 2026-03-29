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
import { legacyRoutes } from "./routes/legacy/index.js";

const fastify = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

// Global Error Handler
fastify.setErrorHandler((error, request, reply) => {
  console.error(error);
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
    message: process.env.NODE_ENV === "production" ? "An unexpected error occurred" : error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  });
});

// Diagnostic Route
fastify.get("/api/diag", async () => {
    return {
        status: "ok",
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        db_url_present: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL)
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
