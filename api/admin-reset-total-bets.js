import { kv } from "@vercel/kv";
import { getSession } from "../lib/session-store.js";
import { ethers } from "ethers";
import { resetHighTotalBets, DEFAULT_RESET_THRESHOLD } from "../lib/ops/reset-high-total-bets.js";

const FALLBACK_ADMIN_ADDRESS = "0xDBBD3c856859268E27Df4874A464468f41Cb542a";

function normalizeSessionId(rawValue) {
    return String(rawValue || "").trim();
}

function normalizeAddress(rawValue) {
    try {
        return ethers.getAddress(String(rawValue || "").trim()).toLowerCase();
    } catch {
        return "";
    }
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
        const dryRun = String(body.dryRun || "") === "true" || body.dryRun === true;
        const configuredAdminAddress = normalizeAddress(process.env.OPS_ADMIN_ADDRESS || FALLBACK_ADMIN_ADDRESS);

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "缺少 sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const sessionAddress = normalizeAddress(session.address);
        const addressAuthorized = Boolean(configuredAdminAddress) && sessionAddress === configuredAdminAddress;

        if (!addressAuthorized) {
            return res.status(403).json({
                success: false,
                error: "目前登入地址不是管理錢包"
            });
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
