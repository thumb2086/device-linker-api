import { ethers } from "ethers";
import { RPC_URL, CONTRACT_ADDRESS, ADMIN_WALLET_ADDRESS } from "./config.js";
import { sendManagedContractTx } from "./admin-chain.js";
import { transferFromTreasuryWithAutoTopup } from "./treasury.js";

/**
 * A centralized service to handle all game settlements.
 * Decouples game logic from on-chain execution.
 */
class SettlementService {
    constructor() {
        this._provider = null;
        this._adminWallet = null;
        this._contract = null;
        this._decimals = null;
        this._lossPoolAddress = null;
    }

    _ensureInitialized() {
        if (!this._provider) {
            this._provider = new ethers.JsonRpcProvider(RPC_URL);
        }
        if (!this._adminWallet) {
            let privateKey = process.env.ADMIN_PRIVATE_KEY || "";
            if (privateKey && !privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
            this._adminWallet = new ethers.Wallet(privateKey, this._provider);
        }
        if (!this._contract) {
            this._contract = new ethers.Contract(CONTRACT_ADDRESS, [
                "function adminTransfer(address from, address to, uint256 amount) public",
                "function decimals() view returns (uint8)",
                "function balanceOf(address) view returns (uint256)"
            ], this._adminWallet);
        }
        if (!this._lossPoolAddress) {
            this._lossPoolAddress = process.env.LOSS_POOL_ADDRESS || this._adminWallet.address;
        }
    }

    get provider() {
        this._ensureInitialized();
        return this._provider;
    }

    get contract() {
        this._ensureInitialized();
        return this._contract;
    }

    get lossPoolAddress() {
        this._ensureInitialized();
        return this._lossPoolAddress;
    }

    async getDecimals() {
        this._ensureInitialized();
        if (this._decimals === null) {
            try {
                this._decimals = await this._contract.decimals();
            } catch (error) {
                console.error("Failed to fetch decimals, defaulting to 18", error);
                this._decimals = 18n;
            }
        }
        return this._decimals;
    }

    /**
     * Executes a complete settlement: deducts bet and pays out winnings.
     */
    async settle({ userAddress, betWei, payoutWei, source, meta = {} }) {
        this._ensureInitialized();
        const results = {
            betTxHash: null,
            payoutTxHash: null,
            betTransferred: false,
            success: false,
            error: null
        };

        try {
            // 1. Deduct Bet (User -> Loss Pool)
            if (betWei > 0n) {
                const betTx = await sendManagedContractTx(
                    this._contract, 
                    "adminTransfer", 
                    [userAddress, this._lossPoolAddress, betWei], 
                    { txSource: source, txMeta: { ...meta, stage: "bet" } }
                );
                results.betTxHash = betTx.hash;
                results.betTransferred = true;
            } else {
                results.betTransferred = true;
            }

            // 2. Pay Out (Loss Pool/Treasury -> User)
            if (payoutWei > 0n) {
                const payoutTx = await transferFromTreasuryWithAutoTopup(
                    this._contract,
                    this._lossPoolAddress,
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
            const wrappedError = new Error(error.message);
            wrappedError.results = results;
            throw wrappedError;
        }
    }
}

// Single instance, but initialization is deferred until first call.
export const settlementService = new SettlementService();
