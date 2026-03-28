import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AuthManager, IdentityManager } from "@repo/domain";
import { kv, SessionRepository, UserRepository } from "@repo/infrastructure";

export async function userLegacyRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const authManager = new AuthManager(userRepo, sessionRepo, kv);

  typedFastify.all("/user.js", async (request, reply) => {
    const query = request.query as any;
    const body = (request.body as any) || {};
    const act = query.act || body.act;

    if (act === "get_me") {
        const sessionId = query.sessionId || body.sessionId;
        if (!sessionId) return { user: null };

        const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);
        if (!session || session.status !== "authorized") return { user: null };

        const user = await userRepo.getUserByAddress(session.address);
        const balance = await kv.get<string>(`balance:${session.address}`) || "0";
        const totalBet = await kv.get<string>(`total_bet:${session.address}`) || "0";

        return {
            user,
            address: session.address,
            mode: session.mode,
            username: session.accountId,
            balance,
            totalBet,
            success: true
        };
    }

    if (act === "custody_login") {
        const result = await authManager.loginCustody({
            username: body.username,
            password: body.password,
            platform: body.platform,
            clientType: body.clientType,
            deviceId: body.deviceId,
            appVersion: body.appVersion,
        });
        if (!result.success) return { error: result.error };
        return {
            sessionId: result.sessionId,
            address: result.user?.address,
            username: body.username,
            success: true
        };
    }

    if (act === "custody_register") {
        const result = await authManager.registerCustody({
            username: body.username,
            password: body.password,
            platform: body.platform,
            clientType: body.clientType,
            deviceId: body.deviceId,
            appVersion: body.appVersion,
            bonusAmount: "100000"
        });
        if (!result.success) return { error: result.error };
        return {
            sessionId: result.sessionId,
            address: result.user?.address,
            username: body.username,
            bonus: "100000",
            success: true
        };
    }

    return { error: "UNKNOWN_ACTION" };
  });

  typedFastify.post("/session.js", async (request) => {
    const body = (request.body as any) || {};
    const sessionId = `sess_${Math.random().toString(36).slice(2, 15)}`;
    const session = identityManager.createPendingSession(sessionId, {
        platform: body.platform,
        deviceId: body.deviceId
    });
    await kv.set(`session:${sessionId}`, session, { ex: 3600 });
    return {
        sessionId,
        deeplink: identityManager.buildLegacyDeepLink(sessionId),
        success: true
    };
  });
}
