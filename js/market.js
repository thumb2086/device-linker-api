var marketPayload = null;
var marketSymbolsLoaded = false;
var marketBusy = false;

function fmt(value, digits) {
    var num = Number(value || 0);
    if (!isFinite(num)) num = 0;
    return num.toLocaleString(undefined, {
        minimumFractionDigits: digits === undefined ? 2 : digits,
        maximumFractionDigits: digits === undefined ? 2 : digits
    });
}

function setStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff6666' : '#ffd36a';
}

function withBusy(task) {
    if (marketBusy) return Promise.reject(new Error('請稍候，上一筆操作仍在處理'));
    marketBusy = true;
    return task().finally(function () {
        marketBusy = false;
    });
}

function callMarket(action, payload) {
    var body = {
        sessionId: user.sessionId,
        action: action
    };

    if (payload && typeof payload === 'object') {
        Object.keys(payload).forEach(function (key) {
            body[key] = payload[key];
        });
    }

    return fetch('/api/market-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (res) { return res.json(); });
}

function renderMarketTable(market) {
    var table = document.getElementById('market-table');
    if (!table || !market || !market.symbols) return;

    var html = '<div class="market-row header"><span>標的</span><span>價格</span><span>漲跌%</span><span>類型</span></div>';

    Object.keys(market.symbols).forEach(function (symbol) {
        var item = market.symbols[symbol];
        var cls = item.changePct >= 0 ? 'change-up' : 'change-down';
        var sign = item.changePct >= 0 ? '+' : '';
        html += '<div class="market-row">' +
            '<span>' + symbol + ' <small>(' + item.name + ')</small></span>' +
            '<span>' + fmt(item.price, 4) + '</span>' +
            '<span class="' + cls + '">' + sign + fmt(item.changePct, 3) + '%</span>' +
            '<span>' + item.type + '</span>' +
            '</div>';
    });

    table.innerHTML = html;
}

function renderFutures(account) {
    var list = document.getElementById('futures-list');
    if (!list) return;

    if (!account || !account.futuresPositions || account.futuresPositions.length === 0) {
        list.innerHTML = '<div class="history-item">目前沒有期貨倉位</div>';
        return;
    }

    var html = '';
    account.futuresPositions.forEach(function (pos) {
        var pnlClass = pos.unrealizedPnl >= 0 ? 'change-up' : 'change-down';
        html += '<div class="position-item">' +
            '<div>' +
            '<strong>' + pos.symbol + ' ' + (pos.side === 'short' ? '做空' : '做多') + ' x' + pos.leverage + '</strong>' +
            '<div class="meta">開倉: ' + fmt(pos.entryPrice, 4) + ' | 現價: ' + fmt(pos.markPrice, 4) + ' | 強平: ' + fmt(pos.liquidationPrice, 4) + '</div>' +
            '</div>' +
            '<div class="' + pnlClass + '">PnL ' + fmt(pos.unrealizedPnl, 2) + ' (' + fmt(pos.roiPct, 2) + '%)</div>' +
            '<button class="btn-secondary" onclick="closeFuturesPosition(\'' + pos.id + '\')">平倉</button>' +
            '</div>';
    });

    list.innerHTML = html;
}

function renderStocks(account) {
    var list = document.getElementById('stock-holdings');
    if (!list) return;

    if (!account || !account.stockPositions || account.stockPositions.length === 0) {
        list.innerHTML = '<div class="history-item">目前沒有股票持倉</div>';
        return;
    }

    var html = '';
    account.stockPositions.forEach(function (pos) {
        html += '<div class="position-item">' +
            '<div>' +
            '<strong>' + pos.symbol + '</strong>' +
            '<div class="meta">持有 ' + fmt(pos.quantity, 4) + ' 股 | 現價 ' + fmt(pos.price, 4) + '</div>' +
            '</div>' +
            '<div>市值 ' + fmt(pos.marketValue, 2) + ' ZXC</div>' +
            '<div></div>' +
            '</div>';
    });

    list.innerHTML = html;
}

function renderHistory(account) {
    var el = document.getElementById('history-log');
    if (!el) return;

    if (!account || !account.history || account.history.length === 0) {
        el.innerHTML = '<div class="history-item">目前沒有紀錄</div>';
        return;
    }

    var html = '';
    account.history.forEach(function (item) {
        html += '<div class="history-item">[' + item.at + '] ' + item.type + ' ' + JSON.stringify(item) + '</div>';
    });

    el.innerHTML = html;
}

function renderOverview(payload) {
    if (!payload || !payload.account || !payload.market) return;

    var account = payload.account;
    var market = payload.market;

    document.getElementById('sim-cash').innerText = fmt(account.cash, 2);
    document.getElementById('sim-bank').innerText = fmt(account.bankBalance, 2);
    document.getElementById('sim-loan').innerText = fmt(account.loanPrincipal, 2);
    document.getElementById('sim-net').innerText = fmt(account.netWorth, 2);
    document.getElementById('market-vol').innerText = fmt(market.marketVolatilityPct, 2) + '%';
    document.getElementById('fg-index').innerText = String(market.fearGreedIndex);
    var futuresMaxBetEl = document.getElementById('futures-max-bet');
    if (futuresMaxBetEl && payload.maxBet !== undefined) {
        futuresMaxBetEl.innerText = formatCompactZh(payload.maxBet, 2) + ' ZXC';
    }

    updateUI({
        balance: account.cash,
        totalBet: payload.totalBet,
        vipLevel: payload.vipLevel,
        maxBet: payload.maxBet
    });
    renderMarketTable(market);
    renderStocks(account);
    renderFutures(account);
    renderHistory(account);
    renderLiquidations(payload.liquidationEvents || []);

    marketPayload = payload;

    if (!marketSymbolsLoaded) {
        loadSymbolOptions(market.symbols);
        marketSymbolsLoaded = true;
    }
}

function renderLiquidations(events) {
    var el = document.getElementById('liquidation-log');
    if (!el) return;

    if (!events || events.length === 0) {
        el.innerHTML = '';
        return;
    }

    var html = '⚠️ 已強平: ';
    events.forEach(function (event) {
        html += event.symbol + ' #' + event.positionId + ' '; 
    });
    el.innerHTML = html;
}

function loadSymbolOptions(symbols) {
    var stockEl = document.getElementById('stock-symbol');
    var futuresEl = document.getElementById('futures-symbol');
    if (!stockEl || !futuresEl || !symbols) return;

    var stockHtml = '';
    var futuresHtml = '';

    Object.keys(symbols).forEach(function (symbol) {
        var item = symbols[symbol];
        if (item.type === 'stock') {
            stockHtml += '<option value="' + symbol + '">' + symbol + ' - ' + item.name + '</option>';
        }
        futuresHtml += '<option value="' + symbol + '">' + symbol + ' - ' + item.name + '</option>';
    });

    stockEl.innerHTML = stockHtml;
    futuresEl.innerHTML = futuresHtml;
}

function refreshMarket(silent) {
    if (silent && marketBusy) return Promise.resolve();
    if (!silent) setStatus('同步行情中...', false);

    return withBusy(function () {
        return callMarket('snapshot').then(function (data) {
            if (!data || !data.success) {
                throw new Error((data && data.error) || '行情同步失敗');
            }
            renderOverview(data);
            if (!silent) setStatus('行情已更新', false);
        });
    }).catch(function (e) {
        setStatus('錯誤: ' + e.message, true);
    });
}

function submitStock(action) {
    var symbol = document.getElementById('stock-symbol').value;
    var quantity = Number(document.getElementById('stock-qty').value || 0);

    setStatus('送出股票交易中...', false);
    withBusy(function () {
        return callMarket(action, {
            symbol: symbol,
            quantity: quantity
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '交易失敗');
            renderOverview(data);
            setStatus('股票交易完成', false);
        });
    }).catch(function (e) {
        setStatus('錯誤: ' + e.message, true);
    });
}

