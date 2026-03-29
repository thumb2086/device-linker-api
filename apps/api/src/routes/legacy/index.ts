import { FastifyInstance } from "fastify";
import { userLegacyRoutes } from "./user-legacy.js";
import { walletLegacyRoutes } from "./wallet-legacy.js";

export async function legacyRoutes(fastify: FastifyInstance) {
  fastify.register(userLegacyRoutes);
  fastify.register(walletLegacyRoutes);
}
