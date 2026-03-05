// api/airdrop.js
import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { calculateAirdropRewardWei } from "../lib/airdrop-policy.js";

const AIRDROP_DISTRIBUTED_WEI_KEY = "airdrop:distributed_wei";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { address } = req.body || {};
    if (!address) {
      return res.status(400).json({ success: false, error: "缺少地址" });
    }
    const cleanAddress = ethers.getAddress(String(address).toLowerCase());
    const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ success: false, error: "缺少 ADMIN_PRIVATE_KEY" });
    }
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
    const wallet = new ethers.Wallet(privateKey, provider);

    const abi = [
      "function mint(address to, uint256 amount) public",
      "function adminTransfer(address from, address to, uint256 amount) public",
      "function decimals() view returns (uint8)",
      "function balanceOf(address) view returns (uint256)",
      "function totalSupply() view returns (uint256)"
    ];
    const contract = new ethers.Contract(cleanContract, abi, wallet);
    const treasuryAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
    const decimals = await contract.decimals();
    const distributedWeiRaw = await kv.get(AIRDROP_DISTRIBUTED_WEI_KEY);
    const distributedWei = BigInt(distributedWeiRaw || "0");
    const policy = calculateAirdropRewardWei(decimals, distributedWei);

    if (policy.rewardWei <= 0n) {
      return res.status(400).json({
        success: false,
        error: "空投總量已達上限",
        distributed: ethers.formatUnits(policy.distributedWei, decimals),
        cap: ethers.formatUnits(policy.capWei, decimals),
        remaining: "0"
      });
    }

    const tx = await transferFromTreasuryWithAutoTopup(
      contract,
      treasuryAddress,
      cleanAddress,
      policy.rewardWei,
      { gasLimit: 220000 }
    );

    const newDistributedWei = policy.distributedWei + policy.rewardWei;
    await kv.set(AIRDROP_DISTRIBUTED_WEI_KEY, newDistributedWei.toString());

    return res.status(200).json({
      success: true,
      txHash: tx.hash,
      reward: ethers.formatUnits(policy.rewardWei, decimals),
      halvingCount: policy.halvingCount,
      distributed: ethers.formatUnits(newDistributedWei, decimals),
      cap: ethers.formatUnits(policy.capWei, decimals),
      remaining: ethers.formatUnits(policy.capWei - newDistributedWei, decimals)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
