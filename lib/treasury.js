import { ethers } from "ethers";
import { MAX_TOKEN_SUPPLY } from "./config.js";

const TREASURY_MIN_BALANCE = "10000000";
const TREASURY_TOPUP_AMOUNT = "10000000";

export async function ensureTreasuryLiquidityForWin(contract, treasuryAddress) {
    const decimals = await contract.decimals();
    const thresholdWei = ethers.parseUnits(TREASURY_MIN_BALANCE, decimals);
    const topupWei = ethers.parseUnits(TREASURY_TOPUP_AMOUNT, decimals);

    const treasuryBalance = await contract.balanceOf(treasuryAddress);
    if (treasuryBalance >= thresholdWei) {
        return { toppedUp: false, txHash: "" };
    }

    const capWei = ethers.parseUnits(MAX_TOKEN_SUPPLY, decimals);
    const currentSupply = await contract.totalSupply();
    if (currentSupply + topupWei > capWei) {
        throw new Error("token supply cap exceeded while topping up treasury");
    }

    const tx = await contract.mint(treasuryAddress, topupWei, { gasLimit: 200000 });
    return { toppedUp: true, txHash: tx.hash };
}
