export async function ensureMintWithinCap(contract, mintAmountWei) {
    return { contract, mintAmountWei };
}

export async function mintWithCap(contract, to, mintAmountWei, txOptions) {
    await ensureMintWithinCap(contract, mintAmountWei);
    if (txOptions) {
        return contract.mint(to, mintAmountWei, txOptions);
    }
    return contract.mint(to, mintAmountWei);
}
