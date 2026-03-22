import { ethers } from "ethers";
import { RPC_URL, YJC_CONTRACT_ADDRESS, YJC_TOKEN_DECIMALS } from "./config.js";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)"
];

export const YJC_VIP_TIERS = [
    { key: "none", label: "未達 VIP", minBalance: 0, maxBalance: 0, roomAccess: [] },
    { key: "vip1", label: "VIP 1", minBalance: 1, maxBalance: 999, roomAccess: ["table_1"] },
    { key: "vip2", label: "VIP 2", minBalance: 1000, maxBalance: Number.POSITIVE_INFINITY, roomAccess: ["table_1", "table_2"], perks: ["zero_fee"] }
];

export const YJC_CHAT_ROOMS = [
    {
        id: "public",
        label: "公共大廳",
        requiredTier: null,
        announcement: "全服聊天室，所有玩家都可加入。",
        bettingToken: { symbol: "子熙幣", key: "zixi", chainStatus: "live", bettingEnabled: true }
    },
    {
        id: "vip",
        label: "VIP 大廳",
        requiredTier: "vip1",
        announcement: "YJC VIP 聊天室，持有 1 顆以上佑戩幣即可加入。",
        bettingToken: { symbol: "佑戩幣", key: "youjian", chainStatus: "live", bettingEnabled: false }
    }
];

export const YJC_TABLES = [
    { id: "public", label: "公共桌", requiredTier: null },
    { id: "table_1", label: "VIP 一號桌", requiredTier: "vip1" },
    { id: "table_2", label: "VIP 二號桌", requiredTier: "vip2" }
];

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function tierIndexByKey(key) {
    const normalized = String(key || "none").trim().toLowerCase();
    return YJC_VIP_TIERS.findIndex((tier) => tier.key === normalized);
}

export function getYjcTierLabel(key) {
    const tier = YJC_VIP_TIERS.find((item) => item.key === String(key || "").trim().toLowerCase());
    return tier ? tier.label : "未達 VIP";
}

export function meetsYjcTierRequirement(currentTierKey, requiredTierKey) {
    if (!requiredTierKey) return true;
    const currentIndex = tierIndexByKey(currentTierKey);
    const requiredIndex = tierIndexByKey(requiredTierKey);
    if (requiredIndex < 0) return false;
    return currentIndex >= requiredIndex;
}

export function getYjcVipTierByBalance(balance) {
    const amount = Math.max(0, Math.floor(toSafeNumber(balance, 0)));
    if (amount >= 1000) return YJC_VIP_TIERS[2];
    if (amount >= 1) return YJC_VIP_TIERS[1];
    return YJC_VIP_TIERS[0];
}

export function buildYjcVipStatusFromBalance(balance, source = "offchain") {
    const normalizedBalance = Math.max(0, Math.floor(toSafeNumber(balance, 0)));
    const tier = getYjcVipTierByBalance(normalizedBalance);
    return {
        source,
        balance: normalizedBalance,
        tier: {
            key: tier.key,
            label: tier.label,
            roomAccess: Array.isArray(tier.roomAccess) ? [...tier.roomAccess] : [],
            perks: Array.isArray(tier.perks) ? [...tier.perks] : []
        }
    };
}

export function getYjcChatRoomById(roomId) {
    const normalizedRoomId = String(roomId || "").trim().toLowerCase();
    const room = YJC_CHAT_ROOMS.find((item) => item.id === normalizedRoomId) || YJC_CHAT_ROOMS[0];
    return {
        ...room,
        requiredLevel: room.requiredTier ? getYjcTierLabel(room.requiredTier) : null
    };
}

export function getYjcChatRoomOptions() {
    return YJC_CHAT_ROOMS.map((room) => ({
        id: room.id,
        label: room.label,
        requiredTier: room.requiredTier,
        requiredLevel: room.requiredTier ? getYjcTierLabel(room.requiredTier) : null,
        announcement: room.announcement,
        bettingToken: room.bettingToken
    }));
}

export function canAccessYjcChatRoom(yjcVipStatus, roomId) {
    const room = getYjcChatRoomById(roomId);
    const currentTierKey = String(yjcVipStatus && yjcVipStatus.tier && yjcVipStatus.tier.key || "none").trim().toLowerCase();
    return {
        allowed: meetsYjcTierRequirement(currentTierKey, room.requiredTier),
        room,
        currentTierKey,
        currentTierLabel: getYjcTierLabel(currentTierKey),
        requiredTierKey: room.requiredTier || null,
        requiredTierLabel: room.requiredTier ? getYjcTierLabel(room.requiredTier) : null
    };
}

export function getYjcTableById(tableId) {
    const normalizedTableId = String(tableId || "public").trim().toLowerCase();
    return YJC_TABLES.find((table) => table.id === normalizedTableId) || YJC_TABLES[0];
}

export function getAccessibleYjcTables(yjcVipStatus) {
    const currentTierKey = String(yjcVipStatus && yjcVipStatus.tier && yjcVipStatus.tier.key || "none").trim().toLowerCase();
    return YJC_TABLES
        .filter((table) => meetsYjcTierRequirement(currentTierKey, table.requiredTier))
        .map((table) => ({ ...table }));
}

export function canAccessYjcTable(yjcVipStatus, tableId) {
    const table = getYjcTableById(tableId);
    const currentTierKey = String(yjcVipStatus && yjcVipStatus.tier && yjcVipStatus.tier.key || "none").trim().toLowerCase();
    return {
        allowed: meetsYjcTierRequirement(currentTierKey, table.requiredTier),
        table,
        currentTierKey,
        currentTierLabel: getYjcTierLabel(currentTierKey),
        requiredTierKey: table.requiredTier || null,
        requiredTierLabel: table.requiredTier ? getYjcTierLabel(table.requiredTier) : null
    };
}

export async function resolveYjcVipStatus(address) {
    const normalizedAddress = String(address || "").trim();
    if (!normalizedAddress) {
        return { available: false, ...buildYjcVipStatusFromBalance(0, "missing_address") };
    }

    if (!YJC_CONTRACT_ADDRESS) {
        return { available: false, ...buildYjcVipStatusFromBalance(0, "missing_contract") };
    }

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(YJC_CONTRACT_ADDRESS, ERC20_ABI, provider);
        const rawBalance = await contract.balanceOf(normalizedAddress);
        const yjcBalance = Number(ethers.formatUnits(rawBalance, YJC_TOKEN_DECIMALS));
        const normalized = Math.max(0, Math.floor(toSafeNumber(yjcBalance, 0)));
        return { available: true, ...buildYjcVipStatusFromBalance(normalized, "onchain") };
    } catch (error) {
        return {
            available: false,
            error: error?.message || "resolve_yjc_balance_failed",
            ...buildYjcVipStatusFromBalance(0, "onchain_error")
        };
    }
}

export function convertZxcToYjc(zxcAmount) {
    const zxc = Math.max(0, Math.floor(toSafeNumber(zxcAmount, 0)));
    return Math.floor(zxc / 100000000);
}
