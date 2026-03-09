import { kv } from '@vercel/kv';
import { getSession } from "../lib/session-store.js";
import { ethers } from "ethers";
import {
    BANK_ANNUAL_RATE,
    LOAN_ANNUAL_RATE,
    buildAccountSummary,
    buildMarketSnapshot,
    normalizeMarketAccount,
    settleLiquidations,
    buyStock,
    sellStock,
    openFutures,
    closeFutures,
    bankDeposit,
    bankWithdraw,
    borrowLoan,
    repayLoan,
    createDefaultMarketAccount
} from "../lib/market-sim.js";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { buildVipStatus } from "../lib/vip.js";
import { withChainTxLock } from "../lib/tx-lock.js";
import { sendManagedContractTx } from "../lib/admin-chain.js";

const CORS_METHODS = 'POST, OPTIONS';
const CONTRACT_ABI = [
    "function mint(address to, uint256 amount) public",
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)"
];

function accountKey(address) {
    return `market_sim:${String(address || "").toLowerCase()}`;
}

function accountLockKey(address) {
    return `market_sim_lock:${String(address || "").toLowerCase()}`;
}

function normalizeAddress(rawAddress, fieldName = "address") {
    try {
        return ethers.getAddress(String(rawAddress || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${fieldName} 格式錯誤`);
    }
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireAccountLock(address, timeoutMs = 8000) {
    const lockKey = accountLockKey(address);
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const acquired = await kv.set(lockKey, token, { nx: true, ex: 10 });
        if (acquired === 'OK' || acquired === true) {
            return { lockKey, token };
        }
        await sleep(120);
    }

    throw new Error("市場交易繁忙，請稍後再試");
}

async function releaseAccountLock(lock) {
    if (!lock || !lock.lockKey || !lock.token) return;
    try {
        const currentToken = await kv.get(lock.lockKey);
        if (currentToken === lock.token) {
            await kv.del(lock.lockKey);
        }
    } catch (_) {
        // ignore lock release failures
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', CORS_METHODS);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const body = req.body || {};
        const sessionId = String(body.sessionId || "").trim();
        const action = String(body.action || "snapshot").trim().toLowerCase();

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "缺少 sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const userAddress = normalizeAddress(session.address, "session address");
        const lock = await acquireAccountLock(userAddress);
        try {
            const key = accountKey(userAddress);
            const nowTs = Date.now();
            const market = buildMarketSnapshot(nowTs);
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            let privateKey = process.env.ADMIN_PRIVATE_KEY;
            if (!privateKey) {
                return res.status(500).json({ success: false, error: "缺少 ADMIN_PRIVATE_KEY" });
            }
            if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
            const adminWallet = new ethers.Wallet(privateKey, provider);
            const treasuryAddress = normalizeAddress(process.env.LOSS_POOL_ADDRESS || adminWallet.address, "LOSS_POOL_ADDRESS");
            const contract = new ethers.Contract(normalizeAddress(CONTRACT_ADDRESS, "CONTRACT_ADDRESS"), CONTRACT_ABI, adminWallet);
            const decimals = await contract.decimals();
            const walletBalanceWei = await contract.balanceOf(userAddress);
            const walletBalance = Number(ethers.formatUnits(walletBalanceWei, decimals));
            const totalBet = Number(await kv.get(`total_bet:${userAddress}`) || 0);
            const vipStatus = buildVipStatus(totalBet);

            let account = normalizeMarketAccount(await kv.get(key), nowTs);
            if (!account || typeof account !== "object" || !account.createdAt) {
                account = createDefaultMarketAccount(nowTs, walletBalance);
            }
            account.cash = walletBalance;
            account.updatedAt = new Date(nowTs).toISOString();
            let actionResult = null;
            let previousAccount = null;

            const liquidationEvents = settleLiquidations(account, market, nowTs);

            try {
                previousAccount = JSON.parse(JSON.stringify(account));
                if (action === "reset") {
                    account = createDefaultMarketAccount(nowTs, walletBalance);
                } else if (action === "buy_stock") {
                    actionResult = buyStock(account, market, body.symbol, body.quantity);
                    const tradeCostWei = ethers.parseUnits(String(actionResult.total), decimals);
                    await withChainTxLock(() => sendManagedContractTx(contract, "adminTransfer", [userAddress, treasuryAddress, tradeCostWei], { gasLimit: 220000 }));
                } else if (action === "sell_stock") {
                    actionResult = sellStock(account, market, body.symbol, body.quantity);
                    const payoutWei = ethers.parseUnits(String(actionResult.net), decimals);
                    await withChainTxLock(() => transferFromTreasuryWithAutoTopup(contract, treasuryAddress, userAddress, payoutWei, { gasLimit: 220000 }));
                } else if (action === "open_futures") {
                    actionResult = openFutures(account, market, {
                        symbol: body.symbol,
                        side: body.side,
                        margin: body.margin,
                        leverage: body.leverage,
                        maxMargin: vipStatus.maxBet
                    });
                    const totalCharge = Number(actionResult.margin) + Number(actionResult.fee || 0);
                    const totalChargeWei = ethers.parseUnits(String(totalCharge), decimals);
                    await withChainTxLock(() => sendManagedContractTx(contract, "adminTransfer", [userAddress, treasuryAddress, totalChargeWei], { gasLimit: 220000 }));
                } else if (action === "close_futures") {
                    actionResult = closeFutures(account, market, body.positionId);
                    const payoutAmount = Math.max(0, Number(actionResult.refund || 0) - Number(actionResult.fee || 0));
                    if (payoutAmount > 0) {
                        const payoutWei = ethers.parseUnits(String(payoutAmount), decimals);
                        await withChainTxLock(() => transferFromTreasuryWithAutoTopup(contract, treasuryAddress, userAddress, payoutWei, { gasLimit: 220000 }));
                    }
                } else if (action === "bank_deposit") {
                    actionResult = bankDeposit(account, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await withChainTxLock(() => sendManagedContractTx(contract, "adminTransfer", [userAddress, treasuryAddress, amountWei], { gasLimit: 220000 }));
                } else if (action === "bank_withdraw") {
                    actionResult = bankWithdraw(account, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await withChainTxLock(() => transferFromTreasuryWithAutoTopup(contract, treasuryAddress, userAddress, amountWei, { gasLimit: 220000 }));
                } else if (action === "borrow") {
                    actionResult = borrowLoan(account, market, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await withChainTxLock(() => transferFromTreasuryWithAutoTopup(contract, treasuryAddress, userAddress, amountWei, { gasLimit: 220000 }));
                } else if (action === "repay") {
                    actionResult = repayLoan(account, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await withChainTxLock(() => sendManagedContractTx(contract, "adminTransfer", [userAddress, treasuryAddress, amountWei], { gasLimit: 220000 }));
                } else if (action !== "snapshot") {
                    return res.status(400).json({ success: false, error: `不支援 action: ${action}` });
                }

                const syncedWalletBalanceWei = await contract.balanceOf(userAddress);
                account.cash = Number(ethers.formatUnits(syncedWalletBalanceWei, decimals));
                account.updatedAt = new Date(Date.now()).toISOString();
            } catch (actionError) {
                if (previousAccount) {
                    account = previousAccount;
                }
                await kv.set(key, account);
                return res.status(400).json({
                    success: false,
                    action,
                    error: actionError.message,
                    account: buildAccountSummary(account, market),
                    market,
                    walletBalance: walletBalance,
                    liquidationEvents
                });
            }

            await kv.set(key, account);

            return res.status(200).json({
                success: true,
                action,
                account: buildAccountSummary(account, market),
                market,
                totalBet: totalBet.toFixed(2),
                vipLevel: vipStatus.vipLevel,
                maxBet: String(vipStatus.maxBet),
                params: {
                    bankAnnualRate: BANK_ANNUAL_RATE,
                    loanAnnualRate: LOAN_ANNUAL_RATE
                },
                walletBalance: account.cash,
                liquidationEvents,
                actionResult
            });
        } finally {
            await releaseAccountLock(lock);
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || "market sim failed"
        });
    }
}
