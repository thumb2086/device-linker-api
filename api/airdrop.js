import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { address } = req.body;

    // 1. 檢查接收地址是否存在且格式正確
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "請提供有效的收幣錢包地址" });
    }

    // 2. 取得並處理私鑰
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
    }
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }

    // 3. 建立 Provider 與 Wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // 4. 定義合約 ABI (只需要 mint 函數)
    const abi = ["function mint(address to, uint256 amount) external"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // 5. 獲取當前最新的 Nonce
    const nonce = await provider.getTransactionCount(wallet.address, "latest");

    // 6. 設定領取數量 (100 顆，18 位小數)
    const amount = ethers.parseUnits("100", 18);

    console.log(`正在發送 mint 請求至: ${address}`);

    // 7. 執行交易
    // 使用 mint 而不是 transfer
    const tx = await contract.mint(address, amount, {
      nonce: nonce,
      gasLimit: 150000 // Mint 消耗比轉帳高，設定 15 萬比較保險
    });

    console.log(`交易已發送，Hash: ${tx.hash}`);

    // 8. 回傳成功結果
    return res.status(200).json({
      success: true,
      txHash: tx.hash,
      message: "子熙幣增發成功！請稍候在錢包查看餘額",
      scanUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`
    });

  } catch (error) {
    console.error("Airdrop Error:", error);

    // 處理常見錯誤
    let errorMsg = error.message;
    if (error.message.includes("insufficient funds")) {
      errorMsg = "管理員錢包 Sepolia ETH 不足，無法支付手續費";
    } else if (error.message.includes("owner")) {
      errorMsg = "只有合約擁有者(Owner)才能執行 Mint 操作";
    }

    return res.status(500).json({
      success: false,
      error: errorMsg
    });
  }
}