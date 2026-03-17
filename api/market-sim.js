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

function normalizeAddress(rawAddress, fieldName = "address") {
    try {
        return ethers.getAddress(String(rawAddress || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${fieldName} 格式錯誤`);
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

        const userAddress = tryNormalizeAddress(session.address);
        if (!userAddress) return res.status(403).json({ success: false, error: "會話地址無效，請重新登入" });
        const key = accountKey(userAddress);
        const nowTs = Date.now();
        const market = buildMarketSnapshot(nowTs);
        const decimals = await settlementService.getDecimals();

        const [walletBalanceWei, totalBet, rawAccount] = await Promise.all([
            settlementService.contract.balanceOf(userAddress),
            kv.get(`total_bet:${userAddress}`),
            kv.get(key)
        ]);

        const walletBalance = Number(ethers.formatUnits(walletBalanceWei, decimals));
        const vipStatus = buildVipStatus(Number(totalBet || 0));
        let account = normalizeMarketAccount(rawAccount, nowTs);

        if (!account || typeof account !== "object" || !account.createdAt) {
            account = createDefaultMarketAccount(nowTs, walletBalance);
        }

        account.cash = walletBalance;
        account.updatedAt = new Date(nowTs).toISOString();

        const liquidationEvents = settleLiquidations(account, market, nowTs);
        const previousAccountState = JSON.parse(JSON.stringify(account));
        let actionResult = null;

        try {
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

            // On success, sync final balance and commit the new state
            const syncedWalletBalanceWei = await settlementService.contract.balanceOf(userAddress);
            account.cash = Number(ethers.formatUnits(syncedWalletBalanceWei, decimals));
            account.updatedAt = new Date(Date.now()).toISOString();
            await kv.set(key, account);

            return res.status(200).json({
                success: true,
                action,
                account: buildAccountSummary(account, market),
                market,
                totalBet: Number(totalBet || 0).toFixed(2),
                level: vipStatus.vipLevel,
                betLimit: String(vipStatus.maxBet),
                levelSystem: { key: "legacy_v1", label: "等級制度 v1" },
                params: { bankAnnualRate: BANK_ANNUAL_RATE, loanAnnualRate: LOAN_ANNUAL_RATE },
                walletBalance: account.cash,
                liquidationEvents,
                actionResult
            });

        } catch (actionError) {
            // On failure, do NOT commit state. Return the state before the action.
            return res.status(400).json({
                success: false,
                action,
                error: actionError.message,
                account: buildAccountSummary(previousAccountState, market),
                market,
                walletBalance: previousAccountState.cash,
                liquidationEvents
            });
        }

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || "market sim failed" });
    }
}
