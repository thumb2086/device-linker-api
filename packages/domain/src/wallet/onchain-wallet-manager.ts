import { ethers } from "ethers";

export type OnchainTokenKey = "zhixi" | "yjc";

export interface OnchainTokenRuntime {
  key: OnchainTokenKey;
  symbol: "ZXC" | "YJC";
  contractAddress: string;
  lossPoolAddress: string;
  enabled: boolean;
}

export interface OnchainRuntimeConfig {
  rpcUrl: string;
  adminPrivateKey: string;
  tokens: Record<OnchainTokenKey, OnchainTokenRuntime>;
}

const ZXC_PER_YJC = 100_000_000;

function normalizePrivateKey(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function normalizeAddress(raw: string): string {
  try {
    return ethers.getAddress(String(raw || "").trim()).toLowerCase();
  } catch {
    return "";
  }
}

export class OnchainWalletManager {
  getRuntimeConfig(): OnchainRuntimeConfig {
    const adminPrivateKey = normalizePrivateKey(String(process.env.ADMIN_PRIVATE_KEY || ""));
    const rpcUrl = String(
      process.env.RPC_URL ||
      process.env.PRC ||
      "https://ethereum-sepolia-rpc.publicnode.com"
    ).trim();
    const adminWalletAddress = normalizeAddress(String(process.env.ADMIN_WALLET_ADDRESS || ""));

    const zxcContractAddress = normalizeAddress(
      String(process.env.ZXC_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS || "")
    );
    const yjcContractAddress = normalizeAddress(String(process.env.YJC_CONTRACT_ADDRESS || ""));

    const zxcLossPoolAddress = normalizeAddress(
      String(process.env.LOSS_POOL_ADDRESS || adminWalletAddress || "")
    );
    const yjcLossPoolAddress = normalizeAddress(
      String(process.env.YJC_LOSS_POOL_ADDRESS || adminWalletAddress || "")
    );

    return {
      rpcUrl,
      adminPrivateKey,
      tokens: {
        zhixi: {
          key: "zhixi",
          symbol: "ZXC",
          contractAddress: zxcContractAddress,
          lossPoolAddress: zxcLossPoolAddress,
          enabled: Boolean(rpcUrl && adminPrivateKey && zxcContractAddress),
        },
        yjc: {
          key: "yjc",
          symbol: "YJC",
          contractAddress: yjcContractAddress,
          lossPoolAddress: yjcLossPoolAddress,
          enabled: Boolean(rpcUrl && adminPrivateKey && yjcContractAddress),
        },
      },
    };
  }

  supportsToken(token: OnchainTokenKey): boolean {
    return this.getRuntimeConfig().tokens[token].enabled;
  }

  getTokenRuntime(token: OnchainTokenKey): OnchainTokenRuntime {
    return this.getRuntimeConfig().tokens[token];
  }

  convertZxcToYjc(rawAmount: string | number): { requestedZxc: number; requiredZxc: number; yjcAmount: number } {
    const numeric = typeof rawAmount === "number" ? rawAmount : Number(String(rawAmount || "").replace(/,/g, "").trim());
    const requestedZxc = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
    const yjcAmount = Math.floor(requestedZxc / ZXC_PER_YJC);
    const requiredZxc = yjcAmount * ZXC_PER_YJC;
    return { requestedZxc, requiredZxc, yjcAmount };
  }
}
