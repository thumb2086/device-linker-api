// api/airdrop.js
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { address } = req.body;
    const cleanAddress = ethers.getAddress(address.toLowerCase());
    const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
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
    const amountWei = ethers.parseUnits("100", decimals);
    const tx = await transferFromTreasuryWithAutoTopup(contract, treasuryAddress, cleanAddress, amountWei, { gasLimit: 200000 });
    return res.status(200).json({ success: true, txHash: tx.hash });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
