// api/airdrop.js
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL, MAX_TOKEN_SUPPLY } from "../lib/config.js";
import { kv } from "@vercel/kv";
import { applyDemoBalanceDelta, isDemoSession } from "../lib/demo.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { address, sessionId } = req.body || {};
    const cleanAddress = ethers.getAddress(address.toLowerCase());

    if (sessionId) {
      const sessionData = await kv.get(`session:${sessionId}`);
      if (isDemoSession(sessionData) && sessionData.address === cleanAddress.toLowerCase()) {
        await applyDemoBalanceDelta(cleanAddress, 100);
        return res.status(200).json({ success: true, txHash: "demo-airdrop" });
      }
    }

    const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
    const wallet = new ethers.Wallet(privateKey, provider);

    const abi = [
      "function adminTransfer(address from, address to, uint256 amount) public",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)"
    ];
    const contract = new ethers.Contract(cleanContract, abi, wallet);

    const treasuryAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
    const decimals = await contract.decimals();
    const amountWei = ethers.parseUnits("100", decimals);

    const currentSupply = await contract.totalSupply();
    const capWei = ethers.parseUnits(MAX_TOKEN_SUPPLY, decimals);
    if (currentSupply > capWei) {
      return res.status(400).json({ success: false, error: "token supply exceeds cap" });
    }

    const tx = await contract.adminTransfer(treasuryAddress, cleanAddress, amountWei);
    return res.status(200).json({ success: true, txHash: tx.hash });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
