import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import {
    BANK_ANNUAL_RATE,
    LOAN_ANNUAL_RATE,
    bankDeposit,
    bankWithdraw,
    borrowLoan,
    buildAccountSummary,
    buildMarketSnapshot,
    buyStock,
    closeFutures,
    createDefaultMarketAccount,
    normalizeMarketAccount,
    openFutures,
    repayLoan,
    sellStock,
    settleLiquidations
} from "../lib/market-sim.js";
import { buildVipStatus } from "../lib/vip.js";
import { applyReadCacheHeaders, invalidateReadCache, readThroughCache } from "../lib/read-cache.js";
import { settlementService } from "../lib/settlement-service.js";

const CORS_METHODS = "POST, OPTIONS";
const MARKET_SIM_TX_SOURCE = "market_sim";

function accountKey(address) {
    return `market_sim:${String(address || "").toLowerCase()}`;
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

function tryNormalizeAddress(rawAddress) {
    if (!rawAddress) return "";
    try {
        return ethers.getAddress(String(rawAddress).trim()).toLowerCase();
    } catch {
        return "";
    }
}

function applyMarketReadHeaders(res, meta) {
    if (!res) return;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    applyReadCacheHeaders(res, meta);
}

async function invalidateMarketReadCaches(address) {
    const normalized = tryNormalizeAddress(address);
    if (!normalized) return;
    await Promise.all([
        invalidateReadCache("market-snapshot", [normalized]),
        invalidateReadCache("wallet-balance", [normalized]),
        invalidateReadCache("wallet-summary", [normalized])
    ]);
}

async function loadMarketObject(nowTs) {
    const cached = await readThroughCache({
        namespace: "market-global",
        keyParts: ["snapshot"],
        tier: "market-global",
        loader: async () => ({
            generatedAt: new Date().toISOString(),
            market: buildMarketSnapshot(nowTs)
        })
    });
    return cached.value && cached.value.market ? cached.value.market : buildMarketSnapshot(nowTs);
}

async function hydrateAccountState(userAddress, nowTs, market) {
    const key = accountKey(userAddress);
    const decimals = await settlementService.getDecimals();
    const [walletBalanceWei, totalBet, rawAccount] = await Promise.all([
        settlementService.contract.balanceOf(userAddress),
        kv.get(`total_bet:${userAddress}`),
        kv.get(key)
    ]);

    const walletBalance = Number(ethers.formatUnits(walletBalanceWei, decimals));
    let account = normalizeMarketAccount(rawAccount, nowTs);
    if (!account || typeof account !== "object" || !account.createdAt) {
        account = createDefaultMarketAccount(nowTs, walletBalance);
    }

    account.cash = walletBalance;
    account.updatedAt = new Date(nowTs).toISOString();

    return {
        key,
        account,
        decimals,
        totalBet: Number(totalBet || 0),
        vipStatus: buildVipStatus(Number(totalBet || 0))
    };
}

async function buildSnapshotPayload(userAddress) {
    const nowTs = Date.now();
    const market = await loadMarketObject(nowTs);
    const state = await hydrateAccountState(userAddress, nowTs, market);
    const liquidationEvents = settleLiquidations(state.account, market, nowTs);
    const syncedWalletBalanceWei = await settlementService.contract.balanceOf(userAddress);

    state.account.cash = Number(ethers.formatUnits(syncedWalletBalanceWei, state.decimals));
    state.account.updatedAt = new Date().toISOString();
    await kv.set(state.key, state.account);

    return {
        success: true,
        action: "snapshot",
        account: buildAccountSummary(state.account, market),
        market,
        totalBet: state.totalBet.toFixed(2),
        vipLevel: state.vipStatus.vipLevel,
        maxBet: String(state.vipStatus.maxBet),
        levelSystem: { key: "legacy_v1", label: "legacy_v1" },
        params: { bankAnnualRate: BANK_ANNUAL_RATE, loanAnnualRate: LOAN_ANNUAL_RATE },
        walletBalance: state.account.cash,
        liquidationEvents,
        actionResult: null,
        generatedAt: new Date().toISOString()
    };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", CORS_METHODS);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    try {
        const body = getSafeBody(req);
        const sessionId = String(body.sessionId || "").trim();
        const action = String(body.action || "snapshot").trim().toLowerCase();

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "Missing sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "Session expired" });
        }

        const userAddress = tryNormalizeAddress(session.address);
        if (!userAddress) {
            return res.status(403).json({ success: false, error: "Session address is invalid" });
        }

        if (action === "snapshot") {
            const cached = await readThroughCache({
                namespace: "market-snapshot",
                keyParts: [userAddress],
                tier: "market-snapshot",
                loader: async () => buildSnapshotPayload(userAddress)
            });
            applyMarketReadHeaders(res, cached.meta);
            return res.status(200).json(cached.value);
        }

        const nowTs = Date.now();
        const market = await loadMarketObject(nowTs);
        const state = await hydrateAccountState(userAddress, nowTs, market);
        const liquidationEvents = settleLiquidations(state.account, market, nowTs);
        const previousAccountState = JSON.parse(JSON.stringify(state.account));
        let actionResult = null;

        try {
            if (action === "reset") {
                state.account = createDefaultMarketAccount(nowTs, state.account.cash);
            } else if (action === "buy_stock") {
                actionResult = buyStock(state.account, market, body.symbol, body.quantity);
                const tradeCostWei = ethers.parseUnits(Number(actionResult.total).toFixed(6), state.decimals);
                await settlementService.settle({
                    userAddress,
                    betWei: tradeCostWei,
                    payoutWei: 0n,
                    source: MARKET_SIM_TX_SOURCE,
                    meta: { action, symbol: body.symbol }
                });
            } else if (action === "sell_stock") {
                actionResult = sellStock(state.account, market, body.symbol, body.quantity);
                const payoutWei = ethers.parseUnits(Number(actionResult.net).toFixed(6), state.decimals);
                await settlementService.settle({
                    userAddress,
                    betWei: 0n,
                    payoutWei,
                    source: MARKET_SIM_TX_SOURCE,
                    meta: { action, symbol: body.symbol }
                });
            } else if (action === "open_futures") {
                actionResult = openFutures(state.account, market, {
                    symbol: body.symbol,
                    side: body.side,
                    margin: body.margin,
                    leverage: body.leverage,
                    maxMargin: state.vipStatus.maxBet
                });
                const totalCharge = Number(actionResult.margin) + Number(actionResult.fee || 0);
                const totalChargeWei = ethers.parseUnits(Number(totalCharge).toFixed(6), state.decimals);
                await settlementService.settle({
                    userAddress,
                    betWei: totalChargeWei,
                    payoutWei: 0n,
                    source: MARKET_SIM_TX_SOURCE,
                    meta: { action, symbol: body.symbol, side: body.side }
                });
            } else if (action === "close_futures") {
                actionResult = closeFutures(state.account, market, body.positionId);
                const payoutAmount = Math.max(0, Number(actionResult.refund || 0) - Number(actionResult.fee || 0));
                if (payoutAmount > 0) {
                    const payoutWei = ethers.parseUnits(Number(payoutAmount).toFixed(6), state.decimals);
                    await settlementService.settle({
                        userAddress,
                        betWei: 0n,
                        payoutWei,
                        source: MARKET_SIM_TX_SOURCE,
                        meta: { action, positionId: body.positionId }
                    });
                }
            } else if (action === "bank_deposit") {
                actionResult = bankDeposit(state.account, body.amount);
                const amountWei = ethers.parseUnits(Number(actionResult.amount).toFixed(6), state.decimals);
                await settlementService.settle({
                    userAddress,
                    betWei: amountWei,
                    payoutWei: 0n,
                    source: MARKET_SIM_TX_SOURCE,
                    meta: { action }
                });
            } else if (action === "bank_withdraw") {
                actionResult = bankWithdraw(state.account, body.amount);
                const amountWei = ethers.parseUnits(Number(actionResult.amount).toFixed(6), state.decimals);
                await settlementService.settle({
                    userAddress,
                    betWei: 0n,
                    payoutWei: amountWei,
                    source: MARKET_SIM_TX_SOURCE,
                    meta: { action }
                });
            } else if (action === "borrow") {
                actionResult = borrowLoan(state.account, market, body.amount);
                const amountWei = ethers.parseUnits(Number(actionResult.amount).toFixed(6), state.decimals);
                await settlementService.settle({
                    userAddress,
                    betWei: 0n,
                    payoutWei: amountWei,
                    source: MARKET_SIM_TX_SOURCE,
                    meta: { action }
                });
            } else if (action === "repay") {
                actionResult = repayLoan(state.account, body.amount);
                const amountWei = ethers.parseUnits(Number(actionResult.amount).toFixed(6), state.decimals);
                await settlementService.settle({
                    userAddress,
                    betWei: amountWei,
                    payoutWei: 0n,
                    source: MARKET_SIM_TX_SOURCE,
                    meta: { action }
                });
            } else {
                return res.status(400).json({ success: false, error: `Unsupported action: ${action}` });
            }

            const syncedWalletBalanceWei = await settlementService.contract.balanceOf(userAddress);
            state.account.cash = Number(ethers.formatUnits(syncedWalletBalanceWei, state.decimals));
            state.account.updatedAt = new Date().toISOString();
            await kv.set(state.key, state.account);
            await invalidateMarketReadCaches(userAddress);

            return res.status(200).json({
                success: true,
                action,
                account: buildAccountSummary(state.account, market),
                market,
                totalBet: state.totalBet.toFixed(2),
                vipLevel: state.vipStatus.vipLevel,
                maxBet: String(state.vipStatus.maxBet),
                levelSystem: { key: "legacy_v1", label: "legacy_v1" },
                params: { bankAnnualRate: BANK_ANNUAL_RATE, loanAnnualRate: LOAN_ANNUAL_RATE },
                walletBalance: state.account.cash,
                liquidationEvents,
                actionResult
            });
        } catch (actionError) {
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
