export const LEVEL_TIERS = [
    { threshold: 0, label: "普通會員", maxBet: 1_000 },
    { threshold: 10_000, label: "青銅會員", maxBet: 5_000 },
    { threshold: 100_000, label: "白銀會員", maxBet: 20_000 },
    { threshold: 1_000_000, label: "黃金會員", maxBet: 100_000 },
    { threshold: 10_000_000, label: "白金會員", maxBet: 500_000 },
    { threshold: 50_000_000, label: "鑽石等級", maxBet: 2_000_000 },
    { threshold: 100_000_000, label: "黑鑽等級", maxBet: 10_000_000 },
    { threshold: 500_000_000, label: "菁英等級", maxBet: 50_000_000 },
    { threshold: 1_000_000_000, label: "宗師等級", maxBet: 100_000_000 },
    { threshold: 3_000_000_000, label: "王者等級", maxBet: 300_000_000 },
    { threshold: 10_000_000_000, label: "至尊等級", maxBet: 1_000_000_000 },
    { threshold: 30_000_000_000, label: "蒼穹等級", maxBet: 3_000_000_000 },
    { threshold: 100_000_000_000, label: "寰宇等級", maxBet: 10_000_000_000 },
    { threshold: 300_000_000_000, label: "星穹等級", maxBet: 30_000_000_000 },
    { threshold: 1_000_000_000_000, label: "萬界等級", maxBet: 100_000_000_000 },
    { threshold: 3_000_000_000_000, label: "不朽等級", maxBet: 300_000_000_000 },
    { threshold: 10_000_000_000_000, label: "永恆等級", maxBet: 1_000_000_000_000 },
    { threshold: 30_000_000_000_000, label: "天選等級", maxBet: 3_000_000_000_000 },
    { threshold: 100_000_000_000_000, label: "星耀等級", maxBet: 10_000_000_000_000 },
    { threshold: 300_000_000_000_000, label: "聖域等級", maxBet: 30_000_000_000_000 },
    { threshold: 1_000_000_000_000_000, label: "神域等級", maxBet: 100_000_000_000_000 },
    { threshold: 3_000_000_000_000_000, label: "主宰等級", maxBet: 300_000_000_000_000 },
    { threshold: 10_000_000_000_000_000, label: "永耀等級", maxBet: 600_000_000_000_000 },
    { threshold: 30_000_000_000_000_000, label: "創世等級", maxBet: 800_000_000_000_000 },
    { threshold: 100_000_000_000_000_000, label: "神諭等級", maxBet: 1_000_000_000_000_000 }
];

export const VIP_CHAT_ROOMS = [
    {
        id: "public",
        label: "公共大廳",
        requiredLevel: null,
        announcement: "全服聊天室，所有玩家都可加入。",
        bettingToken: { symbol: "子熙幣", key: "zixi", chainStatus: "live", bettingEnabled: true }
    },
    {
        id: "vip",
        label: "VIP 大廳",
        requiredLevel: "黃金會員",
        announcement: "VIP 專屬聊天室，僅開放黃金會員以上玩家加入。",
        bettingToken: { symbol: "優件幣", key: "youjian", chainStatus: "reserved", bettingEnabled: false }
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
        throw new Error("押注金額必須大於 0");
    }

    const tier = getVipTier(totalBet);
    if (betAmount > tier.maxBet) {
        throw new Error(`目前 ${tier.label} 單注上限為 ${tier.maxBet.toLocaleString()} 子熙幣`);
    }
}
