const { ethers } = require("ethers");

export default async function handler(req, res) {
  // 1. 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: "Missing recipient address" });
    }

    // 2. 設定 Base Sepolia 網路 (Base 官方 RPC)
    const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
    
    // 3. 從 Vercel 環境變數讀取私鑰
    const privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("ADMIN_PRIVATE_KEY is not defined in Vercel settings.");
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // 4. 合約資訊 (請根據你的 Remix 合約修改 ABI)
    const CONTRACT_ADDRESS = "YOUR_CONTRACT_ADDRESS_HERE"; // <--- 修改這裡
    const abi = [
      "function mint(address to, uint256 amount) public",
      "function balanceOf(address account) public view returns (uint256)"
    ];
    
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    // 5. 執行 Mint (發送 100 顆，假設你的代幣有 18 位小數)
    const amount = ethers.parseUnits("100", 18);
    // Note: ensure your contract has a mint function that takes (address, uint256)
    const tx = await contract.mint(address, amount);
    
    // 6. 等待交易確認 (這可能需要幾秒鐘)
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      message: "Airdrop sent successfully!",
      txHash: receipt.hash
    });

  } catch (error) {
    console.error("Airdrop error:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  }
}
