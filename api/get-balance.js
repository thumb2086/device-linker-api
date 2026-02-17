import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    // 支援 GET (方便測試) 或 POST
    const address = req.method === 'POST' ? req.body.address : req.query.address;

    if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ success: false, error: "請提供正確的錢包地址" });
    }

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        // 只定義我們需要的 balanceOf 函式
        const abi = ["function balanceOf(address owner) view returns (uint256)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

        const balance = await contract.balanceOf(address);
        const formattedBalance = ethers.formatUnits(balance, 18);

        return res.status(200).json({
            success: true,
            address: address,
            balance: formattedBalance
        });
    } catch (error) {
        console.error("Get Balance Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}