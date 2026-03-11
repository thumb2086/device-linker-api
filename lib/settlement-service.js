import { ethers } from "ethers";
import { RPC_URL, CONTRACT_ADDRESS, ADMIN_WALLET_ADDRESS } from "./config.js";
import { sendManagedContractTx } from "./admin-chain.js";
import { transferFromTreasuryWithAutoTopup } from "./treasury.js";

/**
 * A centralized service to handle all game settlements.
 * Decouples game logic from on-chain execution.
 */
export class SettlementService {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(RPC_URL);
        this.adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, this.provider);
        this.lossPoolAddress = process.env.LOSS_POOL_ADDRESS || this.adminWallet.address;
        
        this.contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)"
        ], this.adminWallet);
        
        this._decimals = null;
    }

    async getDecimals() {
        if (this._decimals === null) {
            try {
                this._decimals = await this.contract.decimals();
            } catch (error) {
                console.error("Failed to fetch decimals, defaulting to 18", error);
                this._decimals = 18n;
            }
        }
        return this._decimals;
    }

    /**
     * Executes a complete settlement: deducts bet and pays out winnings.
     * @param {Object} params - Settlement parameters.
     * @param {string} params.userAddress - The player's address.
     * @param {bigint} params.betWei - The amount to deduct.
     * @param {bigint} params.payoutWei - The amount to pay out.
     * @param {string} params.source - The game source (e.g., 'slots', 'roulette').
     * @param {Object} params.meta - Additional metadata for logs.
     * @returns {Promise<Object>} The transaction result hashes.
     */
    async settle({ userAddress, betWei, payoutWei, source, meta = {} }) {
        const results = {
            betTxHash: null,
            payoutTxHash: null,
            success: false,
            error: null
        };

        try {
            // 1. Deduct Bet (User -> Loss Pool)
            if (betWei > 0n) {
                const betTx = await sendManagedContractTx(
                    this.contract, 
                    "adminTransfer", 
                    [userAddress, this.lossPoolAddress, betWei], 
                    { txSource: source, txMeta: { ...meta, stage: "bet" } }
                );
                results.betTxHash = betTx.hash;
            }

            // 2. Pay Out (Loss Pool/Treasury -> User)
            if (payoutWei > 0n) {
                const payoutTx = await transferFromTreasuryWithAutoTopup(
                    this.contract,
                    this.lossPoolAddress,
                    userAddress,
                    payoutWei,
                    { txSource: source, txMeta: { ...meta, stage: "payout" } }
                );
                results.payoutTxHash = payoutTx.hash;
            }

            results.success = true;
            return results;

        } catch (error) {
            results.error = error.message;
            throw error; // Let the game handler decide how to handle the failure (e.g., failed_payout state)
        }
    }
}

export const settlementService = new SettlementService();
