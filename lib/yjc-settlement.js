import { ethers } from "ethers";
import { RPC_URL, YJC_CONTRACT_ADDRESS, YJC_TOKEN_DECIMALS } from "./config.js";
import { sendManagedContractTx } from "./admin-chain.js";

class YjcSettlementService {
    constructor() {
        this._provider = null;
        this._wallet = null;
        this._contract = null;
    }

    _ensure() {
        if (!YJC_CONTRACT_ADDRESS) throw new Error("YJC_CONTRACT_ADDRESS is not configured");
        if (!this._provider) this._provider = new ethers.JsonRpcProvider(RPC_URL);
        if (!this._wallet) {
            let privateKey = String(process.env.ADMIN_PRIVATE_KEY || "").trim();
            if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY is not configured");
            if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
            this._wallet = new ethers.Wallet(privateKey, this._provider);
        }
        if (!this._contract) {
            this._contract = new ethers.Contract(YJC_CONTRACT_ADDRESS, [
                "function mint(address to, uint256 amount) public"
            ], this._wallet);
        }
    }

    async mintTo(address, amount, context = {}) {
        this._ensure();
        const normalized = Number.isFinite(Number(amount)) ? Math.max(0, Math.floor(Number(amount))) : 0;
        if (normalized <= 0) throw new Error("Mint amount must be greater than 0");
        const weiAmount = ethers.parseUnits(String(normalized), YJC_TOKEN_DECIMALS);
        return sendManagedContractTx(
            this._contract,
            "mint",
            [address, weiAmount],
            { txSource: context.source || "rewards_exchange_yjc_mint", txMeta: context.meta || {} }
        );
    }
}

export const yjcSettlementService = new YjcSettlementService();
