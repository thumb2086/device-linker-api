import { ethers } from "ethers";

export class ChainClient {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;

  constructor(rpcUrl: string, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }

  async getBalance(address: string, contractAddress: string): Promise<bigint> {
    const contract = new ethers.Contract(contractAddress, ["function balanceOf(address) view returns (uint256)"], this.provider);
    return await contract.balanceOf(address);
  }

  async transfer(to: string, amount: bigint, contractAddress: string): Promise<ethers.TransactionResponse> {
    const contract = new ethers.Contract(contractAddress, ["function transfer(address, uint256) public returns (bool)"], this.signer);
    return await contract.transfer(to, amount);
  }
}
