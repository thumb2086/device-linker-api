import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const sessionId = req.query.sessionId || (req.body && req.body.sessionId);
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    if (req.method === 'GET') {
        const data = await kv.get(`session:${sessionId}`);
        return res.status(200).json(data ? { status: "authorized", ...data } : { status: "pending" });
    }

    if (req.method === 'POST') {
        const { address, publicKey } = req.body;
        await kv.set(`session:${sessionId}`, { address, publicKey }, { ex: 600 });
        return res.status(200).json({ success: true });
    }
}