import { randomBytes, scryptSync } from "crypto";
import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { ADMIN_WALLET_ADDRESS, YJC_CONTRACT_ADDRESS } from "../lib/config.js";
import { DEFAULT_RESET_THRESHOLD, collectHighTotalBetTargets } from "../lib/ops/reset-high-total-bets.js";
import { buildChainTxDashboard, logApiErrorEvent } from "../lib/tx-monitor.js";
import { settlementService } from "../lib/settlement-service.js";
import { yjcSettlementService } from "../lib/yjc-settlement.js";
import { buildVipStatus } from "../lib/level.js";
import { getDisplayName } from "../lib/user-profile.js";
import { resolveYjcVipStatus } from "../lib/yjc-vip.js";
import {
    createAnnouncement,
    deleteAnnouncement,
    getAnnouncement,
    getIssueReport,
    listAnnouncements,
    listIssueReports,
    normalizeIssueStatus,
    saveAnnouncement,
    saveIssueReport,
    sanitizeAnnouncementInput,
    toBoolean,
    validateAnnouncementInput
} from "../lib/support-center.js";

const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const CUSTODY_PASSWORD_MIN = 6;
const CUSTODY_PASSWORD_MAX = 128;
const MAX_CUSTODY_LIST_LIMIT = 500;
const MAX_OPS_TARGET_LIMIT = 500;

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

