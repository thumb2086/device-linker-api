import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { address } = req.body;

    // --- 1. 嚴格檢查接收者地址 ---
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "無效的接收者錢包地址", received: address });
    }

    // --- 2. 檢查並修正環境變數 ---
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

    // --- 3. 檢查合約地址 ---
    if (!ethers.isAddress(CONTRACT_ADDRESS)) {
      throw new Error(`合約地址格式錯誤: ${CONTRACT_ADDRESS} `);
    }

    // 設定網路
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // --- 4. 建立合約實例 ---
    const abi = ["function mint(address to, uint256 amount) public"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // --- 5. 執行交易 ---
    // 使用 parseUnits 確保數量單位正確 (假設是 1 顆，若為無位數 Token 則直接 1)
    const tx = await contract.mint(address, 1);

    console.log("交易已發出:", tx.hash);
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash
    });

  } catch (error) {
    console.error("Debug Error:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  }
}
