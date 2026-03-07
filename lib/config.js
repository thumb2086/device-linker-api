// lib/config.js
export const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xe3d9af5f15857cb01e0614fa281fcc3256f62050";
export const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const MAX_TOKEN_SUPPLY = process.env.MAX_TOKEN_SUPPLY || "100000000000";
export const AIRDROP_TOTAL_CAP = "60000000";
export const AIRDROP_BASE_REWARD = "1000";
export const AIRDROP_HALVING_STEP = "10000000";
export const AIRDROP_MIN_REWARD = "1";

// 管理員錢包地址 (請替換為您的實際管理錢包)
export const ADMIN_WALLET_ADDRESS = (process.env.ADMIN_WALLET_ADDRESS || "0x6f69904E85880c50547071988888888888888888").toLowerCase();
