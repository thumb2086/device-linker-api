import { ethers } from "ethers";
import { RPC_URL, YJC_CONTRACT_ADDRESS, YJC_TOKEN_DECIMALS } from "./config.js";
import { sendManagedContractTx } from "./admin-chain.js";
import { transferFromTreasuryWithAutoTopup } from "./treasury.js";

const YJC_CONTRACT_ABI = [
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function mint(address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)"
];

class YjcSettlementService {
    constructor() {
        this._provider = null;
        this._wallet = null;
        this._readContract = null;
        this._writeContract = null;
        this._decimals = null;
        this._lossPoolAddress = null;
    }

    _ensureProvider() {
        if (!YJC_CONTRACT_ADDRESS) throw new Error("YJC_CONTRACT_ADDRESS is not configured");
        if (!this._provider) {
            this._provider = new ethers.JsonRpcProvider(RPC_URL);
        }
    }

    _ensureReadContract() {
        this._ensureProvider();
        if (!this._readContract) {
            this._readContract = new ethers.Contract(YJC_CONTRACT_ADDRESS, YJC_CONTRACT_ABI, this._provider);
        }
    }

    _ensureSigner() {
        this._ensureProvider();
        if (!this._wallet) {
            let privateKey = String(process.env.ADMIN_PRIVATE_KEY || "").trim();
            if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY is not configured");
            if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
            this._wallet = new ethers.Wallet(privateKey, this._provider);
        }
        if (!this._writeContract) {
            this._writeContract = new ethers.Contract(YJC_CONTRACT_ADDRESS, YJC_CONTRACT_ABI, this._wallet);
        }
    }

    _ensureLossPoolAddress() {
        if (this._lossPoolAddress) return;
        const rawAddress = String(process.env.YJC_LOSS_POOL_ADDRESS || "").trim();
        if (rawAddress) {
            try {
                this._lossPoolAddress = ethers.getAddress(rawAddress).toLowerCase();
                return;
            } catch {
                throw new Error("YJC_LOSS_POOL_ADDRESS format is invalid");
            }
        }
        this._ensureSigner();
        this._lossPoolAddress = String(this._wallet.address || "").toLowerCase();
    }

    get provider() {
        this._ensureProvider();
        return this._provider;
    }

    get contract() {
        this._ensureReadContract();
        return this._readContract;
    }

    get writeContract() {
        this._ensureSigner();
        return this._writeContract;
    }

    get lossPoolAddress() {
        this._ensureLossPoolAddress();
        return this._lossPoolAddress;
    }

    async getDecimals() {
        this._ensureReadContract();
        if (this._decimals === null) {
            try {
                const rawDecimals = await this._readContract.decimals();
                const numericDecimals = Number(rawDecimals);
                if (!Number.isFinite(numericDecimals) || numericDecimals < 0) {
                    throw new Error("Invalid decimals");
                }
                this._decimals = numericDecimals;
            } catch (error) {
                console.error("Failed to fetch YJC decimals, defaulting to configured value", error);
                this._decimals = YJC_TOKEN_DECIMALS;
            }
        }
        return this._decimals;
    }

    async settle({ userAddress, betWei, payoutWei, source, meta = {} }) {
        this._ensureSigner();
        this._ensureLossPoolAddress();
        const results = {
            betTxHash: null,
            payoutTxHash: null,
            betTransferred: false,
            success: false,
            error: null
        };

        try {
            const contract = this._writeContract;
            if (betWei > 0n) {
                const betTx = await sendManagedContractTx(
                    contract,
                    "adminTransfer",
                    [userAddress, this._lossPoolAddress, betWei],
                    { txSource: source, txMeta: { ...meta, stage: "bet" } }
                );
                results.betTxHash = betTx.hash;
                results.betTransferred = true;
            } else {
                results.betTransferred = true;
            }

            if (payoutWei > 0n) {
                const payoutTx = await transferFromTreasuryWithAutoTopup(
                    contract,
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

    async mintTo(address, amount, context = {}) {
        const decimals = await this.getDecimals();
        const normalized = Number.isFinite(Number(amount)) ? Math.max(0, Math.floor(Number(amount))) : 0;
        if (normalized <= 0) throw new Error("Mint amount must be greater than 0");
        const weiAmount = ethers.parseUnits(String(normalized), decimals);
        return sendManagedContractTx(
            this.writeContract,
            "mint",
            [address, weiAmount],
            { txSource: context.source || "rewards_exchange_yjc_mint", txMeta: context.meta || {} }
        );
    }
}

export const yjcSettlementService = new YjcSettlementService();
