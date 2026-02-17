import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { address } = req.body;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "無效的接收者錢包地址", received: address });
    }

    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

    if (!ethers.isAddress(CONTRACT_ADDRESS)) {
      throw new Error(`合約地址格式錯誤: ${CONTRACT_ADDRESS}`);
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // --- ✅ 修正 1: 這裡要改成 mintTo 而不是 mint ---
    const abi = ["function mintTo(address to, uint256 amount) external"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // --- ✅ 修正 2: 使用 parseUnits 設定發送數量 (例如發送 100 顆) ---
    const amount = ethers.parseUnits("100", 18);

    // --- ✅ 修正 3: 呼叫 contract.mintTo ---
    const tx = await contract.mintTo(address, amount);

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
      details: error.reason || error.message // error.reason 通常能顯示合約報錯原因
    });
  }
} import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { address } = req.body;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: "無效的接收者錢包地址", received: address });
    }

    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

    if (!ethers.isAddress(CONTRACT_ADDRESS)) {
      throw new Error(`合約地址格式錯誤: ${CONTRACT_ADDRESS}`);
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // --- ✅ 修正 1: 這裡要改成 mintTo 而不是 mint ---
    const abi = ["function mintTo(address to, uint256 amount) external"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // --- ✅ 修正 2: 使用 parseUnits 設定發送數量 (例如發送 100 顆) ---
    const amount = ethers.parseUnits("100", 18);

    // --- ✅ 修正 3: 呼叫 contract.mintTo ---
    const tx = await contract.mintTo(address, amount);

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
      details: error.reason || error.message // error.reason 通常能顯示合約報錯原因
    });
  }
}