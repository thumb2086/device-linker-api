import { verify } from "crypto";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { AIRDROP_HALVING_STEP, CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { calculateAirdropRewardWei } from "../lib/airdrop-policy.js";
import { listGameHistory } from "../lib/game-history.js";
import { withChainTxLock } from "../lib/tx-lock.js";

const MAX_TRANSFER_AMOUNT = 100000000;
const CONTRACT_ABI = [
    "function mint(address to, uint256 amount) public",
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)"
];

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

function normalizeAmount(rawAmount) {
    const normalized = String(rawAmount ?? "").replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
        throw new Error("amount format is invalid");
    }

    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        throw new Error("amount must be greater than 0");
    }
    if (numericValue > MAX_TRANSFER_AMOUNT) {
        throw new Error(`amount is too large; max ${MAX_TRANSFER_AMOUNT}`);
    }

    return normalized;
}

function normalizeBase64PublicKey(rawPublicKey) {
    const raw = String(rawPublicKey || "").trim();
    if (!raw) return "";
    if (raw.includes("BEGIN PUBLIC KEY")) {
        return raw
            .replace(/-----BEGIN PUBLIC KEY-----/g, "")
            .replace(/-----END PUBLIC KEY-----/g, "")
            .replace(/\s+/g, "");
    }
    return raw.replace(/\s+/g, "");
}

function toPemFromBase64(base64PublicKey) {
    const wrapped = String(base64PublicKey || "").match(/.{1,64}/g) || [];
    return `-----BEGIN PUBLIC KEY-----\n${wrapped.join("\n")}\n-----END PUBLIC KEY-----`;
}

function deriveAddressFromPublicKey(base64PublicKey) {
    const spkiBytes = Buffer.from(base64PublicKey, "base64");
    if (!spkiBytes.length) return null;

    let uncompressed = null;
    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
        uncompressed = spkiBytes;
    } else if (spkiBytes.length > 26 && spkiBytes[26] === 0x04) {
        const sliced = spkiBytes.slice(26);
        if (sliced.length >= 65 && sliced[0] === 0x04) {
            uncompressed = sliced.slice(0, 65);
        }
    } else if (spkiBytes.length > 65) {
        const tail = spkiBytes.slice(-65);
        if (tail[0] === 0x04) {
            uncompressed = tail;
        }
    }

    if (!uncompressed) return null;
    return ethers.computeAddress(`0x${uncompressed.toString("hex")}`).toLowerCase();
}

function toBooleanFlag(value) {
    return value === true || String(value || "").trim().toLowerCase() === "true";
}

function jsonError(res, statusCode, error) {
    return res.status(statusCode).json({
        success: false,
        error: error && error.message ? error.message : String(error || "Unknown error")
    });
}

