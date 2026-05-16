// packages/domain/src/wallet/airdrop-policy.ts
// 從 main/lib/airdrop-policy.js 移植
import { ethers } from "ethers";
import {
  AIRDROP_BASE_REWARD,
  AIRDROP_HALVING_STEP,
  AIRDROP_MIN_REWARD,
  AIRDROP_DISTRIBUTED_TOTAL_KEY,
} from "@repo/shared";

export { AIRDROP_DISTRIBUTED_TOTAL_KEY };

export interface AirdropPolicy {
  rewardWei: bigint;
  halvingCount: number;
  distributedWei: bigint;
  minRewardWei: bigint;
}

export function normalizeAirdropDistributedWei(stored: unknown): bigint {
  try {
    if (!stored) return 0n;
    const str = String(stored).trim();
    if (!str || str === "0") return 0n;
    return BigInt(str);
  } catch {
    return 0n;
  }
}

export function calculateAirdropRewardWei(
  decimals: number,
  distributedWei: bigint
): AirdropPolicy {
  const baseRewardWei = ethers.parseUnits(AIRDROP_BASE_REWARD, decimals);
  const halvingStepWei = ethers.parseUnits(AIRDROP_HALVING_STEP, decimals);
  const minRewardWei = ethers.parseUnits(AIRDROP_MIN_REWARD, decimals);

  let halvingCount = 0n;
  if (halvingStepWei > 0n) {
    halvingCount = distributedWei / halvingStepWei;
  }

  let rewardWei = baseRewardWei;
  for (let i = 0n; i < halvingCount; i++) {
    rewardWei = rewardWei / 2n;
  }

  if (rewardWei < minRewardWei) {
    rewardWei = minRewardWei;
  }

  return {
    rewardWei,
    halvingCount: Number(halvingCount),
    distributedWei,
    minRewardWei,
  };
}
