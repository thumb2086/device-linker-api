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

  typedFastify.all("/user.js", async (request) => {
    const query = request.query as any;
    const body = (request.body as any) || {};
    const act = body.action || query.action || body.act || query.act;

    if (act === "create_session") {
        const sessionId = `sess_${randomUUID().slice(0, 12)}`;
        const session = identityManager.createPendingSession(sessionId, body);
        await sessionRepo.saveSession(session);
        await kv.set(`session:${sessionId}`, session, { ex: 3600 });
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
        const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);
        if (!session) return { status: "expired", success: true };

        if (session.status === "authorized") {
            const user = await userRepo.getUserByAddress(session.address);
            const balance = await walletRepo.getBalance(session.address);
            return {
                success: true,
                status: "authorized",
                user,
                address: session.address,
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
        await kv.set(`session:${sessionId}`, { ...updated, userId: user.id }, { ex: 86400 });

        return { success: true, status: "authorized", sessionId, address: normalized };
    }

    if (act === "custody_login") {
        const result = await authManager.loginCustody(body);
        if (!result.success) return { success: false, error: result.error?.message };
        return {
            success: true,
            status: "authorized",
            sessionId: result.sessionId,
            address: result.user?.address,
            username: body.username
        };
    }

    return { success: false, error: "UNKNOWN_ACTION", act };
  });
}
