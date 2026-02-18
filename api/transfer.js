import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { from, to, amount, signature } = req.body;

    try {
        const cleanFrom = ethers.getAddress(from.toLowerCase());
        const cleanTo = ethers.getAddress(to.toLowerCase());
        const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
        const wallet = new ethers.Wallet(privateKey, provider);

        // 驗證簽名 (這裡的簽名驗證也建議使用正規化後的地址比較)
        const message = `transfer:${to}:${amount}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== cleanFrom.toLowerCase()) {
            return res.status(401).json({ error: "簽名驗證失敗" });
        }

        const abi = ["function adminTransfer(address from, address to, uint256 amount) public"];
        const contract = new ethers.Contract(cleanContract, abi, wallet);

        const tx = await contract.adminTransfer(cleanFrom, cleanTo, ethers.parseUnits(amount.toString(), 18));
        return res.status(200).json({ success: true, txHash: tx.hash });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}