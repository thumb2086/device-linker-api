import { kv } from '@vercel/kv';
import { getSession } from "../lib/session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL, AIRDROP_TOTAL_CAP } from "../lib/config.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";

const CORS_METHODS = 'POST, OPTIONS';
const AIRDROP_DISTRIBUTED_WEI_KEY = "airdrop:distributed_wei";
const MAX_TRANSFER_AMOUNT = 100000000;

const CONTRACT_ABI = [
    "function mint(address to, uint256 amount) public",
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)"
];

function normalizeAction(rawAction) {
    return String(rawAction || "summary").trim().toLowerCase();
}

function normalizeAddress(rawAddress, fieldName = "address") {
    try {
        return ethers.getAddress(String(rawAddress || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${fieldName} 格式錯誤`);
    }
}

function normalizeAmount(rawAmount) {
    const normalized = String(rawAmount ?? "").replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
        throw new Error("amount 格式錯誤");
    }

    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        throw new Error("amount 必須大於 0");
    }
    if (numericValue > MAX_TRANSFER_AMOUNT) {
        throw new Error(`amount 過大，單筆上限 ${MAX_TRANSFER_AMOUNT}`);
    }

    return normalized;
}

function jsonError(res, statusCode, error) {
    return res.status(statusCode).json({
        success: false,
        error: (error && error.message) ? error.message : String(error || "未知錯誤")
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', CORS_METHODS);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

    try {
        const body = req.body || {};
        const sessionId = String(body.sessionId || "").trim();
        const action = normalizeAction(body.action);

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "缺少 sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const userAddress = normalizeAddress(session.address, "session address");
        const contractAddress = normalizeAddress(CONTRACT_ADDRESS, "CONTRACT_ADDRESS");

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) {
            return res.status(500).json({ success: false, error: "缺少 ADMIN_PRIVATE_KEY" });
        }
        if (!privateKey.startsWith('0x')) privateKey = `0x${privateKey}`;

        const adminWallet = new ethers.Wallet(privateKey, provider);
        const treasuryAddress = normalizeAddress(process.env.LOSS_POOL_ADDRESS || adminWallet.address, "LOSS_POOL_ADDRESS");
        const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, adminWallet);
        const decimals = await contract.decimals();

        if (action === "summary" || action === "status" || action === "balance") {
            const [userBalanceWei, treasuryBalanceWei, distributedWeiRaw] = await Promise.all([
                contract.balanceOf(userAddress),
                contract.balanceOf(treasuryAddress),
                kv.get(AIRDROP_DISTRIBUTED_WEI_KEY)
            ]);
            const distributedWei = BigInt(String(distributedWeiRaw || "0"));
            const capWei = ethers.parseUnits(AIRDROP_TOTAL_CAP, decimals);
            const remainingWei = capWei > distributedWei ? capWei - distributedWei : 0n;

            return res.status(200).json({
                success: true,
                action: "summary",
                address: userAddress,
                treasuryAddress,
                decimals: String(decimals),
                userBalance: ethers.formatUnits(userBalanceWei, decimals),
                treasuryBalance: ethers.formatUnits(treasuryBalanceWei, decimals),
                airdrop: {
                    distributed: ethers.formatUnits(distributedWei, decimals),
                    cap: ethers.formatUnits(capWei, decimals),
                    remaining: ethers.formatUnits(remainingWei, decimals)
                }
            });
        }

        const amountText = normalizeAmount(body.amount);
        let amountWei;
        try {
            amountWei = ethers.parseUnits(amountText, decimals);
        } catch {
            return res.status(400).json({ success: false, error: "amount 小數位超過 token precision" });
        }
        if (amountWei <= 0n) {
            return res.status(400).json({ success: false, error: "amount 必須大於 0" });
        }

        if (action === "import" || action === "deposit") {
            const tx = await transferFromTreasuryWithAutoTopup(
                contract,
                treasuryAddress,
                userAddress,
                amountWei,
                { gasLimit: 220000 }
            );

            return res.status(200).json({
                success: true,
                action: "import",
                from: treasuryAddress,
                to: userAddress,
                amount: amountText,
                txHash: tx.hash
            });
        }

        if (action === "export" || action === "transfer") {
            let toAddress;
            try {
                toAddress = normalizeAddress(body.to || body.toAddress, "to");
            } catch (error) {
                return jsonError(res, 400, error);
            }

            const userBalanceWei = await contract.balanceOf(userAddress);
            if (userBalanceWei < amountWei) {
                return res.status(400).json({ success: false, error: "餘額不足" });
            }

            const tx = await contract.adminTransfer(userAddress, toAddress, amountWei, { gasLimit: 220000 });
            return res.status(200).json({
                success: true,
                action: "export",
                from: userAddress,
                to: toAddress,
                amount: amountText,
                txHash: tx.hash
            });
        }

        if (action === "withdraw" || action === "cashout") {
            const userBalanceWei = await contract.balanceOf(userAddress);
            if (userBalanceWei < amountWei) {
                return res.status(400).json({ success: false, error: "餘額不足" });
            }

            const tx = await contract.adminTransfer(userAddress, treasuryAddress, amountWei, { gasLimit: 220000 });
            return res.status(200).json({
                success: true,
                action: "withdraw",
                from: userAddress,
                to: treasuryAddress,
                amount: amountText,
                txHash: tx.hash
            });
        }

        return res.status(400).json({
            success: false,
            error: `不支援 action: ${action}`,
            supportedActions: ["summary", "import", "export", "withdraw"]
        });
    } catch (error) {
        return jsonError(res, 500, error);
    }
}
