import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "缺少地址" });

        // 核心防禦：先轉小寫，再由 ethers 正規化
        const cleanAddress = ethers.getAddress(address.toLowerCase());
        const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const abi = ["function balanceOf(address owner) view returns (uint256)"];
        const contract = new ethers.Contract(cleanContract, abi, provider);

        const balance = await contract.balanceOf(cleanAddress);
        return res.status(200).json({
            success: true,
            balance: ethers.formatUnits(balance, 18)
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}