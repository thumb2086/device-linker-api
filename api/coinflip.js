import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { verify } from "crypto";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const sessionId = req.query.sessionId || (req.body && req.body.sessionId);
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    if (req.method === 'GET') {
        const result = await kv.get(`game:${sessionId}`);
        return res.status(200).json(result || { status: "waiting" });
    }

    if (req.method === 'POST') {
        const { address, amount, choice, signature, publicKey } = req.body;

        try {
            // 1. 驗證 P-256 簽名
            const cleanAmount = amount.toString().replace(/\.0$/, "");
            const msg = `coinflip:${choice}:${cleanAmount}`;
            const isVerified = verify(
                "sha256",
                Buffer.from(msg, 'utf-8'),
                { key: `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----` },
                Buffer.from(signature, 'base64')
            );
            if (!isVerified) return res.status(400).json({ error: "簽名驗證失敗" });

            // 2. 開獎
            const resultSide = Math.random() > 0.5 ? "heads" : "tails";
            const isWin = (choice === resultSide);

            // 3. 區塊鏈操作
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, [
                "function mint(address to, uint256 amount) public",
                "function adminTransfer(address from, address to, uint256 amount) public"
            ], wallet);

            let tx;
            if (isWin) {
                // 贏了：Mint 2倍 (假設原本要扣 10，直接加 10 也是 2 倍效益，Demo 方便用 Mint)
                tx = await contract.mint(address, ethers.parseUnits((parseFloat(amount) * 2).toString(), 18));
            } else {
                // 輸了：直接銷毀賭注
                tx = await contract.adminTransfer(address, "0x0000000000000000000000000000000000000000", ethers.parseUnits(amount, 18));
            }

            const gameResult = { status: "finished", isWin, resultSide, txHash: tx.hash };
            await kv.set(`game:${sessionId}`, gameResult, { ex: 600 });
            return res.status(200).json(gameResult);

        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
}