import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { ADMIN_WALLET_ADDRESS } from "../lib/config.js";
import { DEFAULT_RESET_THRESHOLD, resetHighTotalBets } from "../lib/ops/reset-high-total-bets.js";

function normalizeSessionId(rawValue) {
    return String(rawValue || "").trim();
}

function getSafeBody(req) {
    if (!req || typeof req !== "object") return {};
    const rawBody = req.body;
    if (!rawBody) return {};

    if (typeof rawBody === "string") {
        try {
            const parsed = JSON.parse(rawBody);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    }

    return typeof rawBody === "object" ? rawBody : {};
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
        const body = getSafeBody(req);
        const action = String(body.action || "reset_total_bets").trim().toLowerCase();
        const sessionId = normalizeSessionId(body.sessionId);
        const dryRun = body.dryRun === true || String(body.dryRun || "").trim().toLowerCase() === "true";
        const configuredAdminAddress = normalizeAddress(process.env.OPS_ADMIN_ADDRESS || ADMIN_WALLET_ADDRESS);

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "Missing sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "Session expired" });
        }

        const sessionAddress = normalizeAddress(session.address);
        if (!configuredAdminAddress || sessionAddress !== configuredAdminAddress) {
            return res.status(403).json({ success: false, error: "Current session is not an admin wallet" });
        }

        if (action !== "reset_total_bets") {
            return res.status(400).json({
                success: false,
                error: `Unsupported action: ${action}`,
                supportedActions: ["reset_total_bets"]
            });
        }

        const result = await resetHighTotalBets({
            threshold: DEFAULT_RESET_THRESHOLD,
            dryRun
        });
        return res.status(200).json(result);
    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Admin API failed"
        });
    }
}
