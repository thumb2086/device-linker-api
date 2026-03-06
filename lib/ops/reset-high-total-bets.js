import { kv } from "@vercel/kv";

export const DEFAULT_RESET_THRESHOLD = 2_000_000_000;

function toNumericValue(rawValue) {
    const numericValue = Number(rawValue || 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

export async function collectHighTotalBetTargets(threshold = DEFAULT_RESET_THRESHOLD) {
    const targets = [];

    for await (const key of kv.scanIterator({ match: "total_bet:*", count: 1000 })) {
        const value = await kv.get(key);
        const numericValue = toNumericValue(value);
        if (numericValue <= threshold) continue;
        targets.push({ key, value: numericValue });
    }

    targets.sort((left, right) => right.value - left.value);
    return targets;
}

export async function resetHighTotalBets(options = {}) {
    const threshold = Number.isFinite(Number(options.threshold))
        ? Number(options.threshold)
        : DEFAULT_RESET_THRESHOLD;
    const dryRun = Boolean(options.dryRun);
    const targets = await collectHighTotalBetTargets(threshold);

    if (!dryRun) {
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
