import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 從 App 的請求內容中獲取使用者的錢包地址
    const { address } = req.body;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ success: false, error: "請提供有效的錢包地址" });
    }

    // 1. 初始化 Provider 與管理員錢包
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY 未設定");
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
    const wallet = new ethers.Wallet(privateKey, provider);

    // 2. 定義新合約的 mint 函數
    const abi = ["function mint(address to, uint256 amount) public"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // 3. 設定領取數量：100 顆 (考慮到 18 位小數)
    const amount = ethers.parseUnits("100", 18);

    // 取得最新 Nonce 避免交易卡住
    const nonce = await provider.getTransactionCount(wallet.address, "latest");

    console.log(`正在為地址 ${address} 領取 100 顆子熙幣...`);

    // 4. 執行增發交易
    const tx = await contract.mint(address, amount, {
      nonce: nonce,
      gasLimit: 120000
    });

    // 5. 回傳結果給 App
    return res.status(200).json({
      success: true,
      txHash: tx.hash,
      message: "100 顆子熙幣已發送！",
      scanUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`
    });

  } catch (error) {
    console.error("Airdrop 錯誤:", error);
    return res.status(500).json({
      success: false,
      message: error.reason || error.message || "領取失敗，請聯絡管理員"
    });
  }
}