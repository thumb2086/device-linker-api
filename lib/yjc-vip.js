import { ethers } from "ethers";
import { RPC_URL, YJC_CONTRACT_ADDRESS, YJC_TOKEN_DECIMALS } from "./config.js";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)"
];

export const YJC_VIP_TIERS = [
    { key: "none", label: "未達 VIP", minBalance: 0, maxBalance: 0, roomAccess: [] },
    { key: "vip1", label: "VIP 1", minBalance: 1, maxBalance: 999, roomAccess: ["table_1"] },
    { key: "vip2", label: "VIP 2", minBalance: 1000, maxBalance: Number.POSITIVE_INFINITY, roomAccess: ["table_1", "table_2"], perks: ["zero_fee"] }
];

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getYjcVipTierByBalance(balance) {
    const amount = Math.max(0, Math.floor(toSafeNumber(balance, 0)));
    if (amount >= 1000) return YJC_VIP_TIERS[2];
    if (amount >= 1) return YJC_VIP_TIERS[1];
    return YJC_VIP_TIERS[0];
}

export function buildYjcVipStatusFromBalance(balance, source = "offchain") {
    const normalizedBalance = Math.max(0, Math.floor(toSafeNumber(balance, 0)));
    const tier = getYjcVipTierByBalance(normalizedBalance);
    return {
        source,
        balance: normalizedBalance,
        tier: {
            key: tier.key,
            label: tier.label,
            roomAccess: Array.isArray(tier.roomAccess) ? [...tier.roomAccess] : [],
            perks: Array.isArray(tier.perks) ? [...tier.perks] : []
        }
    };
}

export async function resolveYjcVipStatus(address) {
    const normalizedAddress = String(address || "").trim();
    if (!normalizedAddress) {
        return { available: false, ...buildYjcVipStatusFromBalance(0, "missing_address") };
    }

    if (!YJC_CONTRACT_ADDRESS) {
        return { available: false, ...buildYjcVipStatusFromBalance(0, "missing_contract") };
    }

    try {
        // Use a timeout to prevent slow RPC from hanging the whole user status
        const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true });
        const contract = new ethers.Contract(YJC_CONTRACT_ADDRESS, ERC20_ABI, provider);

        const balancePromise = contract.balanceOf(normalizedAddress);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RPC Timeout")), 4000)
        );

        const rawBalance = await Promise.race([balancePromise, timeoutPromise]);
        const yjcBalance = Number(ethers.formatUnits(rawBalance, YJC_TOKEN_DECIMALS));
        const normalized = Math.max(0, Math.floor(toSafeNumber(yjcBalance, 0)));
        return { available: true, ...buildYjcVipStatusFromBalance(normalized, "onchain") };
    } catch (error) {
        console.error("resolveYjcVipStatus Error:", error.message);
        return {
            available: false,
            error: error?.message || "resolve_yjc_balance_failed",
            ...buildYjcVipStatusFromBalance(0, "onchain_error")
        };
    }
}

export function convertZxcToYjc(zxcAmount) {
    const zxc = Math.max(0, Math.floor(toSafeNumber(zxcAmount, 0)));
    return Math.floor(zxc / 100000000);
}
