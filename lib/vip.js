const VIP_TIERS = [
    { threshold: 0, label: "普通會員", maxBet: 1000 },
    { threshold: 10000, label: "青銅會員", maxBet: 5000 },
    { threshold: 100000, label: "白銀會員", maxBet: 20000 },
    { threshold: 1000000, label: "黃金會員", maxBet: 100000 },
    { threshold: 10000000, label: "白金會員", maxBet: 500000 },
    { threshold: 50000000, label: "鑽石 VIP", maxBet: 2000000 },
    { threshold: 100000000, label: "黑鑽 VIP", maxBet: 10000000 },
    { threshold: 500000000, label: "神話 VIP", maxBet: 50000000 },
    { threshold: 1000000000, label: "傳奇 VIP", maxBet: 80000000 },
    { threshold: 2000000000, label: "王者 VIP", maxBet: 120000000 },
    { threshold: 3000000000, label: "至尊 VIP", maxBet: 160000000 },
    { threshold: 5000000000, label: "蒼穹 VIP", maxBet: 220000000 },
    { threshold: 8000000000, label: "寰宇 VIP", maxBet: 300000000 },
    { threshold: 12000000000, label: "永恆 VIP", maxBet: 380000000 },
    { threshold: 20000000000, label: "不朽 VIP", maxBet: 480000000 },
    { threshold: 30000000000, label: "星穹 VIP", maxBet: 600000000 },
    { threshold: 50000000000, label: "萬界 VIP", maxBet: 720000000 },
    { threshold: 80000000000, label: "天選 VIP", maxBet: 860000000 },
    { threshold: 1000000000000, label: "神諭 VIP", maxBet: 1000000000 }
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
