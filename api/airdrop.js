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
    const abi = ["function mintTo(address to, uint256 amount) external"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // 【優化 1】強制抓取最新 Nonce，解決之前的 "already known" 問題
    const nonce = await provider.getTransactionCount(wallet.address, "latest");

    // 【優化 2】發送交易
    const amount = ethers.parseUnits("100", 18);
    const tx = await contract.mintTo(address, amount, {
      nonce: nonce,
      gasLimit: 120000 // 設定上限防止估算失敗
    });

    // 【關鍵優化 3】不使用 tx.wait()！ 
    // 只要拿到 tx.hash，就代表交易已經成功送入排隊隊伍
    return res.status(200).json({
      success: true,
      txHash: tx.hash,
      message: "交易已送出，餘額將在幾秒後更新"
    });

  } catch (error) {
    console.error("Airdrop Error:", error);

    // 如果因為按太快出現 nonce 錯誤，給予友善提示
    if (error.message.includes("already known") || error.message.includes("nonce too low")) {
      return res.status(200).json({ success: true, message: "交易處理中，請稍後刷新" });
    }

    return res.status(500).json({
      success: false,
      error: error.reason || error.message
    });
  }
}