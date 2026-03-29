import { ethers } from "ethers";

export class ChainClient {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;

  constructor(rpcUrl: string, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }

  getWalletAddress(): string {
    return this.signer.address.toLowerCase();
  }

  async getBalance(address: string, contractAddress: string): Promise<bigint> {
    const contract = new ethers.Contract(contractAddress, ["function balanceOf(address) view returns (uint256)"], this.provider);
    return await contract.balanceOf(address);
  }

  async getDecimals(contractAddress: string, fallback = 18): Promise<number> {
    try {
      const contract = new ethers.Contract(contractAddress, ["function decimals() view returns (uint8)"], this.provider);
      const value = await contract.decimals();
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
    } catch {
      return fallback;
    }
  }

  parseUnits(amount: string, decimals: number): bigint {
    return ethers.parseUnits(String(amount || "0"), decimals);
  }

  formatUnits(amount: bigint, decimals: number): string {
    return ethers.formatUnits(amount, decimals);
  }

  async transfer(to: string, amount: bigint, contractAddress: string): Promise<ethers.TransactionResponse> {
    const contract = new ethers.Contract(contractAddress, ["function transfer(address, uint256) public returns (bool)"], this.signer);
    return await contract.transfer(to, amount);
  }

  async adminTransfer(from: string, to: string, amount: bigint, contractAddress: string): Promise<ethers.TransactionResponse> {
    const contract = new ethers.Contract(
      contractAddress,
      ["function adminTransfer(address from, address to, uint256 amount) public"],
      this.signer
    );
    return await contract.adminTransfer(from, to, amount);
  }

  async mint(to: string, amount: bigint, contractAddress: string): Promise<ethers.TransactionResponse> {
    const contract = new ethers.Contract(
      contractAddress,
      ["function mint(address to, uint256 amount) public"],
      this.signer
    );
    return await contract.mint(to, amount);
  }

  async waitForReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    return await this.provider.waitForTransaction(txHash);
  }
}
