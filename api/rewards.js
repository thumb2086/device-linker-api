import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { ADMIN_WALLET_ADDRESS, CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { buildVipStatus, getVipTierOptions } from "../lib/vip.js";
import { withChainTxLock } from "../lib/tx-lock.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { sendManagedContractTx } from "../lib/admin-chain.js";
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
    upsertRewardTitle
} from "../lib/reward-center.js";

const CONTRACT_ABI = [
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)"
];

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
    if (blacklisted) {
        throw new Error(`帳號已被禁止進入：${blacklisted.reason || "未註明原因"}`);
    }

    const totalBet = Number(await kv.get(`total_bet:${address}`) || 0);
    const vipStatus = buildVipStatus(totalBet);
    return { session, address, totalBet, vipStatus };
}

function isAdminAddress(address) {
    return String(address || "").trim().toLowerCase() === String(process.env.OPS_ADMIN_ADDRESS || ADMIN_WALLET_ADDRESS).trim().toLowerCase();
}

async function requireAdmin(sessionId) {
    const context = await getUserContext(sessionId);
    if (!isAdminAddress(context.address)) {
        throw new Error("Current session is not an admin wallet");
    }
    return context;
}

function parseRewardBundle(body) {
    const bundle = {};
    const itemId = trimText(body.itemId, 64);
    const itemQty = Number(body.itemQty || 1);
    const avatarId = trimText(body.avatarId, 64);
    const titleId = trimText(body.titleId, 64);
    const expiresAt = trimText(body.titleExpiresAt || body.expiresAt, 64);
    const tokenAmount = Number(body.tokenAmount || 0);

    if (itemId) {
        bundle.items = [{ id: itemId, qty: Number.isFinite(itemQty) && itemQty > 0 ? Math.floor(itemQty) : 1 }];
    }
    if (avatarId) {
        bundle.avatars = [avatarId];
    }
    if (titleId) {
        bundle.titles = [{ id: titleId, expiresAt }];
    }
    if (Number.isFinite(tokenAmount) && tokenAmount > 0) {
        bundle.tokens = tokenAmount;
    }
    return bundle;
}

async function getContractContext() {
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY is not configured");
    if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    const treasuryAddress = normalizeAddress(process.env.LOSS_POOL_ADDRESS || wallet.address, "LOSS_POOL_ADDRESS");
    const contract = new ethers.Contract(normalizeAddress(CONTRACT_ADDRESS, "CONTRACT_ADDRESS"), CONTRACT_ABI, wallet);
    const decimals = await contract.decimals();
    return { contract, decimals, treasuryAddress, walletAddress: normalizeAddress(wallet.address, "walletAddress") };
}

