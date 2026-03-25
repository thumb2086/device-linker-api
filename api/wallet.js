import { kv } from "@vercel/kv";
import { verify } from "crypto";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { AIRDROP_HALVING_STEP, CONTRACT_ADDRESS, YJC_CONTRACT_ADDRESS } from "../lib/config.js";
import {
    AIRDROP_DISTRIBUTED_TOTAL_KEY,
    calculateAirdropRewardWei,
    normalizeAirdropDistributedWei
} from "../lib/airdrop-policy.js";
import { listGameHistory } from "../lib/game-history.js";
import { sendManagedContractTx } from "../lib/admin-chain.js";
import {
    applyReadCacheHeaders,
    invalidateReadCache,
    invalidateReadCacheByPrefix,
    readThroughCache
} from "../lib/read-cache.js";
import { settlementService } from "../lib/settlement-service.js";
import { yjcSettlementService } from "../lib/yjc-settlement.js";

const MAX_TRANSFER_AMOUNT = 100000000;
const DEFAULT_WALLET_TOKEN = "zhixi";
const WALLET_TOKEN_MAP = {
    zhixi: {
        key: "zhixi",
        symbol: "ZHIXI",
        label: "ZhiXi Coin",
        contractAddress: CONTRACT_ADDRESS,
        service: settlementService,
        supportsAirdrop: true
    },
    yjc: {
        key: "yjc",
        symbol: "YJC",
        label: "YouJian Coin",
        contractAddress: YJC_CONTRACT_ADDRESS,
        service: yjcSettlementService,
        supportsAirdrop: false
    }
};

function normalizeWalletToken(rawToken) {
    const normalized = String(rawToken || DEFAULT_WALLET_TOKEN).trim().toLowerCase();
    return WALLET_TOKEN_MAP[normalized] ? normalized : DEFAULT_WALLET_TOKEN;
}

function getWalletTokenRuntime(rawToken) {
    const tokenKey = normalizeWalletToken(rawToken);
    const config = WALLET_TOKEN_MAP[tokenKey];
    if (!config || !config.contractAddress) {
        throw new Error(`${tokenKey.toUpperCase()} token is not configured`);
    }
    return config;
}

