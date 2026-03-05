import { ethers } from "ethers";
import {
    AIRDROP_BASE_REWARD,
    AIRDROP_HALVING_STEP,
    AIRDROP_MIN_REWARD,
    AIRDROP_TOTAL_CAP
} from "./config.js";

export function calculateAirdropRewardWei(decimals, distributedWeiInput) {
    const capWei = ethers.parseUnits(AIRDROP_TOTAL_CAP, decimals);
    const baseWei = ethers.parseUnits(AIRDROP_BASE_REWARD, decimals);
    const stepWei = ethers.parseUnits(AIRDROP_HALVING_STEP, decimals);
    const minWei = ethers.parseUnits(AIRDROP_MIN_REWARD, decimals);

    const distributedWei = BigInt(distributedWeiInput || 0);

    if (distributedWei >= capWei) {
        return {
            rewardWei: 0n,
            remainingWei: 0n,
            distributedWei,
            capWei,
            halvingCount: 0
        };
    }

    const remainingWei = capWei - distributedWei;
    const halvingCount = stepWei > 0n ? Number(distributedWei / stepWei) : 0;

    let rewardWei = baseWei;
    if (halvingCount > 0) {
        rewardWei = baseWei / (2n ** BigInt(halvingCount));
    }

    if (rewardWei < minWei) rewardWei = minWei;
    if (rewardWei > remainingWei) rewardWei = remainingWei;

    return {
        rewardWei,
        remainingWei,
        distributedWei,
        capWei,
        halvingCount
    };
}
