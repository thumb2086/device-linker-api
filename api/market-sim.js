import { kv } from '@vercel/kv';
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

const CORS_METHODS = 'POST, OPTIONS';

function accountKey(address) {
    return `market_sim:${String(address || "").toLowerCase()}`;
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

        const session = await kv.get(`session:${sessionId}`);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const key = accountKey(session.address);
        const nowTs = Date.now();
        const market = buildMarketSnapshot(nowTs);

        let account = normalizeMarketAccount(await kv.get(key), nowTs);
        let actionResult = null;

        const liquidationEvents = settleLiquidations(account, market, nowTs);

        try {
            if (action === "reset") {
                account = createDefaultMarketAccount(nowTs);
            } else if (action === "buy_stock") {
                actionResult = buyStock(account, market, body.symbol, body.quantity);
            } else if (action === "sell_stock") {
                actionResult = sellStock(account, market, body.symbol, body.quantity);
            } else if (action === "open_futures") {
                actionResult = openFutures(account, market, {
                    symbol: body.symbol,
                    side: body.side,
                    margin: body.margin,
                    leverage: body.leverage
                });
            } else if (action === "close_futures") {
                actionResult = closeFutures(account, market, body.positionId);
            } else if (action === "bank_deposit") {
                actionResult = bankDeposit(account, body.amount);
            } else if (action === "bank_withdraw") {
                actionResult = bankWithdraw(account, body.amount);
            } else if (action === "borrow") {
                actionResult = borrowLoan(account, market, body.amount);
            } else if (action === "repay") {
                actionResult = repayLoan(account, body.amount);
            } else if (action !== "snapshot") {
                return res.status(400).json({ success: false, error: `不支援 action: ${action}` });
            }
        } catch (actionError) {
            await kv.set(key, account);
            return res.status(400).json({
                success: false,
                action,
                error: actionError.message,
                account: buildAccountSummary(account, market),
                market,
                liquidationEvents
            });
        }

        await kv.set(key, account);

        return res.status(200).json({
            success: true,
            action,
            account: buildAccountSummary(account, market),
            market,
            params: {
                bankAnnualRate: BANK_ANNUAL_RATE,
                loanAnnualRate: LOAN_ANNUAL_RATE
            },
            liquidationEvents,
            actionResult
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || "market sim failed"
        });
    }
}