function openFuturesPosition() {
    var symbol = document.getElementById('futures-symbol').value;
    var side = document.getElementById('futures-side').value;
    var margin = Number(document.getElementById('futures-margin').value || 0);
    var leverage = Number(document.getElementById('futures-leverage').value || 1);

    setStatus('期貨開倉中...', false);
    withBusy(function () {
        return callMarket('open_futures', {
            symbol: symbol,
            side: side,
            margin: margin,
            leverage: leverage
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '開倉失敗');
            renderOverview(data);
            setStatus('期貨開倉成功', false);
        });
    }).catch(function (e) {
        setStatus('錯誤: ' + e.message, true);
    });
}

function closeFuturesPosition(positionId) {
    if (!positionId) return;
    setStatus('期貨平倉中...', false);

    withBusy(function () {
        return callMarket('close_futures', { positionId: positionId }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '平倉失敗');
            renderOverview(data);
            setStatus('期貨平倉完成', false);
        });
    }).catch(function (e) {
        setStatus('錯誤: ' + e.message, true);
    });
}

function submitBank(action) {
    var amount = Number(document.getElementById('bank-amount').value || 0);
    setStatus(action === 'bank_deposit' ? '存款中...' : '提款中...', false);

    withBusy(function () {
        return callMarket(action, { amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '銀行操作失敗');
            renderOverview(data);
            setStatus('銀行操作完成', false);
        });
    }).catch(function (e) {
        setStatus('錯誤: ' + e.message, true);
    });
}

function submitLoan(action) {
    var amount = Number(document.getElementById('loan-amount').value || 0);
    setStatus(action === 'borrow' ? '借款中...' : '還款中...', false);

    withBusy(function () {
        return callMarket(action, { amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '貸款操作失敗');
            renderOverview(data);
            setStatus('貸款操作完成', false);
        });
    }).catch(function (e) {
        setStatus('錯誤: ' + e.message, true);
    });
}

function resetSimulation() {
    if (!window.confirm('確定要重置模擬帳戶嗎？')) return;
    setStatus('重置中...', false);

    withBusy(function () {
        return callMarket('reset').then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '重置失敗');
            renderOverview(data);
            setStatus('模擬帳戶已重置', false);
        });
    }).catch(function (e) {
        setStatus('錯誤: ' + e.message, true);
    });
}

function initMarketPage() {
    refreshMarket(false);
    setInterval(function () {
        refreshMarket(true);
    }, 10000);
}
