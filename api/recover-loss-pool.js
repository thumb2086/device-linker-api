import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

const DEFAULT_RECOVERY_TO = "0x8fDCB5E955B225c6ee62b6DDcd21013c5F4786c2";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const fromAddress = (req.body && req.body.fromAddress) || process.env.LEGACY_LOSS_ADDRESS || "0x000000000000000000000000000000000000dEaD";

        const incomingKey = req.headers['x-admin-key'] || (req.body && req.body.adminKey);
        const sessionId = req.body && req.body.sessionId;
        const configuredOperator = (process.env.ADMIN_RECOVERY_ADDRESS || DEFAULT_RECOVERY_TO).toLowerCase();

        let authorized = false;
        let authMode = "";
        let toAddress = null;

        if (sessionId) {
            const sessionData = await kv.get(`session:${sessionId}`);
            if (sessionData && sessionData.address) {
                const sessionAddress = ethers.getAddress(sessionData.address).toLowerCase();
                const requestedAddress = req.body && req.body.toAddress
                    ? ethers.getAddress(req.body.toAddress).toLowerCase()
                    : sessionAddress;

                if (sessionAddress === configuredOperator && requestedAddress === sessionAddress) {
                    authorized = true;
                    authMode = "session";
                    toAddress = requestedAddress;
                }
            }
        }

        if (!authorized) {
            const adminApiKey = process.env.ADMIN_API_KEY;
            if (!adminApiKey) {
                return res.status(500).json({ error: '伺服器未設定 ADMIN_API_KEY（且 session 未通過）' });
            }
            if (incomingKey !== adminApiKey) {
                return res.status(401).json({ error: '未授權' });
            }
            authorized = true;
            authMode = "api-key";
            toAddress = (req.body && req.body.toAddress) || process.env.LOSS_POOL_ADDRESS || DEFAULT_RECOVERY_TO;
        }

        const contract = new ethers.Contract(
            CONTRACT_ADDRESS,
            [
                "function adminTransfer(address from, address to, uint256 amount) public",
                "function balanceOf(address owner) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ],
            wallet
        );

        let decimals = 18n;
        try { decimals = await contract.decimals(); } catch (e) {}

        let amountWei;
        if (req.body && req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== "") {
            amountWei = ethers.parseUnits(req.body.amount.toString(), decimals);
        } else {
            amountWei = await contract.balanceOf(fromAddress);
        }

        if (amountWei <= 0n) {
            return res.status(400).json({ error: '來源地址沒有可回收餘額' });
        }

        const tx = await contract.adminTransfer(fromAddress, toAddress, amountWei, { gasLimit: 220000 });

        return res.status(200).json({
            success: true,
            authMode,
            fromAddress,
            toAddress,
            amount: ethers.formatUnits(amountWei, decimals),
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
