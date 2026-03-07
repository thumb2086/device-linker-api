// api/wallet.js - 聚合錢包功能
import { kv } from '@vercel/kv';
import { getSession } from "../lib/session-store.js";
import { ethers, verify } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL, AIRDROP_TOTAL_CAP } from "../lib/config.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { calculateAirdropRewardWei } from "../lib/airdrop-policy.js";

const AIRDROP_DISTRIBUTED_WEI_KEY = "airdrop:distributed_wei";
const CONTRACT_ABI = [
    "function mint(address to, uint256 amount) public",
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)"
];

// 簽名驗證輔助函數 (來自原 transfer.js)
function toPemFromBase64(base64PublicKey) {
    const wrapped = String(base64PublicKey || "").match(/.{1,64}/g) || [];
    return `-----BEGIN PUBLIC KEY-----\n${wrapped.join("\n")}\n-----END PUBLIC KEY-----`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action, address, sessionId, amount, to, signature, publicKey, isPayout } = req.body;

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const decimals = await readContract.decimals();

        // 1. 不需要 Session 的行動 (例如外部查詢餘額)
        if (action === 'get_balance') {
            if (!address) return res.status(400).json({ error: "缺少地址" });
            const balanceRaw = await readContract.balanceOf(address);
            return res.status(200).json({
                success: true,
                balance: ethers.formatUnits(balanceRaw, decimals),
                decimals: decimals.toString()
            });
        }

        const privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) return res.status(500).json({ error: "ADMIN_PRIVATE_KEY is not configured" });

        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = readContract.connect(wallet);

        // 2. 驗證 Session
        if (!sessionId) return res.status(400).json({ error: "缺少 sessionId" });
        const session = await getSession(sessionId);
        if (!session) return res.status(403).json({ error: "會話過期" });
        const userAddress = session.address;

        // 3. 錢包摘要 (原 wallet.js summary)
        if (action === 'summary') {
            const treasuryAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
            const [userBalanceWei, treasuryBalanceWei, distributedWeiRaw] = await Promise.all([
                contract.balanceOf(userAddress),
                contract.balanceOf(treasuryAddress),
                kv.get(AIRDROP_DISTRIBUTED_WEI_KEY)
            ]);
            const distributedWei = BigInt(String(distributedWeiRaw || "0"));
            const capWei = ethers.parseUnits(AIRDROP_TOTAL_CAP, decimals);
            
            return res.status(200).json({
                success: true,
                userBalance: ethers.formatUnits(userBalanceWei, decimals),
                treasuryBalance: ethers.formatUnits(treasuryBalanceWei, decimals),
                airdrop: {
                    distributed: ethers.formatUnits(distributedWei, decimals),
                    cap: ethers.formatUnits(capWei, decimals),
                    remaining: ethers.formatUnits(capWei > distributedWei ? capWei - distributedWei : 0n, decimals)
                }
            });
        }

        // 4. 空投功能 (原 airdrop.js)
        if (action === 'airdrop') {
            const adminBalanceWei = await contract.balanceOf(wallet.address);
            const totalSupplyWei = await contract.totalSupply();
            const publicDistributedWei = totalSupplyWei > adminBalanceWei ? totalSupplyWei - adminBalanceWei : 0n;
            const policy = calculateAirdropRewardWei(decimals, publicDistributedWei);

            if (policy.rewardWei <= 0n) return res.status(400).json({ error: "空投已達上限" });

            const tx = await transferFromTreasuryWithAutoTopup(contract, wallet.address, userAddress, policy.rewardWei);
            return res.status(200).json({
                success: true,
                txHash: tx.hash,
                reward: ethers.formatUnits(policy.rewardWei, decimals)
            });
        }

        // 5. 轉帳功能 (原 transfer.js - 帶簽名驗證)
        if (action === 'secure_transfer') {
            const cleanTo = ethers.getAddress(to).toLowerCase().replace(/^0x/, "");
            const cleanAmount = amount.toString().trim().replace(/\.0+$/, "");
            const message = `transfer:${cleanTo}:${cleanAmount}`;
            const publicKeyPEM = toPemFromBase64(publicKey);

            const isVerified = verify("sha256", Buffer.from(message, 'utf-8'), { key: publicKeyPEM }, Buffer.from(signature, 'base64'));
            if (!isVerified) return res.status(400).json({ error: "簽名驗證失敗" });

            const amountWei = ethers.parseUnits(cleanAmount, decimals);
            const tx = await contract.adminTransfer(userAddress, ethers.getAddress("0x" + cleanTo), amountWei);
            return res.status(200).json({ success: true, txHash: tx.hash });
        }

        // 6. 提現/充值 (原 wallet.js actions)
        if (action === 'withdraw' || action === 'deposit') {
            const amountWei = ethers.parseUnits(amount.toString(), decimals);
            const treasuryAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
            
            let tx;
            if (action === 'withdraw') {
                tx = await contract.adminTransfer(userAddress, treasuryAddress, amountWei);
            } else {
                tx = await transferFromTreasuryWithAutoTopup(contract, treasuryAddress, userAddress, amountWei);
            }
            return res.status(200).json({ success: true, txHash: tx.hash });
        }

        return res.status(400).json({ error: "無效的 action" });

    } catch (error) {
        console.error("Wallet API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
