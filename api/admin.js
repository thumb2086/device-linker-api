// api/admin.js - 聚合管理員功能
import { kv } from '@vercel/kv';
import { getSession } from "../lib/session-store.js";
import { ADMIN_WALLET_ADDRESS } from "../lib/config.js";

const TOTAL_BET_PREFIX = "total_bet:";
const THRESHOLD = 2000000000; // 20 億

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action, sessionId, dryRun } = req.body;

    try {
        if (!sessionId) return res.status(400).json({ error: "缺少 sessionId" });
        const session = await getSession(sessionId);
        if (!session || !session.address) return res.status(403).json({ error: "會話過期" });

        // 嚴格管理員驗證
        const userAddress = session.address.toLowerCase();
        if (userAddress !== ADMIN_WALLET_ADDRESS.toLowerCase()) {
            return res.status(403).json({ error: "權限不足，僅限管理員錢包操作" });
        }

        // 1. 重製累積押注 (原 admin-reset-total-bets.js)
        if (action === 'reset_total_bets') {
            const keys = [];
            for await (const key of kv.scanIterator({ match: `${TOTAL_BET_PREFIX}*`, count: 1000 })) {
                keys.push(key);
            }

            const targets = [];
            for (const key of keys) {
                const val = parseFloat(await kv.get(key) || 0);
                if (val >= THRESHOLD) {
                    targets.push({ key, value: val });
                }
            }

            if (!dryRun) {
                for (const target of targets) {
                    await kv.set(target.key, 0);
                }
            }

            return res.status(200).json({
                success: true,
                affected: targets.length,
                targets: targets,
                dryRun: !!dryRun
            });
        }

        return res.status(400).json({ error: "無效的 action" });

    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
