import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. 強制處理跨域與快取
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. 抓取 sessionId (從 Query 或 Body 找)
    const sessionId = req.query.sessionId || (req.body && req.body.sessionId);

    // Debug: 這裡的內容會出現在 Vercel 的 Logs 分頁
    console.log(`[AUTH] Method: ${req.method}, sessionId: ${sessionId}`);

    if (req.method === 'GET') {
        if (!sessionId) return res.status(200).json({ status: "pending", error: "No ID" });
        const data = await kv.get(`session:${sessionId}`);
        return res.status(200).json(data ? { status: "authorized", ...data } : { status: "pending" });
    }

    if (req.method === 'POST') {
        const { address, publicKey } = req.body;

        // Debug Log
        console.log("[AUTH POST] Received Data:", { address, publicKey, sessionId });

        if (!sessionId || !address || !publicKey) {
            return res.status(400).json({ error: "Missing required fields", received: req.body });
        }

        try {
            // 存入 KV
            await kv.set(`session:${sessionId}`, {
                address: address.toLowerCase(),
                publicKey
            }, { ex: 600 });

            console.log("[AUTH] Success! Session stored in KV.");
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error("[KV ERROR]", error);
            return res.status(500).json({ error: "KV Storage failed", details: error.message });
        }
    }
}