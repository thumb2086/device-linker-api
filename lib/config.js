// lib/config.js
import "./runtime-warnings.js";
export const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xe3d9af5f15857cb01e0614fa281fcc3256f62050";
export const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const AIRDROP_BASE_REWARD = "100000";    // 基礎獎勵提高到 10 萬
export const AIRDROP_HALVING_STEP = "1000000000"; // 每發放 10 億獎勵減半
export const AIRDROP_MIN_REWARD = "10";         // 最低獎勵提高到 10

// 管理員錢包地址
export const ADMIN_WALLET_ADDRESS = (process.env.ADMIN_WALLET_ADDRESS || "0xDBBD3c856859268E27Df4874A464468f41Cb542a").toLowerCase();
