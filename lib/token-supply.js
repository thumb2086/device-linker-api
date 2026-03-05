import { ethers } from "ethers";
import { MAX_TOKEN_SUPPLY } from "./config.js";

export async function ensureMintWithinCap(contract, mintAmountWei) {
    const [decimals, totalSupply] = await Promise.all([
        contract.decimals(),
        contract.totalSupply()
    ]);

    const capWei = ethers.parseUnits(MAX_TOKEN_SUPPLY, decimals);
    const mintWei = BigInt(mintAmountWei);

    if (totalSupply + mintWei > capWei) {
        throw new Error("token supply cap exceeded");
    }
}

export async function mintWithCap(contract, to, mintAmountWei, txOptions) {
    await ensureMintWithinCap(contract, mintAmountWei);
    if (txOptions) {
        return contract.mint(to, mintAmountWei, txOptions);
    }
    return contract.mint(to, mintAmountWei);
}