function normalizeAddress(rawValue, fieldName = "address") {
    try {
        return ethers.getAddress(String(rawValue || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${fieldName} format is invalid`);
    }
}

function tryNormalizeAddress(rawAddress) {
    if (!rawAddress) return "";
    try {
        return ethers.getAddress(String(rawAddress).trim()).toLowerCase();
    } catch {
        return "";
    }
}

function normalizeText(rawValue, maxLength = 64) {
    if (typeof rawValue !== "string") return "";
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) return "";
    return normalized.slice(0, maxLength);
}

function normalizeUsername(rawValue) {
    return normalizeText(rawValue, 32);
}

function hasOuterWhitespace(value) {
    return typeof value === "string" && value.trim() !== value;
}

function normalizeListLimit(rawValue) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return 200;
    return Math.min(MAX_CUSTODY_LIST_LIMIT, Math.floor(parsed));
}

function normalizeOpsLimit(rawValue) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return 200;
    return Math.min(MAX_OPS_TARGET_LIMIT, Math.floor(parsed));
}

function normalizeNumberInput(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;
    const normalized = String(rawValue).replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDecimalInput(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;
    const normalized = String(rawValue).replace(/,/g, "").trim();
    return normalized ? normalized : null;
}

function custodyUserKey(username) {
    return `custody_user:${username}`;
}

function hashPassword(password, saltHex) {
    return scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
}

function toTimestamp(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function sanitizeAdminUpdate(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, 4000);
}

function normalizeMaintenancePayload(body) {
    const enabled = toBoolean(body.enabled);
    const title = sanitizeAdminUpdate(body.title || "");
    const message = sanitizeAdminUpdate(body.message || "");
    return { enabled, title, message };
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadUserMetrics(address) {
    const contract = settlementService.contract;
    const [balanceRaw, decimals, totalBetRaw, displayName, yjcVip] = await Promise.all([
        contract.balanceOf(address),
        settlementService.getDecimals(),
        kv.get(`total_bet:${String(address).toLowerCase()}`),
        getDisplayName(address),
        resolveYjcVipStatus(address)
    ]);
    const totalBet = Number(totalBetRaw || 0);
    return {
        address,
        balance: ethers.formatUnits(balanceRaw, decimals),
        totalBet,
        vipStatus: buildVipStatus(totalBet),
        displayName: displayName || "",
        yjcVip: yjcVip || null
    };
}

async function listCustodyUsers(limit) {
    const keys = [];
    const scanStartedAt = Date.now();
    for await (const key of kv.scanIterator({ match: "custody_user:*", count: 1000 })) {
        keys.push(key);
        if (keys.length >= 1000 || (Date.now() - scanStartedAt) > 2000) break;
    }

    const users = [];
    const chunkSize = 100;

    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunkKeys = keys.slice(index, index + chunkSize);
        const chunkValues = await Promise.all(chunkKeys.map((key) => kv.get(key)));

        chunkKeys.forEach((key, chunkIndex) => {
            const record = chunkValues[chunkIndex];
            if (!record || typeof record !== "object") return;
            const username = key.slice("custody_user:".length);
            users.push({
                username,
                address: record.address || null,
                createdAt: record.createdAt || null,
                updatedAt: record.updatedAt || null,
                hasSaltHex: !!record.saltHex,
                hasPasswordHash: !!record.passwordHash,
                hasPublicKey: !!record.publicKey
            });
        });
    }

    users.sort((left, right) => {
        const rightTs = toTimestamp(right.updatedAt || right.createdAt);
        const leftTs = toTimestamp(left.updatedAt || left.createdAt);
        if (rightTs !== leftTs) return rightTs - leftTs;
        return String(left.username).localeCompare(String(right.username));
    });

    return {
        total: users.length,
        users: users.slice(0, limit)
    };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method Not Allowed" });
    }

    const requestId = String(req.headers["x-request-id"] || "").trim();
    let action = "";

    try {
        const body = getSafeBody(req);
        action = String(body.action || "reset_total_bets").trim().toLowerCase();
        const sessionId = normalizeSessionId(body.sessionId);
        const dryRun = body.dryRun === true || String(body.dryRun || "").trim().toLowerCase() === "true";
        const configuredAdminAddress = normalizeAddress(process.env.OPS_ADMIN_ADDRESS || ADMIN_WALLET_ADDRESS, "Admin wallet address");

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "Missing sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "Session expired" });
        }

        const sessionAddress = normalizeAddress(session.address, "Session address");
        if (!configuredAdminAddress || sessionAddress !== configuredAdminAddress) {
            return res.status(403).json({ success: false, error: "Current session is not an admin wallet" });
        }

        if (action === "list_custody_users") {
            const limit = normalizeListLimit(body.limit);
            const result = await listCustodyUsers(limit);
            return res.status(200).json({
                success: true,
                users: result.users,
                total: result.total,
                returned: result.users.length,
                limit
            });
        }

        if (action === "set_vip") {
            const targetAddress = tryNormalizeAddress(body.address);
            if (!targetAddress) return res.status(400).json({ success: false, error: "Invalid address" });
            const level = parseInt(body.level || "0");
            if (isNaN(level) || level < 0 || level > 3) {
                return res.status(400).json({ success: false, error: "VIP level must be between 0 and 3" });
            }
            await kv.set(`vip:${targetAddress}`, level);
            return res.status(200).json({ success: true, address: targetAddress, level });
        }

        if (action === "add_to_blacklist") {
            const targetAddress = tryNormalizeAddress(body.address);
            if (!targetAddress) {
                return res.status(400).json({ success: false, error: "Invalid address" });
            }
            const reason = normalizeText(body.reason, 200) || "No reason provided";
            await kv.set(`blacklist:${targetAddress}`, {
                address: targetAddress,
                reason,
                operator: sessionAddress,
                createdAt: new Date().toISOString()
            });
            return res.status(200).json({ success: true, message: `Address ${targetAddress} added to blacklist` });
        }

        if (action === "remove_from_blacklist") {
            const targetAddress = tryNormalizeAddress(body.address);
            if (!targetAddress) {
                return res.status(400).json({ success: false, error: "Invalid address" });
            }
            await kv.del(`blacklist:${targetAddress}`);
            return res.status(200).json({ success: true, message: `Address ${targetAddress} removed from blacklist` });
        }

        if (action === "list_blacklist") {
            const blacklist = [];
            const scanStartedAt = Date.now();
            for await (const key of kv.scanIterator({ match: "blacklist:*", count: 1000 })) {
                const record = await kv.get(key);
                if (record) blacklist.push(record);
                if (blacklist.length >= 1000 || (Date.now() - scanStartedAt) > 2000) break;
            }
            blacklist.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.status(200).json({ success: true, blacklist });
        }

        if (action === "get_maintenance") {
            const record = await kv.get("maintenance:status");
            const enabled = !!(record && record.enabled);
            return res.status(200).json({
                success: true,
                enabled,
                title: record && record.title ? record.title : "",
                message: record && record.message ? record.message : "",
                updatedAt: record && record.updatedAt ? record.updatedAt : "",
                operator: record && record.operator ? record.operator : ""
            });
        }

        if (action === "set_maintenance") {
            const payload = normalizeMaintenancePayload(body);
            const record = {
                enabled: payload.enabled,
                title: payload.title,
                message: payload.message,
                updatedAt: new Date().toISOString(),
                operator: sessionAddress
            };
            await kv.set("maintenance:status", record);
            return res.status(200).json({ success: true, ...record });
        }

        if (action === "set_user_win_bias") {
            const targetAddress = tryNormalizeAddress(body.address);
            if (!targetAddress) return res.status(400).json({ success: false, error: "Invalid address" });
            if (body.bias === null || body.bias === undefined || body.bias === "") {
                await kv.del(`user_win_bias:${targetAddress}`);
                return res.status(200).json({ success: true, address: targetAddress, bias: null });
            }
            const bias = Number(body.bias);
            if (isNaN(bias) || bias < 0 || bias > 1) {
                return res.status(400).json({ success: false, error: "Bias must be between 0 and 1" });
            }
            await kv.set(`user_win_bias:${targetAddress}`, bias);
            return res.status(200).json({ success: true, address: targetAddress, bias });
        }

        if (action === "get_user_win_bias") {
            const targetAddress = tryNormalizeAddress(body.address);
            if (!targetAddress) return res.status(400).json({ success: false, error: "Invalid address" });
            const bias = await kv.get(`user_win_bias:${targetAddress}`);
            return res.status(200).json({ success: true, address: targetAddress, bias: bias ?? null });
        }

        if (action === "get_status" || action === "status") {
            const targetAddress = tryNormalizeAddress(body.address);
            if (!targetAddress) return res.status(400).json({ success: false, error: "Invalid address" });
            const metrics = await loadUserMetrics(targetAddress);
            return res.status(200).json({ success: true, metrics });
        }

        if (action === "inspect_custody_user") {
            const username = normalizeUsername(body.username);
            if (!CUSTODY_USERNAME_REGEX.test(username)) {
                return res.status(400).json({ success: false, error: "Invalid username format" });
            }

            const record = await kv.get(custodyUserKey(username));
            return res.status(200).json({
                success: true,
                username,
                exists: !!record,
                address: record?.address || null,
                createdAt: record?.createdAt || null,
                updatedAt: record?.updatedAt || null,
                hasSaltHex: !!record?.saltHex,
                hasPasswordHash: !!record?.passwordHash,
                hasPublicKey: !!record?.publicKey
            });
        }

        if (action === "reset_custody_password") {
            const username = normalizeUsername(body.username);
            const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

            if (!CUSTODY_USERNAME_REGEX.test(username)) {
                return res.status(400).json({ success: false, error: "Invalid username format" });
            }
            if (newPassword.length < CUSTODY_PASSWORD_MIN || newPassword.length > CUSTODY_PASSWORD_MAX) {
                return res.status(400).json({ success: false, error: "Password length must be 6-128" });
            }
            if (hasOuterWhitespace(newPassword)) {
                return res.status(400).json({ success: false, error: "Password cannot start or end with spaces" });
            }

            const key = custodyUserKey(username);
            const record = await kv.get(key);
            if (!record || typeof record !== "object" || !record.address) {
                return res.status(404).json({ success: false, error: "Custody user not found" });
            }

            const saltHex = randomBytes(16).toString("hex");
            await kv.set(key, {
                ...record,
                username,
                saltHex,
                passwordHash: hashPassword(newPassword, saltHex),
                updatedAt: new Date().toISOString()
            });

            return res.status(200).json({
                success: true,
                username,
                address: record.address,
                message: "Custody password reset"
            });
        }

        if (action === "list_issue_reports") {
            const result = await listIssueReports({
                limit: body.limit,
                status: body.status,
                keyword: body.keyword
            });
            return res.status(200).json({
                success: true,
                reports: result.reports,
                total: result.total,
                returned: result.reports.length
            });
        }

        if (action === "update_issue_report") {
            const reportId = String(body.reportId || "").trim();
            const report = await getIssueReport(reportId);
            if (!report) {
                return res.status(404).json({ success: false, error: "Issue report not found" });
            }

            const nextStatus = normalizeIssueStatus(body.status, report.status);
            const adminUpdate = sanitizeAdminUpdate(body.adminUpdate);
            const updated = await saveIssueReport({
                ...report,
                status: nextStatus,
                adminUpdate,
                updatedAt: new Date().toISOString()
            });

            return res.status(200).json({
                success: true,
                report: updated
            });
        }

        if (action === "list_announcements") {
            const result = await listAnnouncements({
                limit: body.limit,
                activeOnly: body.activeOnly === true || String(body.activeOnly || "").trim().toLowerCase() === "true"
            });
            return res.status(200).json({
                success: true,
                announcements: result.announcements,
                total: result.total,
                returned: result.announcements.length
            });
        }

        if (action === "publish_announcement") {
            const input = sanitizeAnnouncementInput(body);
            const validationError = validateAnnouncementInput(input);
            if (validationError) {
                return res.status(400).json({ success: false, error: validationError });
            }

            const created = await createAnnouncement({
                ...input,
                publishedBy: sessionAddress,
                updatedBy: sessionAddress
            });

            return res.status(200).json({ success: true, announcement: created });
        }

        if (action === "update_announcement") {
            const announcementId = String(body.announcementId || "").trim();
            const announcement = await getAnnouncement(announcementId);
            if (!announcement) {
                return res.status(404).json({ success: false, error: "Announcement not found" });
            }

            const input = sanitizeAnnouncementInput({
                title: body.title !== undefined ? body.title : announcement.title,
                content: body.content !== undefined ? body.content : announcement.content,
                pinned: body.pinned !== undefined ? body.pinned : announcement.pinned,
                isActive: body.isActive !== undefined ? body.isActive : announcement.isActive
            });
            const validationError = validateAnnouncementInput(input);
            if (validationError) {
                return res.status(400).json({ success: false, error: validationError });
            }

            const updated = await saveAnnouncement({
                ...announcement,
                ...input,
                updatedAt: new Date().toISOString(),
                updatedBy: sessionAddress
            });

            return res.status(200).json({ success: true, announcement: updated });
        }

        if (action === "delete_announcement") {
            const announcementId = String(body.announcementId || "").trim();
            const announcement = await getAnnouncement(announcementId);
            if (!announcement) {
                return res.status(404).json({ success: false, error: "Announcement not found" });
            }

            await deleteAnnouncement(announcementId);
            return res.status(200).json({ success: true, announcementId });
        }

        if (action === "get_tx_health_dashboard") {
            const timeoutMs = Math.max(500, Math.min(8000, Number(body.timeoutMs || 4000)));
            const dashboard = await Promise.race([
                buildChainTxDashboard({
                    hours: body.hours,
                    limit: body.limit,
                    maxEvents: body.maxEvents,
                    maxScanMs: body.maxScanMs
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("交易看板載入逾時")), timeoutMs))
            ]);
            return res.status(200).json({ success: true, dashboard });
        }

        if (action === "reset_total_bets") {
            const minTotalBetInput = normalizeNumberInput(body.minTotalBet);
            const threshold = Number.isFinite(minTotalBetInput) ? minTotalBetInput : DEFAULT_RESET_THRESHOLD;
            const addressKeyword = normalizeText(body.addressKeyword, 64);
            const limit = normalizeOpsLimit(body.limit || body.maxTargets);
            const resetTotalBet = body.resetTotalBet === undefined ? true : toBoolean(body.resetTotalBet);
            const resetBalance = toBoolean(body.resetBalance);
            const minBalanceText = normalizeDecimalInput(body.minBalance);
            const maxBalanceText = normalizeDecimalInput(body.maxBalance);

            const needsBalance = Boolean(resetBalance || minBalanceText || maxBalanceText);
            let minBalanceWei = null;
            let maxBalanceWei = null;
            let decimals = null;

            if (needsBalance) {
                decimals = await settlementService.getDecimals();
                try {
                    if (minBalanceText) minBalanceWei = ethers.parseUnits(minBalanceText, decimals);
                    if (maxBalanceText) maxBalanceWei = ethers.parseUnits(maxBalanceText, decimals);
                } catch (error) {
                    return res.status(400).json({ success: false, error: "Invalid balance filter" });
                }
                if (minBalanceWei !== null && maxBalanceWei !== null && minBalanceWei > maxBalanceWei) {
                    return res.status(400).json({ success: false, error: "Min balance cannot exceed max balance" });
                }
            }

            if (!resetTotalBet && !resetBalance) {
                return res.status(400).json({ success: false, error: "No reset action selected" });
            }

            const rawTargets = await collectHighTotalBetTargets({
                threshold,
                addressKeyword,
                limit
            });

            const filteredTargets = [];
            for (const target of rawTargets) {
                let balanceWei = null;
                if (needsBalance) {
                    balanceWei = await settlementService.contract.balanceOf(target.address);
                    if (minBalanceWei !== null && balanceWei < minBalanceWei) continue;
                    if (maxBalanceWei !== null && balanceWei > maxBalanceWei) continue;
                }
                filteredTargets.push({ ...target, balanceWei });
            }

            if (!dryRun) {
                if (resetTotalBet) {
                    for (const target of filteredTargets) {
                        await kv.set(target.key, "0");
                    }
                }
                if (resetBalance) {
                    const BATCH_SIZE = 10;
                    const BATCH_DELAY_MS = 500;
                    const targetsToReset = filteredTargets.filter(t => t.balanceWei && t.balanceWei > 0n);

                    for (let i = 0; i < targetsToReset.length; i += BATCH_SIZE) {
                        const batch = targetsToReset.slice(i, i + BATCH_SIZE);
                        const promises = batch.map(target =>
                            settlementService.settle({
                                userAddress: target.address,
                                betWei: target.balanceWei,
                                payoutWei: 0n,
                                source: "ops_reset_balance",
                                meta: { operator: sessionAddress }
                            }).catch(e => ({ address: target.address, error: e.message }))
                        );
                        
                        await Promise.all(promises);

                        if (i + BATCH_SIZE < targetsToReset.length) {
                            await sleep(BATCH_DELAY_MS);
                        }
                    }
                }
            }

            return res.status(200).json({
                success: true,
                dryRun,
                threshold,
                filters: {
                    minTotalBet: threshold,
                    addressKeyword: addressKeyword || null,
                    minBalance: minBalanceText,
                    maxBalance: maxBalanceText,
                    limit
                },
                actions: {
                    resetTotalBet,
                    resetBalance
                },
                affected: filteredTargets.length,
                targets: filteredTargets.map((target) => ({
                    address: target.address,
                    totalBet: target.value,
                    balance: needsBalance && target.balanceWei !== null
                        ? ethers.formatUnits(target.balanceWei, decimals)
                        : null
                }))
            });
        }

        if (action === "admin_mint_yjc") {
            if (!YJC_CONTRACT_ADDRESS) {
                return res.status(400).json({ success: false, error: "YJC_CONTRACT_ADDRESS is not configured" });
            }
            const targetAddress = tryNormalizeAddress(body.address || body.targetAddress);
            if (!targetAddress) return res.status(400).json({ success: false, error: "Invalid target address" });
            const amountInput = normalizeNumberInput(body.amount);
            if (!Number.isFinite(amountInput) || amountInput <= 0) {
                return res.status(400).json({ success: false, error: "amount must be greater than 0" });
            }
            const amount = Math.floor(amountInput);
            if (amount <= 0) return res.status(400).json({ success: false, error: "amount must be a positive integer" });
            if (dryRun) {
                return res.status(200).json({ success: true, dryRun: true, address: targetAddress, amount });
            }
            const tx = await yjcSettlementService.mintTo(targetAddress, amount, {
                source: "admin_mint_yjc",
                meta: { operator: sessionAddress, reason: sanitizeAdminUpdate(body.reason || "") }
            });
            return res.status(200).json({
                success: true,
                action: "admin_mint_yjc",
                address: targetAddress,
                amount,
                txHash: tx.hash,
                operator: sessionAddress
            });
        }

        if (action === "admin_burn_yjc") {
            if (!YJC_CONTRACT_ADDRESS) {
                return res.status(400).json({ success: false, error: "YJC_CONTRACT_ADDRESS is not configured" });
            }
            const targetAddress = tryNormalizeAddress(body.address || body.targetAddress);
            if (!targetAddress) return res.status(400).json({ success: false, error: "Invalid target address" });
            const amountInput = normalizeNumberInput(body.amount);
            if (!Number.isFinite(amountInput) || amountInput <= 0) {
                return res.status(400).json({ success: false, error: "amount must be greater than 0" });
            }
            const amount = Math.floor(amountInput);
            if (amount <= 0) return res.status(400).json({ success: false, error: "amount must be a positive integer" });
            if (dryRun) {
                return res.status(200).json({ success: true, dryRun: true, address: targetAddress, amount });
            }
            const tx = await yjcSettlementService.burnFrom(targetAddress, amount, {
                source: "admin_burn_yjc",
                meta: { operator: sessionAddress, reason: sanitizeAdminUpdate(body.reason || "") }
            });
            return res.status(200).json({
                success: true,
                action: "admin_burn_yjc",
                address: targetAddress,
                amount,
                txHash: tx.hash,
                operator: sessionAddress
            });
        }

        if (action === "get_yjc_ops_status") {
            if (!YJC_CONTRACT_ADDRESS) {
                return res.status(200).json({
                    success: true,
                    available: false,
                    contractAddress: "",
                    reason: "YJC_CONTRACT_ADDRESS is not configured"
                });
            }
            const targetAddress = tryNormalizeAddress(body.address);
            try {
                const [adminStatus, targetStatus, totalSupply] = await Promise.all([
                    resolveYjcVipStatus(sessionAddress),
                    targetAddress ? resolveYjcVipStatus(targetAddress) : Promise.resolve(null),
                    yjcSettlementService.getTotalSupplyFormatted().catch(() => null)
                ]);
                return res.status(200).json({
                    success: true,
                    available: true,
                    contractAddress: YJC_CONTRACT_ADDRESS,
                    totalSupply,
                    admin: { address: sessionAddress, ...(adminStatus || {}) },
                    target: targetAddress ? { address: targetAddress, ...(targetStatus || {}) } : null
                });
            } catch (error) {
                return res.status(200).json({
                    success: true,
                    available: false,
                    contractAddress: YJC_CONTRACT_ADDRESS,
                    reason: error.message || "resolve_yjc_ops_status_failed"
                });
            }
        }

        return res.status(400).json({
            success: false,
            error: `Unsupported action: ${action}`,
            supportedActions: [
                "reset_total_bets",
                "list_custody_users",
                "inspect_custody_user",
                "reset_custody_password",
                "list_issue_reports",
                "update_issue_report",
                "list_announcements",
                "publish_announcement",
                "update_announcement",
                "delete_announcement",
                "get_tx_health_dashboard",
                "add_to_blacklist",
                "remove_from_blacklist",
                "list_blacklist",
                "set_user_win_bias",
                "get_user_win_bias",
                "get_maintenance",
                "set_maintenance",
                "get_status",
                "admin_mint_yjc",
                "admin_burn_yjc",
                "get_yjc_ops_status"
            ]
        });
    } catch (error) {
        console.error("Admin API Error:", error);
        await logApiErrorEvent({
            kind: "admin_api_error",
            method: req.method || "POST",
            source: `admin:${action || "unknown"}`,
            route: "/api/admin",
            requestId,
            error: error.message || "Admin API failed",
            meta: { action: action || "unknown" }
        }).catch(() => {});
        return res.status(500).json({
            success: false,
            error: error.message || "Admin API failed"
        });
    }
}
