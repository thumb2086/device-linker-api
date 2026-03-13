import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { settlementService } from "../lib/settlement-service.js";
import { yjcSettlementService } from "../lib/yjc-settlement.js";
import { resolveYjcVipStatus, convertZxcToYjc } from "../lib/yjc-vip.js";
import { getSafeBody } from "../lib/api-utils.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });

    try {
        const body = getSafeBody(req);
        const action = String(body.action || "status").trim().toLowerCase();
        const sessionId = String(body.sessionId || "").trim();

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "Missing sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "Session expired" });
        }

        const address = session.address;

        if (action === "status") {
            const yjcStatus = await resolveYjcVipStatus(address);
            return res.status(200).json({
                success: true,
                address,
                ...yjcStatus
            });
        }

        if (action === "exchange") {
            const zxcAmount = Math.max(0, Math.floor(Number(body.amount || 0)));
            if (zxcAmount <= 0) {
                return res.status(400).json({ success: false, error: "Exchange amount must be greater than 0" });
            }

            if (zxcAmount < 100000000) {
                return res.status(400).json({ success: false, error: "Minimum exchange amount is 100,000,000 ZXC" });
            }

            const yjcToMint = convertZxcToYjc(zxcAmount);
            if (yjcToMint <= 0) {
                return res.status(400).json({ success: false, error: "Insufficient ZXC for exchange" });
            }

            const zxcDecimals = await settlementService.getDecimals();
            const zxcWei = ethers.parseUnits(String(zxcAmount), zxcDecimals);

            // Check ZXC balance
            const zxcBalance = await settlementService.contract.balanceOf(address);
            if (zxcBalance < zxcWei) {
                return res.status(400).json({ success: false, error: "Insufficient ZXC balance" });
            }

            // Deduct ZXC
            const zxcResult = await settlementService.settle({
                userAddress: address,
                betWei: zxcWei,
                payoutWei: 0n,
                source: "yjc_exchange_deduct",
                meta: { zxcAmount, yjcToMint }
            });

            if (!zxcResult || !zxcResult.betTxHash) {
                throw new Error("Failed to deduct ZXC");
            }

            // Mint YJC
            try {
                const yjcResult = await yjcSettlementService.mintTo(address, yjcToMint, {
                    source: "yjc_exchange_mint",
                    meta: { zxcAmount, zxcTxHash: zxcResult.betTxHash }
                });

                return res.status(200).json({
                    success: true,
                    zxcTxHash: zxcResult.betTxHash,
                    yjcTxHash: yjcResult.hash,
                    yjcMinted: yjcToMint,
                    zxcDeducted: zxcAmount
                });
            } catch (yjcError) {
                console.error("YJC Mint failed after ZXC deduction:", yjcError);
                // In a production system, we'd need a way to rollback or retry.
                // For now, return error with the ZXC tx hash for tracking.
                return res.status(500).json({
                    success: false,
                    error: "ZXC deducted but YJC mint failed. Please contact admin.",
                    zxcTxHash: zxcResult.betTxHash,
                    details: yjcError.message
                });
            }
        }

        return res.status(400).json({ success: false, error: "Unsupported action" });

    } catch (error) {
        console.error("YJC API Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
