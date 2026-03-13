import { ethers } from "ethers";
import { RPC_URL, YJC_CONTRACT_ADDRESS, YJC_TOKEN_DECIMALS } from "./config.js";
import { sendManagedContractTx } from "./admin-chain.js";

class YjcSettlementService {
    constructor() {
        this._provider = null;
        this._adminWallet = null;
        this._writeContract = null;
    }

    _ensureProvider() {
        if (!this._provider) this._provider = new ethers.JsonRpcProvider(RPC_URL);
    }

    _ensureSigner() {
        this._ensureProvider();
        if (!YJC_CONTRACT_ADDRESS) {
            throw new Error("YJC_CONTRACT_ADDRESS is not configured");
        }
        if (!this._adminWallet) {
            let privateKey = String(process.env.ADMIN_PRIVATE_KEY || "").trim();
            if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY is not configured");
            if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
            this._adminWallet = new ethers.Wallet(privateKey, this._provider);
        }
        if (!this._writeContract) {
            this._writeContract = new ethers.Contract(YJC_CONTRACT_ADDRESS, [
                "function mint(address to, uint256 amount) public"
            ], this._adminWallet);
        }
    }

    async mintTo(address, amount, { source = "yjc_mint", meta = {} } = {}) {
        this._ensureSigner();
        const normalizedAddress = ethers.getAddress(String(address || "").trim());
        const normalizedAmount = Math.max(0, Math.floor(Number(amount || 0)));
        if (normalizedAmount <= 0) throw new Error("Mint amount must be greater than 0");
        const mintWei = ethers.parseUnits(String(normalizedAmount), YJC_TOKEN_DECIMALS);
        return sendManagedContractTx(
            this._writeContract,
            "mint",
            [normalizedAddress, mintWei],
            { txSource: source, txMeta: { ...meta, stage: "mint", token: "YJC" } }
        );
    }
}

export const yjcSettlementService = new YjcSettlementService();
