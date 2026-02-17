import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { address } = req.body;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "無效的接收者錢包地址" });
    }

    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // 確定使用 mintTo，並與你的 Solidity 合約對齊
    const abi = ["function mintTo(address to, uint256 amount) external"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // 發放 100 顆代幣
    const amount = ethers.parseUnits("100", 18);
    const tx = await contract.mintTo(address, amount);

    // 如果不想要 Vercel 等太久導致 Timeout，可以不 wait 或只 wait 1 個確認
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash
    });

  } catch (error) {
    console.error("Airdrop Error:", error);
    return res.status(500).json({
      success: false,
      error: error.reason || error.message
    });
  }
}