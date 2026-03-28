import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { kv, SessionRepository, UserRepository } from "@repo/infrastructure";

export async function walletLegacyRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const sessionRepo = new SessionRepository();

  typedFastify.all("/wallet.js", async (request) => {
    const query = request.query as any;
    const body = (request.body as any) || {};
    const act = query.act || body.act;

    const sessionId = query.sessionId || body.sessionId;
    if (!sessionId) return { success: false, error: "SESSION_REQUIRED" };

    const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);
    if (!session || session.status !== "authorized") return { success: false, error: "UNAUTHORIZED" };

    const address = session.address;

    if (act === "get_balance") {
        const balance = await kv.get<string>(`balance:${address}`) || "0";
        return { balance, success: true };
    }

    if (act === "get_history") {
        return {
            history: [],
            success: true
        };
    }

    if (act === "transfer") {
        const amount = body.amount;
        const target = body.to;
        if (!amount || !target) return { success: false, error: "INVALID_PARAMS" };

        const balanceStr = await kv.get<string>(`balance:${address}`) || "0";
        const balanceNum = Number(balanceStr);
        const amountNum = Number(amount);

        if (balanceNum < amountNum) return { success: false, error: "INSUFFICIENT_BALANCE" };

        const nextBalance = balanceNum - amountNum;
        await kv.set(`balance:${address}`, nextBalance.toString());

        const targetBalanceStr = await kv.get<string>(`balance:${target}`) || "0";
        const targetBalanceNum = Number(targetBalanceStr);
        await kv.set(`balance:${target}`, (targetBalanceNum + amountNum).toString());

        return {
            success: true,
            newBalance: nextBalance.toString()
        };
    }

    return { error: "UNKNOWN_ACTION", success: false };
  });
}
