import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { kv, OpsRepository } from "@repo/infrastructure";

export async function chatRoutes(fastify: FastifyInstance) {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
    const opsRepo = new OpsRepository();
    const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

    typedFastify.get("/messages", async (request) => {
        const messages = await kv.get("chat:global:messages") || [];
        return createApiEnvelope({ messages }, request.id);
    });

    typedFastify.post("/messages", {
        schema: {
            body: z.object({
                text: z.string().min(1).max(500),
                displayName: z.string().optional()
            })
        }
    }, async (request) => {
        const { text, displayName } = request.body;
        const newMessage = {
            id: crypto.randomUUID(),
            userId: mockUserId,
            displayName: displayName || "匿名玩家",
            text,
            createdAt: Date.now()
        };

        const messages: any[] = await kv.get("chat:global:messages") || [];
        messages.push(newMessage);
        if (messages.length > 50) messages.shift();

        await kv.set("chat:global:messages", messages);

        return createApiEnvelope({ message: newMessage }, request.id);
    });
}

export async function feedbackRoutes(fastify: FastifyInstance) {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
    const opsRepo = new OpsRepository();
    const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

    typedFastify.post("/", {
        schema: {
            body: z.object({
                category: z.string(),
                content: z.string().min(1),
                contact: z.string().optional()
            })
        }
    }, async (request) => {
        const { category, content, contact } = request.body;

        await opsRepo.logEvent({
            channel: "support",
            severity: "info",
            source: "feedback_api",
            kind: "user_feedback",
            userId: mockUserId,
            message: `Feedback [${category}]: ${content.slice(0, 50)}...`,
            meta: { category, content, contact }
        });

        return createApiEnvelope({ success: true, message: "感謝您的意見！" }, request.id);
    });
}
