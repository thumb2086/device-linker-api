import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { AuthManager, IdentityManager } from "@repo/domain";
import {
    kv,
    SessionRepository,
    UserRepository,
    CustodyRepository,
    WalletRepository
} from "@repo/infrastructure";
import { randomUUID } from "crypto";

export async function userLegacyRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const custodyRepo = new CustodyRepository();
  const walletRepo = new WalletRepository();

  const authManager = new AuthManager(userRepo, sessionRepo, custodyRepo, walletRepo, kv);

  typedFastify.all("/user.js", async (request, reply) => {
    const query = request.query as any;
    const body = (request.body as any) || {};
    const act = body.action || query.action || body.act || query.act;

    try {
        if (act === "create_session") {
            const sessionId = `sess_${randomUUID().slice(0, 12)}`;
            const session = identityManager.createPendingSession(sessionId, body);

            // Core state is now exclusively in Postgres via SessionRepository
            await sessionRepo.saveSession(session);

            return {
                success: true,
                status: "pending",
                sessionId,
                deepLink: identityManager.buildDeepLink(sessionId),
                legacyDeepLink: `dlinker:login:${sessionId}`
            };
        }

        if (act === "get_status" || act === "get_me") {
            const sessionId = query.sessionId || body.sessionId;
            if (!sessionId) return { user: null };

            const session = await sessionRepo.getSessionById(sessionId);
            if (!session) return { status: "expired", success: true };

            if (session.status === "authorized") {
                const user = await userRepo.getUserByAddress(session.address);
                const balance = await walletRepo.getBalance(session.address);
                return {
                    success: true,
                    status: "authorized",
                    user,
                    address: session.address,
                    publicKey: session.publicKey,
                    mode: session.mode,
                    username: session.accountId,
                    balance
                };
            }
            return { success: true, status: session.status };
        }

        if (act === "authorize") {
            const { sessionId, address, publicKey } = body;
            const normalized = identityManager.tryNormalizeAddress(address);
            if (!normalized) return { success: false, error: "Invalid address" };

            const updated = identityManager.createAuthorizedSession(sessionId, normalized, publicKey || "0x", body);

            // Ensure user exists
            let user = await userRepo.getUserByAddress(normalized);
            if (!user) {
                user = { id: randomUUID(), address: normalized, createdAt: new Date(), updatedAt: new Date() };
                await userRepo.saveUser(user);
            }

            await sessionRepo.saveSession({ ...updated, userId: user.id, authorizedAt: new Date() });

            return { success: true, status: "authorized", sessionId, address: normalized };
        }

        if (act === "custody_login") {
            const result = await authManager.loginCustody(body);
            if (!result.success) {
                console.error("custody_login_failed", result.debug || result.error);
                return { success: false, error: result.error?.message, debug: result.debug };
            }
            return {
                success: true,
                status: "authorized",
                sessionId: result.sessionId,
                address: result.address || result.user?.address,
                publicKey: result.publicKey || "0x",
                username: body.username
            };
        }

        return { success: false, error: "UNKNOWN_ACTION", act };
    } catch (error: any) {
        console.error(error);
        reply.code(500);
        return { success: false, error: "INTERNAL_SERVER_ERROR", message: error.message };
    }
  });
}
