export const DEFAULT_TREASURY_ADDRESS = "0x0C10F32a118995dA367a17802AB8018C1B656725";

export interface OnChainConfig {
  rpcUrl: string;
  adminPrivateKey: string;
  treasuryAddress: string;
}

export function getOnChainConfig(): OnChainConfig {
  return {
    rpcUrl: String(process.env.RPC_URL || ""),
    adminPrivateKey: String(process.env.ADMIN_PRIVATE_KEY || ""),
    treasuryAddress: String(
      process.env.TREASURY_ADDRESS ||
      DEFAULT_TREASURY_ADDRESS
    ).toLowerCase(),
  };
}
