export const LEVEL_TIERS = [
    { threshold: 0, label: "普通會員", maxBet: 1000 },
    { threshold: 10000, label: "青銅會員", maxBet: 5000 },
    { threshold: 100000, label: "白銀會員", maxBet: 20000 },
    { threshold: 1000000, label: "黃金會員", maxBet: 100000 },
    { threshold: 10000000, label: "白金會員", maxBet: 500000 },
    { threshold: 50000000, label: "鑽石等級", maxBet: 2000000 },
    { threshold: 100000000, label: "黑鑽等級", maxBet: 10000000 },
    { threshold: 500000000, label: "菁英等級", maxBet: 50000000 },
    { threshold: 1000000000, label: "宗師等級", maxBet: 80000000 },
    { threshold: 2000000000, label: "王者等級", maxBet: 120000000 },
    { threshold: 3000000000, label: "至尊等級", maxBet: 160000000 },
    { threshold: 5000000000, label: "蒼穹等級", maxBet: 220000000 },
    { threshold: 8000000000, label: "寰宇等級", maxBet: 300000000 },
    { threshold: 12000000000, label: "星穹等級", maxBet: 380000000 },
    { threshold: 20000000000, label: "萬界等級", maxBet: 480000000 },
    { threshold: 30000000000, label: "不朽等級", maxBet: 600000000 },
    { threshold: 50000000000, label: "永恆等級", maxBet: 720000000 },
    { threshold: 80000000000, label: "天選等級", maxBet: 860000000 },
    { threshold: 100000000000, label: "星耀等級", maxBet: 880000000 },
    { threshold: 150000000000, label: "聖域等級", maxBet: 900000000 },
    { threshold: 250000000000, label: "神域等級", maxBet: 920000000 },
    { threshold: 400000000000, label: "主宰等級", maxBet: 940000000 },
    { threshold: 600000000000, label: "永耀等級", maxBet: 960000000 },
    { threshold: 800000000000, label: "創世等級", maxBet: 980000000 },
    { threshold: 1000000000000, label: "神諭等級", maxBet: 1000000000 }
];

export const VIP_CHAT_ROOMS = [
    {
        id: "public",
        label: "公共大廳",
        requiredLevel: null,
        announcement: "所有玩家皆可加入",
        bettingToken: { symbol: "子熙幣", key: "zixi", chainStatus: "live", bettingEnabled: true }
    },
    {
        id: "vip",
        label: "VIP 特殊房",
        requiredLevel: "黃金會員",
        announcement: "VIP 玩家專屬。預留佑戩幣下注功能（尚未上測試鏈）。",
        bettingToken: { symbol: "佑戩幣", key: "youjian", chainStatus: "reserved", bettingEnabled: false }
    }
];

export function getVipTierOptions() {
    return LEVEL_TIERS.map((tier) => ({
        label: tier.label,
        threshold: tier.threshold,
        maxBet: tier.maxBet
    }));
}

export function getVipChatRoomOptions() {
    return VIP_CHAT_ROOMS.map((room) => ({
        id: room.id,
        label: room.label,
        requiredLevel: room.requiredLevel,
        announcement: room.announcement,
        bettingToken: room.bettingToken
    }));
}

export function getVipChatRoomById(roomId) {
    const normalizedRoomId = String(roomId || "").trim().toLowerCase();
    return VIP_CHAT_ROOMS.find((room) => room.id === normalizedRoomId) || VIP_CHAT_ROOMS[0];
}

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getVipTier(totalBet) {
    const normalizedTotalBet = toSafeNumber(totalBet, 0);
    for (let index = LEVEL_TIERS.length - 1; index >= 0; index -= 1) {
        const tier = LEVEL_TIERS[index];
        if (normalizedTotalBet >= tier.threshold) return tier;
    }
    return LEVEL_TIERS[0];
}

export function getVipLevel(totalBet) {
    return getVipTier(totalBet).label;
}

export function getVipMaxBet(totalBet) {
    return getVipTier(totalBet).maxBet;
}

export function getVipTierIndexByLabel(label) {
    const normalized = String(label || "").trim();
    return LEVEL_TIERS.findIndex((tier) => tier.label === normalized);
}

export function meetsVipLevelRequirement(currentLevel, requiredLevel) {
    const requiredIndex = getVipTierIndexByLabel(requiredLevel);
    if (requiredIndex < 0) return String(currentLevel || "").trim() === String(requiredLevel || "").trim();
    const currentIndex = getVipTierIndexByLabel(currentLevel);
    if (currentIndex < 0) return false;
    return currentIndex >= requiredIndex;
}

export function canAccessVipChatRoom(totalBet, roomId) {
    const room = getVipChatRoomById(roomId);
    if (!room.requiredLevel) return { allowed: true, room };
    const currentLevel = getVipLevel(totalBet);
    const allowed = meetsVipLevelRequirement(currentLevel, room.requiredLevel);
    return { allowed, room, currentLevel };
}

export function buildVipStatus(totalBet) {
    const tier = getVipTier(totalBet);
    return {
        vipLevel: tier.label,
        maxBet: tier.maxBet
    };
}

export function assertVipBetLimit(amount, totalBet) {
    const betAmount = toSafeNumber(amount, NaN);
    if (!Number.isFinite(betAmount) || betAmount <= 0) {
        throw new Error("下注金額無效");
    }

    const tier = getVipTier(totalBet);
    if (betAmount > tier.maxBet) {
        throw new Error(`目前等級 ${tier.label} 單注上限為 ${tier.maxBet.toLocaleString()} 子熙幣`);
    }
}
