import { resetHighTotalBets, DEFAULT_RESET_THRESHOLD } from "../lib/ops/reset-high-total-bets.js";
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
    const result = await resetHighTotalBets({
        threshold: DEFAULT_RESET_THRESHOLD,
        dryRun: DRY_RUN
    });
    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        success: false,
        error: error.message
    }, null, 2));
    process.exit(1);
});