async function buildSummaryPayload(address, totalBet) {
    const [profile, campaigns, catalog] = await Promise.all([
        buildRewardSummary(address, totalBet),
        listRewardCampaigns({ activeOnly: true, address }),
        getRewardCatalog()
    ]);
    return {
        profile,
        catalog: {
            ...catalog,
            vipLevels: getVipTierOptions()
        },
        campaigns: campaigns.campaigns
    };
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
            const context = await getUserContext(sessionId);
            const summary = await buildSummaryPayload(context.address, context.totalBet);
            return res.status(200).json({
                success: true,
                vipLevel: context.vipStatus.vipLevel,
                ...summary
            });
        }

        if (action === "buy") {
            const context = await getUserContext(sessionId);
            const itemId = trimText(body.shopItemId || body.itemId, 64);
            const catalog = await getRewardCatalog();
            const item = (catalog.shopItems || []).find((entry) => entry.id === itemId);
            if (!item) {
                return res.status(404).json({ success: false, error: "Shop item not found" });
            }

            const { contract, decimals, treasuryAddress } = await getContractContext();
            const priceWei = ethers.parseUnits(String(item.price), decimals);
            const balanceWei = await contract.balanceOf(context.address);
            if (balanceWei < priceWei) {
                return res.status(400).json({ success: false, error: "餘額不足，無法購買此商品" });
            }

            const tx = await withChainTxLock(async () => {
                const sent = await sendManagedContractTx(contract, "adminTransfer", [context.address, treasuryAddress, priceWei], { gasLimit: 220000, txSource: "rewards_shop_item" });
                await purchaseShopItem(context.address, item.id);
                return sent;
            }, undefined, "rewards_shop_item");

            const summary = await buildSummaryPayload(context.address, context.totalBet);
            return res.status(200).json({
                success: true,
                txHash: tx.hash,
                purchased: item,
                ...summary
            });
        }

        if (action === "buy_title") {
            const context = await getUserContext(sessionId);
            const titleId = trimText(body.titleId, 64);
            const catalog = await getRewardCatalog();
            const title = (catalog.titles || []).find((entry) => entry.id === titleId);
            if (!title) {
                return res.status(404).json({ success: false, error: "Title not found" });
            }
            const effectivePrice = Number(title.effectiveShopPrice || 0);
            if (!title.shopEnabled || effectivePrice <= 0) {
                return res.status(400).json({ success: false, error: "此稱號尚未上架販售" });
            }

            const { contract, decimals, treasuryAddress } = await getContractContext();
            const priceWei = ethers.parseUnits(String(effectivePrice), decimals);
            const balanceWei = await contract.balanceOf(context.address);
            if (balanceWei < priceWei) {
                return res.status(400).json({ success: false, error: "餘額不足，無法購買此稱號" });
            }

            const tx = await withChainTxLock(async () => {
                const profile = await getRewardProfile(context.address);
                if ((profile.ownedTitles || []).some((entry) => String(entry && entry.id || "") === title.id)) {
                    throw new Error("已持有此稱號");
                }
                const sent = await sendManagedContractTx(contract, "adminTransfer", [context.address, treasuryAddress, priceWei], { gasLimit: 220000, txSource: "rewards_shop_title" });
                await purchaseRewardTitle(context.address, title.id);
                return sent;
            }, undefined, "rewards_shop_title");

            const summary = await buildSummaryPayload(context.address, context.totalBet);
            return res.status(200).json({
                success: true,
                txHash: tx.hash,
                purchasedTitle: title,
                ...summary
            });
        }

        if (action === "use_item") {
            const context = await getUserContext(sessionId);
            const itemId = trimText(body.itemId, 64);
            const profile = await activateInventoryItem(context.address, itemId);
            return res.status(200).json({
                success: true,
                profile: await buildRewardSummaryFromProfile(profile, context.totalBet)
            });
        }

        if (action === "equip_avatar") {
            const context = await getUserContext(sessionId);
            const profile = await equipAvatar(context.address, trimText(body.avatarId, 64));
            return res.status(200).json({
                success: true,
                profile: await buildRewardSummaryFromProfile(profile, context.totalBet)
            });
        }

        if (action === "equip_title") {
            const context = await getUserContext(sessionId);
            const profile = await equipTitle(context.address, trimText(body.titleId, 64));
            return res.status(200).json({
                success: true,
                profile: await buildRewardSummaryFromProfile(profile, context.totalBet)
            });
        }

        if (action === "open_chest") {
            const context = await getUserContext(sessionId);
            const result = await openChest(context.address, trimText(body.chestItemId || body.itemId, 64));
            const { contract, decimals, treasuryAddress } = await getContractContext();
            let txHash = "";
            if (Number(result.rewards && result.rewards.tokens || 0) > 0) {
                const tokenWei = ethers.parseUnits(String(result.rewards.tokens), decimals);
                const tx = await withChainTxLock(() => transferFromTreasuryWithAutoTopup(
                    contract,
                    treasuryAddress,
                    context.address,
                    tokenWei,
                    { gasLimit: 220000, txSource: "rewards_open_chest" }
                ), undefined, "rewards_open_chest");
                txHash = tx.hash;
            }

            return res.status(200).json({
                success: true,
                txHash,
                chestId: result.chestId,
                chestName: result.chestName,
                rewardRarity: result.rewardRarity,
                rewards: result.rewards,
                profile: await buildRewardSummaryFromProfile(result.profile, context.totalBet)
            });
        }

        if (action === "list_campaigns") {
            const context = await getUserContext(sessionId);
            const result = await listRewardCampaigns({
                activeOnly: toBoolean(body.activeOnly),
                hideClaimed: toBoolean(body.hideClaimed),
                address: context.address
            });
            return res.status(200).json({
                success: true,
                vipLevel: context.vipStatus.vipLevel,
                campaigns: result.campaigns
            });
        }

        if (action === "claim_campaign") {
            const context = await getUserContext(sessionId);
            const result = await claimRewardCampaign(trimText(body.campaignId, 128), context.address, context.totalBet);
            const { contract, decimals, treasuryAddress } = await getContractContext();
            let txHash = "";
            if (Number(result.tokens || 0) > 0) {
                const tokenWei = ethers.parseUnits(String(result.tokens), decimals);
                const tx = await withChainTxLock(() => transferFromTreasuryWithAutoTopup(
                    contract,
                    treasuryAddress,
                    context.address,
                    tokenWei,
                    { gasLimit: 220000, txSource: "rewards_claim_campaign" }
                ), undefined, "rewards_claim_campaign");
                txHash = tx.hash;
            }
            return res.status(200).json({
                success: true,
                txHash,
                campaign: result.campaign,
                profile: await buildRewardSummaryFromProfile(result.profile, context.totalBet)
            });
        }

        if (action === "admin_upsert_title") {
            await requireAdmin(sessionId);
            const title = await upsertRewardTitle({
                id: trimText(body.titleCatalogId || body.titleId, 64),
                name: trimText(body.titleName, 80),
                rarity: trimText(body.titleRarity, 24) || "epic",
                source: trimText(body.titleSource, 32) || "admin",
                adminGrantable: body.adminGrantable !== false,
                showOnLeaderboard: toBoolean(body.showOnLeaderboard),
                shopEnabled: toBoolean(body.shopEnabled),
                shopPrice: Number(body.shopPrice || 0),
                shopDescription: trimText(body.shopDescription, 240),
                shopCategory: trimText(body.shopCategory, 32),
                shopPriority: Number(body.shopPriority || 0),
                salePrice: Number(body.salePrice || 0),
                saleStartAt: trimText(body.saleStartAt, 64),
                saleEndAt: trimText(body.saleEndAt, 64)
            });
            return res.status(200).json({ success: true, title });
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
            const hasRewardFields = [
                "itemId",
                "itemQty",
                "avatarId",
                "titleId",
                "titleExpiresAt",
                "expiresAt",
                "tokenAmount"
            ].some((field) => Object.prototype.hasOwnProperty.call(body, field));
            const hasBundle =
                (parsedBundle.items && parsedBundle.items.length) ||
                (parsedBundle.avatars && parsedBundle.avatars.length) ||
                (parsedBundle.titles && parsedBundle.titles.length) ||
                parsedBundle.tokens;
            const record = {
                id: existingId,
                title: trimText(body.title, 120),
                description: trimText(body.description, 600),
                isActive: body.isActive === undefined ? true : toBoolean(body.isActive),
                startAt: trimText(body.startAt, 64),
                endAt: trimText(body.endAt, 64),
                claimLimitPerUser: Number(body.claimLimitPerUser || 1),
                minVipLevel: trimText(body.minVipLevel, 64),
                rewards: hasRewardFields ? (hasBundle ? parsedBundle : {}) : (existing && existing.rewards) || {},
                createdBy: admin.address,
                updatedBy: admin.address
            };

            const saved = existingId
                ? await saveRewardCampaign({ ...(existing || {}), ...record })
                : await createRewardCampaign(record);

            return res.status(200).json({ success: true, campaign: saved });
        }

        if (action === "admin_grant_rewards") {
            const admin = await requireAdmin(sessionId);
            const targetAddress = normalizeAddress(body.address, "address");
            const bundle = parseRewardBundle(body);
            if (!bundle.items && !bundle.avatars && !bundle.titles && !bundle.tokens) {
                return res.status(400).json({ success: false, error: "No rewards selected" });
            }

            const grant = await grantRewardBundle(targetAddress, bundle, { source: "admin", expiresAt: trimText(body.expiresAt, 64) });
            let txHash = "";
            if (Number(bundle.tokens || 0) > 0) {
                const { contract, decimals, treasuryAddress } = await getContractContext();
                const amountWei = ethers.parseUnits(String(bundle.tokens), decimals);
                const tx = await withChainTxLock(() => transferFromTreasuryWithAutoTopup(
                    contract,
                    treasuryAddress,
                    targetAddress,
                    amountWei,
                    { gasLimit: 220000, txSource: "rewards_admin_grant" }
                ), undefined, "rewards_admin_grant");
                txHash = tx.hash;
            }

            await createGrantLog({
                address: targetAddress,
                operator: admin.address,
                source: "admin_panel",
                note: trimText(body.note, 240),
                bundle
            });

            return res.status(200).json({
                success: true,
                txHash,
                profile: await buildRewardSummaryFromProfile(grant.profile, Number(await kv.get(`total_bet:${targetAddress}`) || 0))
            });
        }

        if (action === "admin_list_grant_logs") {
            await requireAdmin(sessionId);
            const result = await listGrantLogs(body.limit);
            return res.status(200).json({ success: true, logs: result.logs, total: result.total });
        }

        return res.status(400).json({
            success: false,
            error: `Unsupported action: ${action}`
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || "Rewards API failed"
        });
    }
}
