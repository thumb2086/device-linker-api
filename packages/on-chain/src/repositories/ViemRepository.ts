import { ethers } from "ethers";
import type { OnChainRepository } from "./onchain-repository.js";
import type { TransactionResult } from "../types/index.js";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function adminTransfer(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

export class ViemRepository implements OnChainRepository {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;

  constructor(private rpcUrl: string, private adminPrivateKey: string, private chainId = 0) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(adminPrivateKey, this.provider);
  }

  async getDecimals(tokenAddress: string): Promise<number> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
    return Number(await contract.decimals());
  }

  async getBalance(address: string, tokenAddress: string): Promise<bigint> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
    return BigInt((await contract.balanceOf(address)).toString());
  }

  async adminTransfer(params: { from: string; to: string; amount: string; tokenAddress: string }): Promise<TransactionResult> {
    const decimals = await this.getDecimals(params.tokenAddress);
    const amountWei = ethers.parseUnits(params.amount, decimals);
    const contract = new ethers.Contract(params.tokenAddress, ERC20_ABI, this.signer);
    const tx = await contract.adminTransfer(params.from, params.to, amountWei);
    const receipt = await tx.wait();
    return {
      txHash: tx.hash,
      chainId: this.chainId || Number((await this.provider.getNetwork()).chainId),
      confirmed: receipt?.status === 1,
    };
  }
}
