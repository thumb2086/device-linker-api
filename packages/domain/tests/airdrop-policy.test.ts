import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { calculateAirdropRewardWei, normalizeAirdropDistributedWei } from "../src/wallet/airdrop-policy.js";

describe("AirdropPolicy", () => {
  it("starts at 1000000 ZXC when no airdrop has been distributed", () => {
    const policy = calculateAirdropRewardWei(18, 0n);

    expect(policy.halvingCount).toBe(0);
    expect(policy.rewardWei).toBe(ethers.parseUnits("1000000", 18));
    expect(policy.minRewardWei).toBe(ethers.parseUnits("1000", 18));
  });

  it("halves after each 100 million distributed ZXC", () => {
    const distributedWei = ethers.parseUnits("100000000", 18);
    const policy = calculateAirdropRewardWei(18, distributedWei);

    expect(policy.halvingCount).toBe(1);
    expect(policy.rewardWei).toBe(ethers.parseUnits("500000", 18));
  });

  it("stops halving at the 1000 ZXC floor", () => {
    const distributedWei = ethers.parseUnits("10000000000", 18);
    const policy = calculateAirdropRewardWei(18, distributedWei);

    expect(policy.halvingCount).toBe(100);
    expect(policy.rewardWei).toBe(ethers.parseUnits("1000", 18));
  });

  it("normalizes invalid stored totals to zero", () => {
    expect(normalizeAirdropDistributedWei(undefined)).toBe(0n);
    expect(normalizeAirdropDistributedWei("not-a-number")).toBe(0n);
  });
});
