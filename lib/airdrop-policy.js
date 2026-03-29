import { ethers } from "ethers";
import {
    AIRDROP_BASE_REWARD,
    AIRDROP_HALVING_STEP,
    AIRDROP_MIN_REWARD
} from "./config.js";

export const AIRDROP_DISTRIBUTED_TOTAL_KEY = "airdrop_distributed_total_wei";

export function normalizeAirdropDistributedWei(value) {
    if (typeof value === "bigint") return value >= 0n ? value : 0n;
    const text = String(value ?? "").trim();
    if (!text) return 0n;
    try {
        const parsed = BigInt(text);
        return parsed >= 0n ? parsed : 0n;
    } catch {
        return 0n;
    }
}

export function calculateAirdropRewardWei(decimals, distributedWeiInput) {
    const baseWei = ethers.parseUnits(AIRDROP_BASE_REWARD, decimals);
    const stepWei = ethers.parseUnits(AIRDROP_HALVING_STEP, decimals);
    const minWei = ethers.parseUnits(AIRDROP_MIN_REWARD, decimals);

    const distributedWei = normalizeAirdropDistributedWei(distributedWeiInput);

    const halvingCount = stepWei > 0n ? Number(distributedWei / stepWei) : 0;

    let rewardWei = baseWei;
    if (halvingCount > 0) {
        rewardWei = baseWei / (2n ** BigInt(halvingCount));
    }

    if (rewardWei < minWei) rewardWei = minWei;

    return {
        rewardWei,
        remainingWei: null,
        distributedWei,
        capWei: null,
        halvingCount
    };
}
