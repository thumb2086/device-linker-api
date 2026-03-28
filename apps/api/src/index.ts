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
import { legacyRoutes } from "./routes/legacy/index.js";

const fastify = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

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
    fastify.log.error(err);
    process.exit(1);
  }
};

if (!process.env.VERCEL) {
  start();
}
