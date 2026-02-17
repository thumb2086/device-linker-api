import { ethers } from "ethers";

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
    // ⚠️ 請確保這裡手寫的地址是正確的 0x 開頭，不要有空格
    const contractAddress = "你的合約地址";
    if (!ethers.isAddress(contractAddress)) {
      throw new Error(`合約地址格式錯誤: ${contractAddress}`);
    }

    // 設定網路
    const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
    const wallet = new ethers.Wallet(privateKey, provider);

    // --- 4. 建立合約實例 ---
    const abi = ["function mint(address to, uint256 amount) public"];
    const contract = new ethers.Contract(contractAddress, abi, wallet);

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
