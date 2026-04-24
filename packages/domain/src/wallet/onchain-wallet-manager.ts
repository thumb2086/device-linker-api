import { ethers } from "ethers";
import type { TokenSymbol } from "@repo/shared";

export type OnchainTokenKey = "zhixi" | "yjc";
export type RequestTokenKey = OnchainTokenKey;

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
const DEFAULT_ZXC_CONTRACT_ADDRESS = "0xe3d9af5f15857cb01e0614fa281fcc3256f62050";
const DEFAULT_YJC_CONTRACT_ADDRESS = "0x82d6adb17d58820324d86b378775350d03a071ae";
const DEFAULT_ADMIN_WALLET_ADDRESS = "0xdbbd3c856859268e27df4874a464468f41cb542a";

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

export function requestTokenToSymbol(token: RequestTokenKey): TokenSymbol {
  return token === "yjc" ? "YJC" : "ZXC";
}

export function tokenSymbolToOnchainKey(token: TokenSymbol): OnchainTokenKey {
  switch (token) {
    case "ZXC":
      return "zhixi";
    case "YJC":
      return "yjc";
    default:
      throw new Error(`UNSUPPORTED_TOKEN: ${String(token)}`);
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
    const adminWalletAddress = normalizeAddress(
      String(process.env.ADMIN_WALLET_ADDRESS || DEFAULT_ADMIN_WALLET_ADDRESS)
    );

    const zxcContractAddress = normalizeAddress(
      String(process.env.ZXC_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS || DEFAULT_ZXC_CONTRACT_ADDRESS)
    );
    const yjcContractAddress = normalizeAddress(
      String(process.env.YJC_CONTRACT_ADDRESS || DEFAULT_YJC_CONTRACT_ADDRESS)
    );

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

  convertYjcToZxc(rawAmount: string | number): { requestedYjc: number; yjcAmount: number; zxcAmount: number } {
    const numeric = typeof rawAmount === "number" ? rawAmount : Number(String(rawAmount || "").replace(/,/g, "").trim());
    const requestedYjc = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
    const yjcAmount = requestedYjc;
    const zxcAmount = yjcAmount * ZXC_PER_YJC;
    return { requestedYjc, yjcAmount, zxcAmount };
  }
}
