import { ethers } from "ethers";
import { getRewardProfile, saveRewardProfile } from "./reward-center.js";

function toPositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function appliesToScope(buff, scope) {
    const scopes = Array.isArray(buff && buff.eligibleScopes) ? buff.eligibleScopes : [];
    if (!scopes.length) return true;
    return scopes.includes(scope);
}

function usesRemaining(buff) {
    if (!buff) return 0;
    if (buff.remainingUses === null || buff.remainingUses === undefined || buff.remainingUses === "") return Infinity;
    if (!Number.isFinite(Number(buff.remainingUses))) return 0;
    return Number(buff.remainingUses);
}

function hasRemainingBonusCap(buff) {
    return buff && buff.remainingMaxBonus !== null && buff.remainingMaxBonus !== undefined && buff.remainingMaxBonus !== "";
}

export async function persistSettlementBuffProfile(profile) {
    if (!profile || !profile.address) return null;
    return saveRewardProfile(profile);
}

export async function applySettlementBuffs({
    address,
    betWei,
    payoutWei,
    netWei,
    decimals,
    scope = "solo",
    profile: existingProfile = null,
    persist = true
}) {
    const profile = existingProfile || await getRewardProfile(address);
    const activeBuffs = Array.isArray(profile.activeBuffs) ? profile.activeBuffs : [];
    const effects = [];
    let changed = false;
    let nextPayoutWei = payoutWei;
    let nextNetWei = netWei;

    if (nextNetWei > 0n) {
        const profitBuff = activeBuffs.find((buff) => buff.effectType === "profit_boost" && appliesToScope(buff, scope));
        if (profitBuff) {
            const baseProfitWei = nextPayoutWei - betWei;
            const multiplier = Math.max(1, Number(profitBuff.multiplier || 1));
            let bonusWei = multiplier > 1 ? (baseProfitWei * BigInt(Math.round((multiplier - 1) * 100))) / 100n : 0n;
            const remainingCap = hasRemainingBonusCap(profitBuff)
                ? toPositiveNumber(profitBuff.remainingMaxBonus)
                : toPositiveNumber(profitBuff.maxBonus);
            if (bonusWei > 0n && remainingCap > 0) {
                const remainingCapWei = ethers.parseUnits(String(remainingCap), decimals);
                if (bonusWei > remainingCapWei) bonusWei = remainingCapWei;
                const nextRemainingCapWei = remainingCapWei - bonusWei;
                profitBuff.remainingMaxBonus = Number(ethers.formatUnits(nextRemainingCapWei, decimals));
                changed = true;
                if (nextRemainingCapWei <= 0n) {
                    profitBuff.expiresAt = new Date(0).toISOString();
                }
            }
            if (bonusWei > 0n) {
                nextPayoutWei += bonusWei;
                nextNetWei += bonusWei;
                effects.push({
                    type: "profit_boost",
                    bonusWei,
                    multiplier
                });
                changed = true;
            }
        }
    }

    if (nextNetWei < 0n) {
        const shieldBuff = activeBuffs.find((buff) => buff.effectType === "loss_shield" && appliesToScope(buff, scope) && usesRemaining(buff) > 0);
        if (shieldBuff) {
            const currentLossWei = -nextNetWei;
            let protectedWei = currentLossWei;
            const maxProtectedLoss = toPositiveNumber(shieldBuff.maxProtectedLoss);
            if (maxProtectedLoss > 0) {
                const maxProtectedWei = ethers.parseUnits(String(maxProtectedLoss), decimals);
                if (protectedWei > maxProtectedWei) protectedWei = maxProtectedWei;
            }
            if (protectedWei > 0n) {
                nextPayoutWei += protectedWei;
                nextNetWei += protectedWei;
                shieldBuff.remainingUses = Math.max(0, usesRemaining(shieldBuff) - 1);
                effects.push({
                    type: "loss_shield",
                    protectedWei
                });
                changed = true;
            }
        }
    }

    if (changed) {
        profile.activeBuffs = activeBuffs.filter((buff) => {
            if (!buff) return false;
            if (buff.effectType === "loss_shield" && usesRemaining(buff) <= 0) return false;
            if (buff.effectType === "profit_boost" && buff.remainingMaxBonus !== null && buff.remainingMaxBonus !== undefined && Number(buff.remainingMaxBonus) <= 0) return false;
            return true;
        });
        if (persist) {
            await saveRewardProfile(profile);
        }
    }

    return {
        payoutWei: nextPayoutWei,
        netWei: nextNetWei,
        effects,
        changed,
        profile
    };
}
