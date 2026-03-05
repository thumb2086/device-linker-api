import { ethers } from "ethers";
import { kv } from '@vercel/kv';
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getDemoBalance, isDemoSession } from "../lib/demo.js";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { address, sessionId } = req.body || {};
    if (!address) return res.status(400).json({ error: "missing address" });

    if (sessionId) {
      const sessionData = await kv.get(`session:${sessionId}`);
      if (isDemoSession(sessionData) && sessionData.address === String(address).toLowerCase()) {
        const balance = await getDemoBalance(address);
        return res.status(200).json({ success: true, balance: String(balance), decimals: "18", mode: "demo" });
      }
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const abi = [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)"
    ];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

    const [balanceRaw, decimals] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals()
    ]);

    return res.status(200).json({
      success: true,
      balance: ethers.formatUnits(balanceRaw, decimals),
      decimals: decimals.toString(),
      mode: "live"
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
