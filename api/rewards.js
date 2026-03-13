import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { ADMIN_WALLET_ADDRESS } from "../lib/config.js";
import { buildVipStatus, getVipTierOptions } from "../lib/vip.js";
import { settlementService } from "../lib/settlement-service.js";
import { convertZxcToYjc, resolveYjcVipStatus } from "../lib/yjc-vip.js";
import { yjcSettlementService } from "../lib/yjc-settlement.js";
import {
    buildRewardSummary,
    buildRewardSummaryFromProfile,
    claimRewardCampaign,
    createGrantLog,
    createRewardCampaign,
    equipAvatar,
    equipTitle,
    getRewardCampaign,
    getRewardCatalog,
    getRewardProfile,
    grantRewardBundle,
    listGrantLogs,
    listRewardCampaigns,
    openChest,
    purchaseRewardTitle,
    purchaseShopItem,
    saveRewardCampaign,
    activateInventoryItem,
    upsertRewardTitle,
    upsertRewardAvatar
} from "../lib/reward-center.js";

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

function trimText(value, maxLength = 240) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function normalizeSessionId(rawValue) {
    return String(rawValue || "").trim();
}

function normalizeAction(rawValue) {
    return String(rawValue || "summary").trim().toLowerCase();
}

function normalizeAddress(rawValue, fieldName = "address") {
    try {
        return ethers.getAddress(String(rawValue || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${fieldName} format is invalid`);
    }
}

function toBoolean(value) {
    return value === true || String(value || "").trim().toLowerCase() === "true";
}

async function requireSession(sessionId) {
    if (!sessionId) throw new Error("Missing sessionId");
    const session = await getSession(sessionId);
    if (!session || !session.address) throw new Error("Session expired");
    return session;
}

async function getUserContext(sessionId) {
    const session = await requireSession(sessionId);
    const address = normalizeAddress(session.address, "session address");
    const blacklisted = await kv.get(`blacklist:${address.toLowerCase()}`);
    if (blacklisted) throw new Error(`帳號已被禁止進入：${blacklisted.reason || "未註明原因"}`);
    const totalBet = Number(await kv.get(`total_bet:${address}`) || 0);
    const vipStatus = buildVipStatus(totalBet);
    return { session, address, totalBet, vipStatus };
}

function isAdminAddress(address) {
    return String(address || "").trim().toLowerCase() === String(process.env.OPS_ADMIN_ADDRESS || ADMIN_WALLET_ADDRESS).trim().toLowerCase();
}

async function requireAdmin(sessionId) {
    const context = await getUserContext(sessionId);
    if (!isAdminAddress(context.address)) throw new Error("Current session is not an admin wallet");
    return context;
}

function parseTokenRewards(body) {
    const tokenRewards = {};
    const primaryAmount = Number(body.tokenAmount || 0);
    const secondaryAmount = Number(body.tokenAmount2 || 0);
    if (Number.isFinite(primaryAmount) && primaryAmount > 0) tokenRewards.zxc = primaryAmount;
    if (Number.isFinite(secondaryAmount) && secondaryAmount > 0) tokenRewards.alt = secondaryAmount;
    return tokenRewards;
}

function parseRewardBundle(body) {
    const bundle = {};
    const itemId = trimText(body.itemId, 64);
    const itemQty = Number(body.itemQty || 1);
    const avatarId = trimText(body.avatarId, 64);
    const titleId = trimText(body.titleId, 64);
    const expiresAt = trimText(body.titleExpiresAt || body.expiresAt, 64);
    const tokenRewards = parseTokenRewards(body);
    if (itemId) bundle.items = [{ id: itemId, qty: Number.isFinite(itemQty) && itemQty > 0 ? Math.floor(itemQty) : 1 }];
    if (avatarId) bundle.avatars = [avatarId];
    if (titleId) bundle.titles = [{ id: titleId, expiresAt }];
    if (Number(tokenRewards.zxc || 0) > 0) bundle.tokens = tokenRewards.zxc;
    if (Object.keys(tokenRewards).length > 0) bundle.tokenRewards = tokenRewards;
    return bundle;
}

async function buildSummaryPayload(address, totalBet) {
    const [profile, campaigns, catalog, yjcVip] = await Promise.all([
        buildRewardSummary(address, totalBet),
        listRewardCampaigns({ activeOnly: true, address, hideClaimed: true }),
        getRewardCatalog(),
        resolveYjcVipStatus(address)
    ]);
    return { profile, catalog: { ...catalog, levelTiers: getVipTierOptions() }, campaigns: campaigns.campaigns, yjcVip };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });
    try {
        const body = getSafeBody(req);
        const action = normalizeAction(body.action);
        const sessionId = normalizeSessionId(body.sessionId);
        if (action === "summary" || action === "catalog") {
            if (sessionId === "public") {
                const catalog = await getRewardCatalog();
                const campaigns = await listRewardCampaigns({ activeOnly: true });
                return res.status(200).json({ success: true, catalog: { ...catalog, levelTiers: getVipTierOptions() }, campaigns: campaigns.campaigns });
            }
            const context = await getUserContext(sessionId);
            const summary = await buildSummaryPayload(context.address, context.totalBet);
            return res.status(200).json({ success: true, level: context.vipStatus.vipLevel, betLimit: context.vipStatus.maxBet, levelSystem: { key: "legacy_v1", label: "等級制度 v1" }, ...summary });
        }
        if (action === "buy") {
            const context = await getUserContext(sessionId);
            const itemId = trimText(body.shopItemId || body.itemId, 64);
            const catalog = await getRewardCatalog();
            const item = (catalog.shopItems || []).find((entry) => entry.id === itemId);
            if (!item) return res.status(404).json({ success: false, error: "Shop item not found" });
            const decimals = await settlementService.getDecimals();
            const priceWei = ethers.parseUnits(String(item.price), decimals);
            const balanceWei = await settlementService.contract.balanceOf(context.address);
            if (balanceWei < priceWei) return res.status(400).json({ success: false, error: "餘額不足，無法購買此商品" });
            const results = await settlementService.settle({ userAddress: context.address, betWei: priceWei, payoutWei: 0n, source: "rewards_shop_item", meta: { itemId: item.id } });
            await purchaseShopItem(context.address, item.id);
            const summary = await buildSummaryPayload(context.address, context.totalBet);
            return res.status(200).json({ success: true, txHash: results.betTxHash, purchased: item, ...summary });
        }
        if (action === "buy_title") {
            const context = await getUserContext(sessionId);
            const titleId = trimText(body.titleId, 64);
            const catalog = await getRewardCatalog();
            const title = (catalog.titles || []).find((entry) => entry.id === titleId);
            if (!title) return res.status(404).json({ success: false, error: "Title not found" });
            const effectivePrice = Number(title.effectiveShopPrice || 0);
            if (!title.shopEnabled || effectivePrice <= 0) return res.status(400).json({ success: false, error: "此稱號尚未上架販售" });
            const decimals = await settlementService.getDecimals();
            const priceWei = ethers.parseUnits(String(effectivePrice), decimals);
            const balanceWei = await settlementService.contract.balanceOf(context.address);
            if (balanceWei < priceWei) return res.status(400).json({ success: false, error: "餘額不足，無法購買此稱號" });
            const profile = await getRewardProfile(context.address);
            if ((profile.ownedTitles || []).some((entry) => String(entry && entry.id || "") === title.id)) return res.status(400).json({ success: false, error: "已持有此稱號" });
            const results = await settlementService.settle({ userAddress: context.address, betWei: priceWei, payoutWei: 0n, source: "rewards_shop_title", meta: { titleId: title.id } });
            await purchaseRewardTitle(context.address, title.id);
            const summary = await buildSummaryPayload(context.address, context.totalBet);
            return res.status(200).json({ success: true, txHash: results.betTxHash, purchasedTitle: title, ...summary });
        }
        if (action === "exchange_yjc") {
            const context = await getUserContext(sessionId);
            const requestedZxc = Number(body.zxcAmount || 0);
            const normalizedZxc = Number.isFinite(requestedZxc) ? Math.max(0, Math.floor(requestedZxc)) : 0;
            const yjcAmount = convertZxcToYjc(normalizedZxc);
            if (yjcAmount <= 0) {
                return res.status(400).json({ success: false, error: "兌換至少需要 100,000,000 子熙幣" });
            }
            const requiredZxc = yjcAmount * 100000000;
            const decimals = await settlementService.getDecimals();
            const requiredZxcWei = ethers.parseUnits(String(requiredZxc), decimals);
            const balanceWei = await settlementService.contract.balanceOf(context.address);
            if (balanceWei < requiredZxcWei) {
                return res.status(400).json({ success: false, error: "餘額不足，無法兌換佑戩幣" });
            }
            const settleResult = await settlementService.settle({ userAddress: context.address, betWei: requiredZxcWei, payoutWei: 0n, source: "rewards_exchange_yjc", meta: { requiredZxc, yjcAmount } });
            const mintTx = await yjcSettlementService.mintTo(context.address, yjcAmount, { source: "rewards_exchange_yjc", meta: { requiredZxc, yjcAmount } });
            const summary = await buildSummaryPayload(context.address, context.totalBet);
            return res.status(200).json({ success: true, requiredZxc, yjcAmount, txHash: settleResult.betTxHash, yjcTxHash: mintTx.hash, ...summary });
        }
        if (action === "use_item") {
            const context = await getUserContext(sessionId);
            const itemId = trimText(body.itemId, 64);
            const profile = await activateInventoryItem(context.address, itemId);
            return res.status(200).json({ success: true, profile: await buildRewardSummaryFromProfile(profile, context.totalBet) });
        }
        if (action === "equip_avatar") {
            const context = await getUserContext(sessionId);
            const profile = await equipAvatar(context.address, trimText(body.avatarId, 64));
            return res.status(200).json({ success: true, profile: await buildRewardSummaryFromProfile(profile, context.totalBet) });
        }
        if (action === "equip_title") {
            const context = await getUserContext(sessionId);
            const profile = await equipTitle(context.address, trimText(body.titleId, 64));
            return res.status(200).json({ success: true, profile: await buildRewardSummaryFromProfile(profile, context.totalBet) });
        }
        if (action === "open_chest") {
            const context = await getUserContext(sessionId);
            const result = await openChest(context.address, trimText(body.chestItemId || body.itemId, 64));
            const decimals = await settlementService.getDecimals();
            let txHash = "";
            if (Number(result.rewards && result.rewards.tokens || 0) > 0) {
                const tokenWei = ethers.parseUnits(String(result.rewards.tokens), decimals);
                const results = await settlementService.settle({ userAddress: context.address, betWei: 0n, payoutWei: tokenWei, source: "rewards_open_chest", meta: { chestId: result.chestId } });
                txHash = results.payoutTxHash;
            }
            return res.status(200).json({ success: true, txHash, chestId: result.chestId, chestName: result.chestName, rewardRarity: result.rewardRarity, rewards: result.rewards, profile: await buildRewardSummaryFromProfile(result.profile, context.totalBet) });
        }
        if (action === "list_campaigns") {
            const context = await getUserContext(sessionId);
            const result = await listRewardCampaigns({ activeOnly: toBoolean(body.activeOnly), hideClaimed: toBoolean(body.hideClaimed), address: context.address });
            return res.status(200).json({ success: true, level: context.vipStatus.vipLevel, betLimit: context.vipStatus.maxBet, campaigns: result.campaigns, levelSystem: { key: "legacy_v1", label: "等級制度 v1" } });
        }
        if (action === "claim_campaign") {
            const context = await getUserContext(sessionId);
            const result = await claimRewardCampaign(trimText(body.campaignId, 128), context.address, context.totalBet);
            const decimals = await settlementService.getDecimals();
            let txHash = "";
            if (Number(result.tokens || 0) > 0) {
                const tokenWei = ethers.parseUnits(String(result.tokens), decimals);
                const results = await settlementService.settle({ userAddress: context.address, betWei: 0n, payoutWei: tokenWei, source: "rewards_claim_campaign", meta: { campaignId: body.campaignId } });
                txHash = results.payoutTxHash;
            }
            return res.status(200).json({ success: true, txHash, campaign: result.campaign, profile: await buildRewardSummaryFromProfile(result.profile, context.totalBet) });
        }
        if (action === "admin_upsert_title") {
            await requireAdmin(sessionId);
            const title = await upsertRewardTitle({ id: trimText(body.titleCatalogId || body.titleId, 64), name: trimText(body.titleName, 80), rarity: trimText(body.titleRarity, 24) || "epic", source: trimText(body.titleSource, 32) || "admin", description: trimText(body.description || body.shopDescription, 240), adminGrantable: body.adminGrantable !== false, showOnLeaderboard: toBoolean(body.showOnLeaderboard), shopEnabled: toBoolean(body.shopEnabled), shopPrice: Number(body.shopPrice || 0), shopDescription: trimText(body.shopDescription || body.description, 240), shopCategory: trimText(body.shopCategory, 32), shopPriority: Number(body.shopPriority || 0), salePrice: Number(body.salePrice || 0), saleStartAt: trimText(body.saleStartAt, 64), saleEndAt: trimText(body.saleEndAt, 64) });
            return res.status(200).json({ success: true, title });
        }
        if (action === "admin_upsert_avatar") {
            await requireAdmin(sessionId);
            const avatar = await upsertRewardAvatar({ id: trimText(body.avatarCatalogId || body.avatarId, 64), name: trimText(body.avatarName, 80), rarity: trimText(body.avatarRarity, 24) || "common", icon: trimText(body.avatarIcon, 16) || "👤", source: trimText(body.avatarSource, 32) || "admin", description: trimText(body.avatarDescription || body.description, 240) });
            return res.status(200).json({ success: true, avatar });
        }
        if (action === "admin_list_campaigns") {
            await requireAdmin(sessionId);
            const result = await listRewardCampaigns({ activeOnly: false });
            return res.status(200).json({ success: true, campaigns: result.campaigns });
        }
        if (action === "admin_upsert_campaign") {
            const admin = await requireAdmin(sessionId);
            const existingId = trimText(body.campaignId, 128);
            const existing = existingId ? await getRewardCampaign(existingId) : null;
            const parsedBundle = parseRewardBundle(body);
            const hasRewardFields = ["itemId", "itemQty", "avatarId", "titleId", "titleExpiresAt", "expiresAt", "tokenAmount", "tokenAmount2"].some((field) => Object.prototype.hasOwnProperty.call(body, field));
            const hasBundle = (parsedBundle.items && parsedBundle.items.length) || (parsedBundle.avatars && parsedBundle.avatars.length) || (parsedBundle.titles && parsedBundle.titles.length) || parsedBundle.tokens || (parsedBundle.tokenRewards && Object.keys(parsedBundle.tokenRewards).length);
            const record = { id: existingId, title: trimText(body.title, 120), description: trimText(body.description, 600), isActive: body.isActive === undefined ? true : toBoolean(body.isActive), startAt: trimText(body.startAt, 64), endAt: trimText(body.endAt, 64), claimLimitPerUser: Number(body.claimLimitPerUser || 1), minLevel: trimText(body.minLevel || body.minVipLevel, 64), rewards: hasRewardFields ? (hasBundle ? parsedBundle : {}) : (existing && existing.rewards) || {}, createdBy: admin.address, updatedBy: admin.address };
            const saved = existingId ? await saveRewardCampaign({ ...(existing || {}), ...record }) : await createRewardCampaign(record);
            return res.status(200).json({ success: true, campaign: saved });
        }
        if (action === "admin_grant_rewards") {
            const admin = await requireAdmin(sessionId);
            const targetAddress = normalizeAddress(body.address, "address");
            const bundle = parseRewardBundle(body);
            if (!bundle.items && !bundle.avatars && !bundle.titles && !bundle.tokens && !(bundle.tokenRewards && Object.keys(bundle.tokenRewards).length)) return res.status(400).json({ success: false, error: "No rewards selected" });
            const grant = await grantRewardBundle(targetAddress, bundle, { source: "admin", expiresAt: trimText(body.expiresAt, 64) });
            let txHash = "";
            if (Number(bundle.tokens || 0) > 0) {
                const decimals = await settlementService.getDecimals();
                const amountWei = ethers.parseUnits(String(bundle.tokens), decimals);
                const results = await settlementService.settle({ userAddress: targetAddress, betWei: 0n, payoutWei: amountWei, source: "rewards_admin_grant", meta: { operator: admin.address } });
                txHash = results.payoutTxHash;
            }
            await createGrantLog({ address: targetAddress, operator: admin.address, source: "admin_panel", note: trimText(body.note, 240), bundle });
            return res.status(200).json({ success: true, txHash, profile: await buildRewardSummaryFromProfile(grant.profile, Number(await kv.get(`total_bet:${targetAddress}`) || 0)) });
        }
        if (action === "admin_list_grant_logs") {
            await requireAdmin(sessionId);
            const result = await listGrantLogs(body.limit);
            return res.status(200).json({ success: true, logs: result.logs, total: result.total });
        }
        return res.status(400).json({ success: false, error: `Unsupported action: ${action}` });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || "Rewards API failed" });
    }
}
