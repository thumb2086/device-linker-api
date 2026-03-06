import { getSession } from "../lib/session-store.js";
import { getDisplayName, setDisplayName } from "../lib/user-profile.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });

    try {
        const body = req.body || {};
        const sessionId = String(body.sessionId || "").trim();
        if (!sessionId) {
            return res.status(400).json({ success: false, error: "缺少 sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const address = String(session.address || "").trim().toLowerCase();
        const action = String(body.action || "get").trim().toLowerCase();

        if (action === "get") {
            const displayName = await getDisplayName(address);
            return res.status(200).json({ success: true, displayName });
        }

        if (action === "set") {
            const displayName = await setDisplayName(address, body.displayName);
            return res.status(200).json({ success: true, displayName });
        }

        return res.status(400).json({ success: false, error: "不支援的 action" });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || "設定名稱失敗" });
    }
}
