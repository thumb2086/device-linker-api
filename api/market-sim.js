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
import { buildVipStatus } from "../lib/vip.js";
import { settlementService } from "../lib/settlement-service.js";

const CORS_METHODS = 'POST, OPTIONS';
const MARKET_SIM_TX_SOURCE = "market_sim";

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
        if (acquired === 'OK' || acquired === true) return { lockKey, token };
        await sleep(120);
    }
    throw new Error("市場交易繁忙，請稍後再試");
}

async function releaseAccountLock(lock) {
    if (!lock || !lock.lockKey || !lock.token) return;
    try {
        const currentToken = await kv.get(lock.lockKey);
        if (currentToken === lock.token) await kv.del(lock.lockKey);
    } catch (_) {}
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
        if (!sessionId) return res.status(400).json({ success: false, error: "缺少 sessionId" });
        const session = await getSession(sessionId);
        if (!session || !session.address) return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        const userAddress = normalizeAddress(session.address, "session address");
        const lock = await acquireAccountLock(userAddress);
        try {
            const key = accountKey(userAddress);
            const nowTs = Date.now();
            const market = buildMarketSnapshot(nowTs);
            const decimals = await settlementService.getDecimals();
            const [walletBalanceWei, totalBet] = await Promise.all([
                settlementService.contract.balanceOf(userAddress),
                kv.get(`total_bet:${userAddress}`)
            ]);
            const walletBalance = Number(ethers.formatUnits(walletBalanceWei, decimals));
            const vipStatus = buildVipStatus(Number(totalBet || 0));
            let account = normalizeMarketAccount(await kv.get(key), nowTs);
            if (!account || typeof account !== "object" || !account.createdAt) account = createDefaultMarketAccount(nowTs, walletBalance);
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
                    await settlementService.settle({ userAddress, betWei: tradeCostWei, payoutWei: 0n, source: MARKET_SIM_TX_SOURCE, meta: { action, symbol: body.symbol } });
                } else if (action === "sell_stock") {
                    actionResult = sellStock(account, market, body.symbol, body.quantity);
                    const payoutWei = ethers.parseUnits(String(actionResult.net), decimals);
                    await settlementService.settle({ userAddress, betWei: 0n, payoutWei, source: MARKET_SIM_TX_SOURCE, meta: { action, symbol: body.symbol } });
                } else if (action === "open_futures") {
                    actionResult = openFutures(account, market, { symbol: body.symbol, side: body.side, margin: body.margin, leverage: body.leverage, maxMargin: vipStatus.maxBet });
                    const totalCharge = Number(actionResult.margin) + Number(actionResult.fee || 0);
                    const totalChargeWei = ethers.parseUnits(String(totalCharge), decimals);
                    await settlementService.settle({ userAddress, betWei: totalChargeWei, payoutWei: 0n, source: MARKET_SIM_TX_SOURCE, meta: { action, symbol: body.symbol, side: body.side } });
                } else if (action === "close_futures") {
                    actionResult = closeFutures(account, market, body.positionId);
                    const payoutAmount = Math.max(0, Number(actionResult.refund || 0) - Number(actionResult.fee || 0));
                    if (payoutAmount > 0) {
                        const payoutWei = ethers.parseUnits(String(payoutAmount), decimals);
                        await settlementService.settle({ userAddress, betWei: 0n, payoutWei, source: MARKET_SIM_TX_SOURCE, meta: { action, positionId: body.positionId } });
                    }
                } else if (action === "bank_deposit") {
                    actionResult = bankDeposit(account, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await settlementService.settle({ userAddress, betWei: amountWei, payoutWei: 0n, source: MARKET_SIM_TX_SOURCE, meta: { action } });
                } else if (action === "bank_withdraw") {
                    actionResult = bankWithdraw(account, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await settlementService.settle({ userAddress, betWei: 0n, payoutWei: amountWei, source: MARKET_SIM_TX_SOURCE, meta: { action } });
                } else if (action === "borrow") {
                    actionResult = borrowLoan(account, market, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await settlementService.settle({ userAddress, betWei: 0n, payoutWei: amountWei, source: MARKET_SIM_TX_SOURCE, meta: { action } });
                } else if (action === "repay") {
                    actionResult = repayLoan(account, body.amount);
                    const amountWei = ethers.parseUnits(String(actionResult.amount), decimals);
                    await settlementService.settle({ userAddress, betWei: amountWei, payoutWei: 0n, source: MARKET_SIM_TX_SOURCE, meta: { action } });
                } else if (action !== "snapshot") {
                    return res.status(400).json({ success: false, error: `不支援 action: ${action}` });
                }
                const syncedWalletBalanceWei = await settlementService.contract.balanceOf(userAddress);
                account.cash = Number(ethers.formatUnits(syncedWalletBalanceWei, decimals));
                account.updatedAt = new Date(Date.now()).toISOString();
            } catch (actionError) {
                if (previousAccount) account = previousAccount;
                await kv.set(key, account);
                return res.status(400).json({ success: false, action, error: actionError.message, account: buildAccountSummary(account, market), market, walletBalance: walletBalance, liquidationEvents });
            }
            await kv.set(key, account);
            return res.status(200).json({ success: true, action, account: buildAccountSummary(account, market), market, totalBet: Number(totalBet || 0).toFixed(2), vipLevel: vipStatus.vipLevel, maxBet: String(vipStatus.maxBet), params: { bankAnnualRate: BANK_ANNUAL_RATE, loanAnnualRate: LOAN_ANNUAL_RATE }, walletBalance: account.cash, liquidationEvents, actionResult });
        } finally {
            await releaseAccountLock(lock);
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || "market sim failed" });
    }
}
