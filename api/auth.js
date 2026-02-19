import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 強制禁用快取，解決 304 問題
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    if (req.method === 'GET') {
        // 從 KV 獲取狀態
        const data = await kv.get(`session:${sessionId}`);
        if (data) {
            return res.status(200).json({ status: "authorized", ...data });
        }
        return res.status(200).json({ status: "pending" });
    }

    if (req.method === 'POST') {
        const { address, publicKey } = req.body;
        // 存入 KV，設定有效期限 10 分鐘 (600秒)，逾期自動刪除節省空間
        await kv.set(`session:${sessionId}`, { address, publicKey }, { ex: 600 });
        return res.status(200).json({ success: true });
    }
}