async function resolveSessionAddress(sessionId) {
    if (!sessionId) return { session: null, address: "" };
    const session = await getSession(String(sessionId || "").trim());
    if (!session || !session.address) {
        throw new Error("Session expired");
    }
    return {
        session,
        address: normalizeAddress(session.address, "session address")
    };
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

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contractAddress = normalizeAddress(CONTRACT_ADDRESS, "CONTRACT_ADDRESS");
        const readContract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
        const decimals = await readContract.decimals();

        if (action === "get_balance") {
            const address = normalizeAddress(body.address, "address");
            const balanceRaw = await readContract.balanceOf(address);
            return res.status(200).json({
                success: true,
                balance: ethers.formatUnits(balanceRaw, decimals),
                decimals: decimals.toString()
            });
        }

        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) {
            return res.status(500).json({ success: false, error: "ADMIN_PRIVATE_KEY is not configured" });
        }
        if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;

        const adminWallet = new ethers.Wallet(privateKey, provider);
        const adminWalletAddress = normalizeAddress(process.env.ADMIN_WALLET_ADDRESS || adminWallet.address, "ADMIN_WALLET_ADDRESS");
        const treasuryAddress = normalizeAddress(process.env.LOSS_POOL_ADDRESS || adminWallet.address, "LOSS_POOL_ADDRESS");
        const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, adminWallet);

        if (action === "airdrop") {
            const sessionInfo = sessionId ? await resolveSessionAddress(sessionId) : { session: null, address: "" };
            const targetAddress = sessionInfo.address || normalizeAddress(body.address, "address");
            const adminBalanceWei = await contract.balanceOf(adminWallet.address);
            const totalSupplyWei = await contract.totalSupply();
            const publicDistributedWei = totalSupplyWei > adminBalanceWei ? totalSupplyWei - adminBalanceWei : 0n;
            const policy = calculateAirdropRewardWei(decimals, publicDistributedWei);

            if (policy.rewardWei <= 0n) {
                return res.status(400).json({
                    success: false,
                    error: "Airdrop cap reached",
                    distributedExcludingAdmin: ethers.formatUnits(policy.distributedWei, decimals),
                    cap: ethers.formatUnits(policy.capWei, decimals),
                    remaining: "0"
                });
            }

            const tx = await withChainTxLock(() => transferFromTreasuryWithAutoTopup(
                contract,
                treasuryAddress,
                targetAddress,
                policy.rewardWei,
                { gasLimit: 220000 }
            ));
            const newDistributedWei = policy.distributedWei + policy.rewardWei;

            return res.status(200).json({
                success: true,
                txHash: tx.hash,
                reward: ethers.formatUnits(policy.rewardWei, decimals),
                halvingCount: policy.halvingCount,
                distributedExcludingAdmin: ethers.formatUnits(newDistributedWei, decimals),
                cap: ethers.formatUnits(policy.capWei, decimals),
                remaining: ethers.formatUnits(policy.capWei - newDistributedWei, decimals),
                adminWalletAddress: normalizeAddress(adminWallet.address, "adminWalletAddress")
            });
        }

        const sessionInfo = sessionId ? await resolveSessionAddress(sessionId) : { session: null, address: "" };
        const sessionAddress = sessionInfo.address;

        if (action === "game_history") {
            const historyAddress = sessionAddress || normalizeAddress(body.address, "address");
            const result = await listGameHistory(historyAddress, { limit: body.limit });
            return res.status(200).json({
                success: true,
                action: "game_history",
                address: historyAddress,
                total: result.total,
                items: result.items
            });
        }

        if (action === "summary" || action === "status" || action === "balance") {
            const userAddress = sessionAddress || normalizeAddress(body.address, "address");
            const [userBalanceWei, treasuryBalanceWei, totalSupplyWei, adminWalletBalanceWei] = await Promise.all([
                contract.balanceOf(userAddress),
                contract.balanceOf(treasuryAddress),
                contract.totalSupply(),
                contract.balanceOf(adminWalletAddress)
            ]);
            const publicDistributedWei = totalSupplyWei > adminWalletBalanceWei
                ? totalSupplyWei - adminWalletBalanceWei
                : 0n;
            const airdropPolicy = calculateAirdropRewardWei(decimals, publicDistributedWei);
            const halvingStepWei = ethers.parseUnits(AIRDROP_HALVING_STEP, decimals);
            const nextHalvingAtWei = halvingStepWei > 0n
                ? halvingStepWei * BigInt(airdropPolicy.halvingCount + 1)
                : 0n;

            return res.status(200).json({
                success: true,
                action: "summary",
                address: userAddress,
                treasuryAddress,
                decimals: String(decimals),
                userBalance: ethers.formatUnits(userBalanceWei, decimals),
                treasuryBalance: ethers.formatUnits(treasuryBalanceWei, decimals),
                airdrop: {
                    distributed: ethers.formatUnits(airdropPolicy.distributedWei, decimals),
                    distributedExcludingAdmin: ethers.formatUnits(airdropPolicy.distributedWei, decimals),
                    cap: ethers.formatUnits(airdropPolicy.capWei, decimals),
                    remaining: ethers.formatUnits(airdropPolicy.remainingWei, decimals),
                    reward: ethers.formatUnits(airdropPolicy.rewardWei, decimals),
                    halvingCount: airdropPolicy.halvingCount,
                    nextHalvingAt: ethers.formatUnits(nextHalvingAtWei, decimals)
                }
            });
        }

        const amountText = normalizeAmount(body.amount);
        let amountWei;
        try {
            amountWei = ethers.parseUnits(amountText, decimals);
        } catch {
            return res.status(400).json({ success: false, error: "amount exceeds token precision" });
        }
        if (amountWei <= 0n) {
            return res.status(400).json({ success: false, error: "amount must be greater than 0" });
        }

        if (action === "import" || action === "deposit") {
            const userAddress = sessionAddress || normalizeAddress(body.address, "address");
            const tx = await withChainTxLock(() => transferFromTreasuryWithAutoTopup(
                contract,
                treasuryAddress,
                userAddress,
                amountWei,
                { gasLimit: 220000 }
            ));

            return res.status(200).json({
                success: true,
                action: "import",
                from: treasuryAddress,
                to: userAddress,
                amount: amountText,
                txHash: tx.hash
            });
        }

        if (action === "withdraw" || action === "cashout") {
            const userAddress = sessionAddress || normalizeAddress(body.address, "address");
            const userBalanceWei = await contract.balanceOf(userAddress);
            if (userBalanceWei < amountWei) {
                return res.status(400).json({ success: false, error: "Insufficient balance" });
            }

            const tx = await withChainTxLock(() => contract.adminTransfer(userAddress, treasuryAddress, amountWei, { gasLimit: 220000 }));
            return res.status(200).json({
                success: true,
                action: "withdraw",
                from: userAddress,
                to: treasuryAddress,
                amount: amountText,
                txHash: tx.hash
            });
        }

        if (action === "secure_transfer") {
            const fromAddress = sessionAddress || normalizeAddress(body.from, "from");
            const toAddress = normalizeAddress(body.to || body.toAddress, "to");
            const cleanAmount = amountText.replace(/\.0+$/, "");
            const normalizedPublicKey = normalizeBase64PublicKey(body.publicKey);
            const signature = String(body.signature || "").trim();
            const payoutMode = toBooleanFlag(body.isPayout);

            if (!signature || !normalizedPublicKey) {
                return res.status(400).json({ success: false, error: "Missing signature or publicKey" });
            }

            const cleanTo = toAddress.replace(/^0x/, "");
            const message = `transfer:${cleanTo}:${cleanAmount}`;
            const publicKeyPem = toPemFromBase64(normalizedPublicKey);
            const derivedAddress = deriveAddressFromPublicKey(normalizedPublicKey);

            if (derivedAddress && derivedAddress !== fromAddress) {
                return res.status(403).json({
                    success: false,
                    error: "Address mismatch",
                    expectedAddress: derivedAddress,
                    receivedFrom: fromAddress
                });
            }

            const isVerified = verify(
                "sha256",
                Buffer.from(message, "utf-8"),
                { key: publicKeyPem, padding: undefined },
                Buffer.from(signature, "base64")
            );
            if (!isVerified) {
                return res.status(400).json({
                    success: false,
                    error: "Signature verification failed",
                    debug: {
                        generatedMessage: message
                    }
                });
            }

            let transferWei = amountWei;
            let feeWei = 0n;
            if (payoutMode) {
                feeWei = (amountWei * 5n) / 100n;
                transferWei = amountWei - feeWei;
                if (transferWei <= 0n) {
                    return res.status(400).json({ success: false, error: "Amount is too small after fee" });
                }
            }

            const tx = await withChainTxLock(() => contract.adminTransfer(fromAddress, toAddress, transferWei, { gasLimit: 220000 }));
            return res.status(200).json({
                success: true,
                txHash: tx.hash,
                from: fromAddress,
                to: toAddress,
                amount: amountText,
                isPayout: payoutMode,
                requestedAmount: cleanAmount,
                transferredAmount: ethers.formatUnits(transferWei, decimals),
                feeAmount: ethers.formatUnits(feeWei, decimals),
                feeRate: payoutMode ? "0.05" : "0.00"
            });
        }

        if (action === "export" || action === "transfer") {
            const userAddress = sessionAddress || normalizeAddress(body.from, "from");
            const toAddress = normalizeAddress(body.to || body.toAddress, "to");
            const userBalanceWei = await contract.balanceOf(userAddress);
            if (userBalanceWei < amountWei) {
                return res.status(400).json({ success: false, error: "Insufficient balance" });
            }

            const tx = await withChainTxLock(() => contract.adminTransfer(userAddress, toAddress, amountWei, { gasLimit: 220000 }));
            return res.status(200).json({
                success: true,
                action: "export",
                from: userAddress,
                to: toAddress,
                amount: amountText,
                txHash: tx.hash
            });
        }

        return res.status(400).json({
            success: false,
            error: `Unsupported action: ${action}`,
            supportedActions: [
                "summary",
                "status",
                "balance",
                "game_history",
                "get_balance",
                "airdrop",
                "import",
                "deposit",
                "export",
                "transfer",
                "secure_transfer",
                "withdraw",
                "cashout"
            ]
        });
    } catch (error) {
        return jsonError(res, 500, error);
    }
}
