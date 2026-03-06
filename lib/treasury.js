import { ethers } from "ethers";
import { ensureMintWithinCap } from "./token-supply.js";

const TREASURY_MIN_BALANCE = "100000000";
const TREASURY_TOPUP_AMOUNT = "100000000";

export async function ensureTreasuryLiquidity(contract, treasuryAddress, minRequiredWei = 0n) {
    const decimals = await contract.decimals();
    const thresholdWei = ethers.parseUnits(TREASURY_MIN_BALANCE, decimals);
    const topupWei = ethers.parseUnits(TREASURY_TOPUP_AMOUNT, decimals);
    const requiredWei = BigInt(minRequiredWei);
    const targetWei = requiredWei > thresholdWei ? requiredWei : thresholdWei;

    let treasuryBalance = await contract.balanceOf(treasuryAddress);
    let topupCount = 0;
    const txHashes = [];

    while (treasuryBalance < targetWei) {
        await ensureMintWithinCap(contract, topupWei);
        const tx = await contract.mint(treasuryAddress, topupWei, { gasLimit: 200000 });
        treasuryBalance += topupWei;
        topupCount += 1;
        txHashes.push(tx.hash);
    }

    return {
        toppedUp: topupCount > 0,
        topupCount,
        txHash: txHashes.length ? txHashes[txHashes.length - 1] : "",
        txHashes,
        decimals,
        balanceWei: treasuryBalance
    };
}

export async function transferFromTreasuryWithAutoTopup(contract, treasuryAddress, to, amountWei, txOptions) {
    const requiredWei = BigInt(amountWei);
    const state = await ensureTreasuryLiquidity(contract, treasuryAddress, requiredWei);

    const latestBalance = state.balanceWei !== undefined
        ? BigInt(state.balanceWei)
        : BigInt(await contract.balanceOf(treasuryAddress));
    if (latestBalance < requiredWei) {
        throw new Error("treasury balance insufficient");
    }

    if (txOptions) {
        return contract.adminTransfer(treasuryAddress, to, requiredWei, txOptions);
    }
    return contract.adminTransfer(treasuryAddress, to, requiredWei);
}
