import { getRoundInfo } from "../lib/auto-round.js";

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const game = (req.query && typeof req.query.game === 'string') ? req.query.game : 'roulette';
        const nowTs = Date.now();
        const round = getRoundInfo(game, nowTs);

        return res.status(200).json({
            success: true,
            serverNowTs: nowTs,
            ...round
        });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
}
