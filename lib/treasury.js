import { ethers } from "ethers";
import { ensureMintWithinCap } from "./token-supply.js";
import { sendManagedContractTx } from "./admin-chain.js";

const TREASURY_MIN_BALANCE = String(process.env.TREASURY_MIN_BALANCE || "1000000000000").trim();
const TREASURY_TOPUP_AMOUNT = String(process.env.TREASURY_TOPUP_AMOUNT || TREASURY_MIN_BALANCE).trim();

export async function ensureTreasuryLiquidity(contract, treasuryAddress, minRequiredWei = 0n, txOptions = {}) {
    const decimals = await contract.decimals();
    const thresholdWei = ethers.parseUnits(TREASURY_MIN_BALANCE, decimals);
    const topupWei = ethers.parseUnits(TREASURY_TOPUP_AMOUNT, decimals);
    const requiredWei = BigInt(minRequiredWei);
    const targetWei = requiredWei > thresholdWei ? requiredWei : thresholdWei;

    let treasuryBalance = await contract.balanceOf(treasuryAddress);
    let topupCount = 0;
    const txHashes = [];

    const source = txOptions && txOptions.txSource ? String(txOptions.txSource).trim() : "treasury";
    const meta = txOptions && txOptions.txMeta && typeof txOptions.txMeta === "object" ? txOptions.txMeta : {};

    while (treasuryBalance < targetWei) {
        await ensureMintWithinCap(contract, topupWei);
        const tx = await sendManagedContractTx(contract, "mint", [treasuryAddress, topupWei], {
            gasLimit: 220000,
            txSource: source,
            txMeta: { ...meta, stage: "topup" }
        });
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
    const source = txOptions && txOptions.txSource ? String(txOptions.txSource).trim() : "";
    const meta = txOptions && txOptions.txMeta && typeof txOptions.txMeta === "object" ? txOptions.txMeta : {};
    const state = await ensureTreasuryLiquidity(contract, treasuryAddress, requiredWei, {
        txSource: source || "treasury",
        txMeta: { ...meta, stage: "topup" }
    });

    const latestBalance = state.balanceWei !== undefined
        ? BigInt(state.balanceWei)
        : BigInt(await contract.balanceOf(treasuryAddress));
    if (latestBalance < requiredWei) {
        throw new Error("treasury balance insufficient");
    }

    if (txOptions) {
        return sendManagedContractTx(contract, "adminTransfer", [treasuryAddress, to, requiredWei], txOptions);
    }
    return sendManagedContractTx(contract, "adminTransfer", [treasuryAddress, to, requiredWei]);
}
