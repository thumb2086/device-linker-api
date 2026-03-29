import { kv } from "@vercel/kv";

export const DEFAULT_RESET_THRESHOLD = 2_000_000_000;

function toNumericValue(rawValue) {
    const numericValue = Number(rawValue || 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

export async function collectHighTotalBetTargets(options = {}) {
    const threshold = Number.isFinite(Number(options.threshold))
        ? Number(options.threshold)
        : DEFAULT_RESET_THRESHOLD;
    const addressKeyword = String(options.addressKeyword || "").trim().toLowerCase();
    const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Math.floor(Number(options.limit))) : null;
    const targets = [];

    for await (const key of kv.scanIterator({ match: "total_bet:*", count: 1000 })) {
        const value = await kv.get(key);
        const numericValue = toNumericValue(value);
        if (numericValue <= threshold) continue;
        const address = String(key || "").replace(/^total_bet:/, "").trim().toLowerCase();
        if (addressKeyword && address.indexOf(addressKeyword) === -1) continue;
        targets.push({ key, address, value: numericValue });
    }

    targets.sort((left, right) => right.value - left.value);
    return limit ? targets.slice(0, limit) : targets;
}

export async function resetHighTotalBets(options = {}) {
    const threshold = Number.isFinite(Number(options.threshold))
        ? Number(options.threshold)
        : DEFAULT_RESET_THRESHOLD;
    const addressKeyword = String(options.addressKeyword || "").trim();
    const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : undefined;
    const dryRun = Boolean(options.dryRun);
    const resetTotalBet = options.resetTotalBet !== false;
    const targets = await collectHighTotalBetTargets({ threshold, addressKeyword, limit });

    if (!dryRun && resetTotalBet) {
        for (const target of targets) {
            await kv.set(target.key, "0");
        }
    }

    return {
        success: true,
        dryRun,
        threshold,
        affected: targets.length,
        targets
    };
}
