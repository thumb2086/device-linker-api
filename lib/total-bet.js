import { kv } from "@vercel/kv";
import { getPeriodSnapshot } from "./leaderboard-period.js";

function normalizeAddress(address) {
    return String(address || "").trim().toLowerCase();
}

export async function recordTotalBet(address, amount) {
    const normalizedAddress = normalizeAddress(address);
    const numericAmount = Number(amount || 0);
    if (!normalizedAddress || !Number.isFinite(numericAmount) || numericAmount === 0) {
        return 0;
    }

    const period = getPeriodSnapshot();
    const totalKey = `total_bet:${normalizedAddress}`;
    const weekKey = `total_bet_week:${period.week.id}:${normalizedAddress}`;
    const monthKey = `total_bet_month:${period.month.id}:${normalizedAddress}`;
    const seasonKey = `total_bet_season:${period.season.id}:${normalizedAddress}`;

    const [totalBetRaw] = await Promise.all([
        kv.incrbyfloat(totalKey, numericAmount),
        kv.incrbyfloat(weekKey, numericAmount),
        kv.incrbyfloat(monthKey, numericAmount),
        kv.incrbyfloat(seasonKey, numericAmount)
    ]);

    return Number(totalBetRaw || 0);
}
