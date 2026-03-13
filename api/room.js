import { getSession } from "../lib/session-store.js";
import { getRoomManager } from "../lib/room-manager.js";
import { resolveYjcVipStatus } from "../lib/yjc-vip.js";
import { getSafeBody } from "../lib/api-utils.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });

    try {
        const body = getSafeBody(req);
        const action = String(body.action || "snapshot").trim().toLowerCase();
        const sessionId = String(body.sessionId || "").trim();

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "Missing sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "Session expired" });
        }

        const address = session.address;
        const manager = await getRoomManager();

        if (action === "snapshot") {
            return res.status(200).json({
                success: true,
                ...manager.getSnapshot()
            });
        }

        if (action === "join") {
            const yjcVip = await resolveYjcVipStatus(address);
            const tier = yjcVip && yjcVip.tier ? yjcVip.tier.key : "none";

            let result;
            if (tier === "vip2") {
                result = await manager.joinVip2Player(address);
            } else if (tier === "vip1") {
                result = await manager.joinPlayer(address, { vip: "vip1", preferredRoomId: 1 });
            } else {
                return res.status(403).json({
                    success: false,
                    error: "未達 VIP 等級，無法進入房間",
                    tier
                });
            }

            if (result.ok) {
                return res.status(200).json({
                    success: true,
                    roomId: result.roomId,
                    reused: !!result.reused,
                    tier
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: result.error || "加入失敗"
                });
            }
        }

        if (action === "leave") {
            const result = await manager.leavePlayer(address);
            return res.status(200).json({
                success: result.ok,
                error: result.error
            });
        }

        return res.status(400).json({ success: false, error: "Unsupported action" });

    } catch (error) {
        console.error("Room API Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
