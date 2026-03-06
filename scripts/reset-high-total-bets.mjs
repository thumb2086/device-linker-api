import { kv } from "@vercel/kv";

const RESET_THRESHOLD = 2_000_000_000;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
    const targets = [];

    for await (const key of kv.scanIterator({ match: "total_bet:*", count: 1000 })) {
        const value = await kv.get(key);
        const numericValue = Number(value || 0);
        if (!Number.isFinite(numericValue) || numericValue <= RESET_THRESHOLD) continue;
        targets.push({ key, value: numericValue });
    }

    targets.sort((left, right) => right.value - left.value);

    if (targets.length === 0) {
        console.log(JSON.stringify({
            success: true,
            dryRun: DRY_RUN,
            threshold: RESET_THRESHOLD,
            affected: 0
        }, null, 2));
        return;
    }

    if (!DRY_RUN) {
        for (const target of targets) {
            await kv.set(target.key, "0");
        }
    }

    console.log(JSON.stringify({
        success: true,
        dryRun: DRY_RUN,
        threshold: RESET_THRESHOLD,
        affected: targets.length,
        targets
    }, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        success: false,
        error: error.message
    }, null, 2));
    process.exit(1);
});