function getSafeBody(req) {
    if (!req || typeof req !== "object") return {};
    const rawBody = req.body;
    if (!rawBody) return {};
    if (typeof rawBody === "string") {
        try {
            const parsed = JSON.parse(rawBody);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof rawBody === "object" ? rawBody : {};
}

function normalizeAction(rawAction) {
    return String(rawAction || "summary").trim().toLowerCase();
}

function normalizeAddress(rawAddress, fieldName = "address") {
    try {
        return ethers.getAddress(String(rawAddress || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${fieldName} format is invalid`);
    }
}

function tryNormalizeAddress(rawAddress) {
    if (!rawAddress) return "";
    try {
        return ethers.getAddress(String(rawAddress).trim()).toLowerCase();
    } catch {
        return "";
    }
}

function normalizeAmount(rawAmount) {
    const normalized = String(rawAmount ?? "").replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("amount format is invalid");
    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue) || numericValue <= 0) throw new Error("amount must be greater than 0");
    if (numericValue > MAX_TRANSFER_AMOUNT) throw new Error(`amount is too large; max ${MAX_TRANSFER_AMOUNT}`);
    return normalized;
}

function normalizeBase64PublicKey(rawPublicKey) {
    const raw = String(rawPublicKey || "").trim();
    if (!raw) return "";
    if (raw.includes("BEGIN PUBLIC KEY")) {
        return raw.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s+/g, "");
    }
    return raw.replace(/\s+/g, "");
}

function toPemFromBase64(base64PublicKey) {
    const wrapped = String(base64PublicKey || "").match(/.{1,64}/g) || [];
    return `-----BEGIN PUBLIC KEY-----\n${wrapped.join("\n")}\n-----END PUBLIC KEY-----`;
}

function deriveAddressFromPublicKey(base64PublicKey) {
    try {
        const spkiBytes = Buffer.from(base64PublicKey, "base64");
        if (!spkiBytes.length) return null;
        let uncompressed = null;
        
        // 1. Check for 65-byte uncompressed key (0x04 prefix)
        if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
            uncompressed = spkiBytes;
        } 
        // 2. Check for 33-byte compressed key (0x02 or 0x03 prefix)
        else if (spkiBytes.length === 33 && (spkiBytes[0] === 0x02 || spkiBytes[0] === 0x03)) {
            uncompressed = spkiBytes;
        }
        // 3. Check for SPKI wrapped key (header + 0x04 + 64 bytes)
        else if (spkiBytes.length > 20) {
            // Find the 0x04 prefix if it's there
            const osIndex = spkiBytes.indexOf(Buffer.from([0x04]));
            if (osIndex !== -1 && osIndex < 35) { // Common SPKI headers are < 35 bytes
                const sliced = spkiBytes.slice(osIndex);
                if (sliced.length === 65) uncompressed = sliced;
            }
        }
        
        if (!uncompressed) return null;
        return ethers.computeAddress(`0x${uncompressed.toString("hex")}`).toLowerCase();
    } catch (e) {
        console.error("Derive address failed:", e.message);
        return null;
    }
}

function toBooleanFlag(value) {
    return value === true || String(value || "").trim().toLowerCase() === "true";
}

async function getTrackedAirdropDistributedWei() {
    const stored = await kv.get(AIRDROP_DISTRIBUTED_TOTAL_KEY);
    return normalizeAirdropDistributedWei(stored);
}

async function blockIfBlacklisted(res, address) {
    if (!address) return false;
    const blacklisted = await kv.get(`blacklist:${address.toLowerCase()}`);
    if (!blacklisted) return false;
    res.status(403).json({
        success: false,
        status: "blacklisted",
        error: `帳號已被禁止進入：${blacklisted.reason || "未註明原因"}`
    });
    return true;
}

function applyWalletReadHeaders(res, meta) {
    if (!res) return;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    applyReadCacheHeaders(res, meta);
}

async function invalidateWalletReadCaches(address, tokenKey = DEFAULT_WALLET_TOKEN) {
    const normalized = tryNormalizeAddress(address);
    if (!normalized) return;
    await Promise.all([
        invalidateReadCache("wallet-balance", [tokenKey, normalized]),
        invalidateReadCache("wallet-summary", [tokenKey, normalized]),
        invalidateReadCacheByPrefix("wallet-game-history", [tokenKey, normalized])
    ]);
}

function jsonError(res, statusCode, error) {
    return res.status(statusCode).json({
        success: false,
        error: error && error.message ? error.message : String(error || "Unknown error")
    });
}

class SessionError extends Error {
    constructor(message, statusCode = 403) {
        super(message);
        this.name = "SessionError";
        this.statusCode = statusCode;
    }
}

async function resolveSessionAddress(sessionId) {
    if (!sessionId) return { session: null, address: "" };
    const session = await getSession(String(sessionId || "").trim());
    if (!session || !session.address) throw new SessionError("Session expired");
    return { session, address: normalizeAddress(session.address, "session address") };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });
    try {
        const body = getSafeBody(req);
        const action = normalizeAction(body.action);
        const sessionId = String(body.sessionId || "").trim();
        const tokenConfig = getWalletTokenRuntime(body.token);
        const tokenKey = tokenConfig.key;
        const tokenService = tokenConfig.service;
        const decimals = await tokenService.getDecimals();
        const contract = tokenService.contract;
        const treasuryAddress = normalizeAddress(tokenService.lossPoolAddress, "LOSS_POOL_ADDRESS");

        // 將 session 解析延後到具體 action 內，避免不需要 session 的功能被攔截
        let _sessionInfo = null;
        const getSessionInfo = async () => {
            if (_sessionInfo) return _sessionInfo;
            if (!sessionId) return { session: null, address: "" };
            try {
                _sessionInfo = await resolveSessionAddress(sessionId);
                return _sessionInfo;
            } catch (err) {
                if (err instanceof SessionError) return { session: null, address: "", error: err.message };
                throw err;
            }
        };

        if (action === "get_balance") {
            const sInfo = await getSessionInfo();
            const address = tryNormalizeAddress(body.address) || sInfo.address;
            if (!address) return jsonError(res, 400, sInfo.error || "Missing address or session expired");
            if (await blockIfBlacklisted(res, address)) return;
            const cached = await readThroughCache({
                namespace: "wallet-balance",
                keyParts: [tokenKey, address],
                tier: "user-live",
                loader: async () => {
                    const balanceRaw = await contract.balanceOf(address);
                    return {
                        success: true,
                        token: tokenKey,
                        tokenSymbol: tokenConfig.symbol,
                        tokenLabel: tokenConfig.label,
                        contractAddress: tokenConfig.contractAddress,
                        balance: ethers.formatUnits(balanceRaw, decimals),
                        decimals: decimals.toString(),
                        generatedAt: new Date().toISOString()
                    };
                }
            });
            applyWalletReadHeaders(res, cached.meta);
            return res.status(200).json(cached.value);
        }
        
        if (action === "airdrop") {
            if (!tokenConfig.supportsAirdrop) {
                return res.status(400).json({ success: false, error: `${tokenConfig.symbol} does not support airdrop` });
            }
            const sInfo = await getSessionInfo();
            const targetAddress = sInfo.address || tryNormalizeAddress(body.address);
            if (!targetAddress) return jsonError(res, 403, sInfo.error || "Session expired or missing address");
            if (await blockIfBlacklisted(res, targetAddress)) return;
            const trackedDistributedWei = await getTrackedAirdropDistributedWei();
            const policy = calculateAirdropRewardWei(decimals, trackedDistributedWei);
            
            const results = await settlementService.settle({
                userAddress: targetAddress,
                betWei: 0n,
                payoutWei: policy.rewardWei,
                source: "wallet_airdrop"
            });

            const newDistributedWei = policy.distributedWei + policy.rewardWei;
            await kv.set(AIRDROP_DISTRIBUTED_TOTAL_KEY, newDistributedWei.toString());
            await invalidateWalletReadCaches(targetAddress, tokenKey);
            
            return res.status(200).json({ 
                success: true, 
                token: tokenKey,
                tokenSymbol: tokenConfig.symbol,
                tokenLabel: tokenConfig.label,
                txHash: results.payoutTxHash, 
                reward: ethers.formatUnits(policy.rewardWei, decimals), 
                halvingCount: policy.halvingCount, 
                distributed: ethers.formatUnits(newDistributedWei, decimals), 
                distributedExcludingAdmin: ethers.formatUnits(newDistributedWei, decimals), 
                cap: null, 
                remaining: null, 
                adminWalletAddress: treasuryAddress 
            });
        }
        
        if (action === "game_history") {
            const sInfo = await getSessionInfo();
            const historyAddress = sInfo.address || tryNormalizeAddress(body.address);
            if (!historyAddress) return jsonError(res, 403, sInfo.error || "Session expired or missing address");
            if (await blockIfBlacklisted(res, historyAddress)) return;
            const normalizedLimit = Math.max(1, Math.floor(Number(body.limit) || 20));
            const cached = await readThroughCache({
                namespace: "wallet-game-history",
                keyParts: [tokenKey, historyAddress, normalizedLimit],
                tier: "user-history",
                loader: async () => {
                    const result = await listGameHistory(historyAddress, { limit: normalizedLimit });
                    return {
                        success: true,
                        action: "game_history",
                        token: tokenKey,
                        tokenSymbol: tokenConfig.symbol,
                        address: historyAddress,
                        total: result.total,
                        items: result.items,
                        generatedAt: new Date().toISOString()
                    };
                }
            });
            applyWalletReadHeaders(res, cached.meta);
            return res.status(200).json(cached.value);
        }
        
        if (action === "summary" || action === "status" || action === "balance") {
            const sInfo = await getSessionInfo();
            const userAddress = sInfo.address || tryNormalizeAddress(body.address);
            if (!userAddress) return jsonError(res, 403, sInfo.error || "Session expired or missing address");
            if (await blockIfBlacklisted(res, userAddress)) return;
            const cached = await readThroughCache({
                namespace: "wallet-summary",
                keyParts: [tokenKey, userAddress],
                tier: "user-live",
                loader: async () => {
                    const balanceReads = [
                        contract.balanceOf(userAddress),
                        contract.balanceOf(treasuryAddress)
                    ];
                    if (tokenConfig.supportsAirdrop) {
                        balanceReads.push(getTrackedAirdropDistributedWei());
                    }
                    const [userBalanceWei, treasuryBalanceWei, trackedAirdropDistributedWei = 0n] = await Promise.all(balanceReads);
                    const airdropPolicy = tokenConfig.supportsAirdrop
                        ? calculateAirdropRewardWei(decimals, trackedAirdropDistributedWei)
                        : null;
                    const halvingStepWei = tokenConfig.supportsAirdrop
                        ? ethers.parseUnits(AIRDROP_HALVING_STEP, decimals)
                        : 0n;
                    const nextHalvingAtWei = tokenConfig.supportsAirdrop && airdropPolicy
                        ? (halvingStepWei > 0n ? halvingStepWei * BigInt(airdropPolicy.halvingCount + 1) : 0n)
                        : 0n;

                    return {
                        success: true,
                        action: "summary",
                        token: tokenKey,
                        tokenSymbol: tokenConfig.symbol,
                        tokenLabel: tokenConfig.label,
                        contractAddress: tokenConfig.contractAddress,
                        supportsAirdrop: tokenConfig.supportsAirdrop,
                        address: userAddress,
                        treasuryAddress,
                        decimals: String(decimals),
                        userBalance: ethers.formatUnits(userBalanceWei, decimals),
                        treasuryBalance: ethers.formatUnits(treasuryBalanceWei, decimals),
                        airdrop: tokenConfig.supportsAirdrop && airdropPolicy ? {
                            distributed: ethers.formatUnits(airdropPolicy.distributedWei, decimals),
                            distributedExcludingAdmin: ethers.formatUnits(airdropPolicy.distributedWei, decimals),
                            cap: null,
                            remaining: null,
                            reward: ethers.formatUnits(airdropPolicy.rewardWei, decimals),
                            halvingCount: airdropPolicy.halvingCount,
                            nextHalvingAt: ethers.formatUnits(nextHalvingAtWei, decimals)
                        } : null,
                        generatedAt: new Date().toISOString()
                    };
                }
            });
            applyWalletReadHeaders(res, cached.meta);
            return res.status(200).json(cached.value);
        }
        
        const amountText = normalizeAmount(body.amount);
        let amountWei;
        try { 
            amountWei = ethers.parseUnits(amountText, decimals); 
        } catch { 
            return res.status(400).json({ success: false, error: "amount exceeds token precision" }); 
        }
        
        if (amountWei <= 0n) return res.status(400).json({ success: false, error: "amount must be greater than 0" });
        
        if (action === "import" || action === "deposit") {
            const sInfo = await getSessionInfo();
            const userAddress = sInfo.address || tryNormalizeAddress(body.address);
            if (!userAddress) return jsonError(res, 403, sInfo.error || "Session expired or missing address");
            if (await blockIfBlacklisted(res, userAddress)) return;
            const results = await tokenService.settle({
                userAddress,
                betWei: 0n,
                payoutWei: amountWei,
                source: "wallet_import"
            });
            await invalidateWalletReadCaches(userAddress, tokenKey);
            return res.status(200).json({ success: true, action: "import", token: tokenKey, tokenSymbol: tokenConfig.symbol, from: treasuryAddress, to: userAddress, amount: amountText, txHash: results.payoutTxHash });
        }
        
        if (action === "withdraw" || action === "cashout") {
            const sInfo = await getSessionInfo();
            const userAddress = sInfo.address || tryNormalizeAddress(body.address);
            if (!userAddress) return jsonError(res, 403, sInfo.error || "Session expired or missing address");
            if (await blockIfBlacklisted(res, userAddress)) return;
            const userBalanceWei = await contract.balanceOf(userAddress);
            if (userBalanceWei < amountWei) return res.status(400).json({ success: false, error: "Insufficient balance" });
            
            const results = await tokenService.settle({
                userAddress,
                betWei: amountWei,
                payoutWei: 0n,
                source: "wallet_withdraw"
            });
            await invalidateWalletReadCaches(userAddress, tokenKey);
            return res.status(200).json({ success: true, action: "withdraw", token: tokenKey, tokenSymbol: tokenConfig.symbol, from: userAddress, to: treasuryAddress, amount: amountText, txHash: results.betTxHash });
        }
        
        if (action === "secure_transfer") {
            const sInfo = await getSessionInfo();
            const fromAddress = sInfo.address || tryNormalizeAddress(body.from);
            if (!fromAddress) return jsonError(res, 403, sInfo.error || "Session expired or missing from address");
            const toAddress = tryNormalizeAddress(body.to || body.toAddress);
            if (!toAddress) return jsonError(res, 400, "Invalid or missing 'to' address");
            if (await blockIfBlacklisted(res, fromAddress)) return;
            const cleanAmount = amountText.replace(/\.0+$/, "");
            const normalizedPublicKey = normalizeBase64PublicKey(body.publicKey);
            const signature = String(body.signature || "").trim();
            const payoutMode = toBooleanFlag(body.isPayout);
            
            if (!signature || !normalizedPublicKey) return res.status(400).json({ success: false, error: "Missing signature or publicKey" });
            
            const cleanTo = toAddress.replace(/^0x/, "");
            const message = `transfer:${cleanTo}:${cleanAmount}`;
            const publicKeyPem = toPemFromBase64(normalizedPublicKey);
            const derivedAddress = deriveAddressFromPublicKey(normalizedPublicKey);
            
            if (derivedAddress && derivedAddress !== fromAddress) {
                return res.status(403).json({ success: false, error: "Address mismatch", expectedAddress: derivedAddress, receivedFrom: fromAddress });
            }
            
            const isVerified = verify("sha256", Buffer.from(message, "utf-8"), { key: publicKeyPem, padding: undefined }, Buffer.from(signature, "base64"));
            if (!isVerified) return res.status(400).json({ success: false, error: "Signature verification failed", debug: { generatedMessage: message } });
            
            let transferWei = amountWei;
            let feeWei = 0n;
            if (payoutMode) {
                feeWei = (amountWei * 5n) / 100n;
                transferWei = amountWei - feeWei;
                if (transferWei <= 0n) return res.status(400).json({ success: false, error: "Amount is too small after fee" });
            }
            
            const writeContract = tokenService.writeContract;
            const tx = await sendManagedContractTx(writeContract, "adminTransfer", [fromAddress, toAddress, transferWei], { gasLimit: 220000, txSource: "wallet_secure_transfer" });
            await Promise.all([
                invalidateWalletReadCaches(fromAddress, tokenKey),
                invalidateWalletReadCaches(toAddress, tokenKey)
            ]);
            return res.status(200).json({ success: true, token: tokenKey, tokenSymbol: tokenConfig.symbol, txHash: tx.hash, from: fromAddress, to: toAddress, amount: amountText, isPayout: payoutMode, requestedAmount: cleanAmount, transferredAmount: ethers.formatUnits(transferWei, decimals), feeAmount: ethers.formatUnits(feeWei, decimals), feeRate: payoutMode ? "0.05" : "0.00" });
        }
        
        if (action === "export" || action === "transfer") {
            const sInfo = await getSessionInfo();
            const userAddress = sInfo.address || tryNormalizeAddress(body.from);
            if (!userAddress) return jsonError(res, 403, sInfo.error || "Session expired or missing from address");
            const toAddress = tryNormalizeAddress(body.to || body.toAddress);
            if (!toAddress) return jsonError(res, 400, "Invalid or missing 'to' address");
            if (await blockIfBlacklisted(res, userAddress)) return;
            const userBalanceWei = await contract.balanceOf(userAddress);
            if (userBalanceWei < amountWei) return res.status(400).json({ success: false, error: "Insufficient balance" });
            
            const writeContract = tokenService.writeContract;
            const tx = await sendManagedContractTx(writeContract, "adminTransfer", [userAddress, toAddress, amountWei], { gasLimit: 220000, txSource: "wallet_export" });
            await Promise.all([
                invalidateWalletReadCaches(userAddress, tokenKey),
                invalidateWalletReadCaches(toAddress, tokenKey)
            ]);
            return res.status(200).json({ success: true, action: "export", token: tokenKey, tokenSymbol: tokenConfig.symbol, from: userAddress, to: toAddress, amount: amountText, txHash: tx.hash });
        }
        return res.status(400).json({ success: false, error: `Unsupported action: ${action}`, supportedActions: ["summary", "status", "balance", "game_history", "get_balance", "airdrop", "import", "deposit", "export", "transfer", "secure_transfer", "withdraw", "cashout"] });
    } catch (error) {
        if (error instanceof SessionError) {
            return res.status(error.statusCode).json({ success: false, error: error.message });
        }
        return jsonError(res, 500, error);
    }
}
