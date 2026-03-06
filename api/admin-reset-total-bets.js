import { kv } from "@vercel/kv";
import { resetHighTotalBets, DEFAULT_RESET_THRESHOLD } from "../lib/ops/reset-high-total-bets.js";

function normalizeSessionId(rawValue) {
    return String(rawValue || "").trim();
}

function normalizeToken(rawValue) {
    return String(rawValue || "").trim();
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method Not Allowed" });
    }

    try {
        const body = req.body || {};
        const sessionId = normalizeSessionId(body.sessionId);
        const adminToken = normalizeToken(body.adminToken);
        const dryRun = String(body.dryRun || "") === "true" || body.dryRun === true;
        const configuredToken = normalizeToken(process.env.OPS_RESET_TOKEN);

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "缺少 sessionId" });
        }
        if (!configuredToken) {
            return res.status(500).json({ success: false, error: "未設定 OPS_RESET_TOKEN" });
        }
        if (!adminToken) {
            return res.status(400).json({ success: false, error: "缺少管理密鑰" });
        }
        if (adminToken !== configuredToken) {
            return res.status(403).json({ success: false, error: "管理密鑰錯誤" });
        }

        const session = await kv.get(`session:${sessionId}`);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const result = await resetHighTotalBets({
            threshold: DEFAULT_RESET_THRESHOLD,
            dryRun
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error("Admin Reset Total Bets Error:", error);
        return res.status(500).json({
            success: false,
            error: "重製累積押注失敗",
            details: error.message
        });
    }
}
