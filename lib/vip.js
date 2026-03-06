const VIP_TIERS = [
    { threshold: 0, label: "普通會員", maxBet: 1000 },
    { threshold: 10000, label: "青銅會員", maxBet: 5000 },
    { threshold: 100000, label: "白銀會員", maxBet: 20000 },
    { threshold: 1000000, label: "黃金會員", maxBet: 100000 },
    { threshold: 10000000, label: "白金會員", maxBet: 500000 },
    { threshold: 50000000, label: "鑽石 VIP", maxBet: 2000000 },
    { threshold: 100000000, label: "黑鑽 VIP", maxBet: 10000000 },
    { threshold: 300000000, label: "神話 VIP", maxBet: 50000000 },
    { threshold: 1000000000, label: "傳奇 VIP", maxBet: 100000000 },
    { threshold: 10000000000, label: "王者 VIP", maxBet: 250000000 },
    { threshold: 100000000000, label: "至尊 VIP", maxBet: 500000000 },
    { threshold: 1000000000000, label: "永恆 VIP", maxBet: 1000000000 }
];

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getVipTier(totalBet) {
    const normalizedTotalBet = toSafeNumber(totalBet, 0);
    for (let index = VIP_TIERS.length - 1; index >= 0; index -= 1) {
        const tier = VIP_TIERS[index];
        if (normalizedTotalBet >= tier.threshold) return tier;
    }
    return VIP_TIERS[0];
}

export function getVipLevel(totalBet) {
    return getVipTier(totalBet).label;
}

export function getVipMaxBet(totalBet) {
    return getVipTier(totalBet).maxBet;
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
        throw new Error(`目前等級 ${tier.label} 單注上限為 ${tier.maxBet.toLocaleString()} ZXC`);
    }
}
