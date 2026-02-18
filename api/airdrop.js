import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
  // 僅允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { address } = req.body;

    // 1. 驗證接收者地址
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "無效的接收者錢包地址" });
    }

    // 2. 取得私鑰環境變數
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

    // 3. 初始化 Provider (支援 v5/v6)
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // 4. 定義標準 ERC-20 transfer 介面
    const abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // 5. 【關鍵優化】強制獲取最新的 Nonce，避免交易衝突
    const nonce = await provider.getTransactionCount(wallet.address, "latest");

    // 6. 設定金額 (發送 100 顆子熙幣，18 位數)
    // 這裡使用相容語法：ethers.parseUnits (v6) 或 ethers.utils.parseUnits (v5)
    const amount = ethers.parseUnits ? ethers.parseUnits("100", 18) : ethers.utils.parseUnits("100", 18);

    // 7. 執行交易
    // 使用 transfer 而非 mintTo，因為你是從發行者錢包轉帳出去
    const tx = await contract.transfer(address, amount, {
      nonce: nonce,
      gasLimit: 80000 // 標準轉帳約 6.5 萬 gas，設定 8 萬很安全
    });

    // 8. 回傳成功 (不等待 tx.wait() 以避免 Vercel 逾時)
    return res.status(200).json({
      success: true,
      txHash: tx.hash,
      message: "子熙幣已送出，請稍候在區塊鏈瀏覽器查看"
    });

  } catch (error) {
    console.error("Airdrop Error:", error);

    // 針對 Nonce 錯誤的友善回傳
    if (error.message.includes("already known") || error.message.includes("nonce too low")) {
      return res.status(200).json({
        success: true,
        message: "交易已在隊列中，請勿重複點擊"
      });
    }

    // 針對手續費不足的提示
    if (error.message.includes("insufficient funds")) {
      return res.status(500).json({
        success: false,
        error: "管理員錢包 Sepolia ETH 餘額不足，無法支付手續費"
      });
    }

    return res.status(500).json({
      success: false,
      error: error.reason || error.message
    });
  }
}