var marketPayload = null;
var marketSymbolsLoaded = false;
var marketBusy = false;
var marketRefreshBusy = false;
var marketRefreshTimerId = null;
var marketHasRendered = false;

var MARKET_PERSISTED_CACHE_KEY = "zixi_market_persisted_cache_v1";

function fmt(value, digits) {
    return formatDisplayNumber(Number(value || 0), digits === undefined ? 2 : digits);
}

function fmtPercent(value) {
    var num = Number(value || 0);
    if (!isFinite(num)) num = 0;
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }) + "%";
}

function escapeMarketHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function setStatus(text, isError) {
    var el = document.getElementById("status-msg");
    if (!el) return;
    el.innerText = text || "";
    el.style.color = isError ? "#ff6666" : "#ffd36a";
}

function formatGeneratedTime(rawValue) {
    var parsed = Date.parse(String(rawValue || ""));
    if (!Number.isFinite(parsed)) return "";
    return new Date(parsed).toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function buildMarketStatusText(cacheStatus, generatedAt) {
    var parts = [];
    if (cacheStatus) parts.push("快取 " + cacheStatus);
    var generatedText = formatGeneratedTime(generatedAt);
    if (generatedText) parts.push("生成於 " + generatedText);
    return parts.join(" | ");
}

function formatSignedMarketDelta(value, pctValue) {
    var amount = Number(value || 0);
    var percent = Number(pctValue || 0);
    var amountPrefix = amount > 0 ? "+" : "";
    var percentPrefix = percent > 0 ? "+" : "";
    return amountPrefix + fmt(amount, 2) + " 子熙幣 (" + percentPrefix + fmt(percent, 2) + "%)";
}

function setMarketCacheMeta(text, isError) {
    var el = document.getElementById("market-cache-meta");
    if (!el) return;
    el.innerText = text || "";
    el.style.color = isError ? "#ff8d8d" : "#96a1b7";
}

function getMarketStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

function getMarketCacheKey() {
    return "market:" + String((window.user && window.user.address) || "").trim().toLowerCase();
}

function readPersistedMarketCache() {
    var storage = getMarketStorage();
    if (!storage) return {};
    try {
        var raw = storage.getItem(MARKET_PERSISTED_CACHE_KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writePersistedMarketCache(nextValue) {
    var storage = getMarketStorage();
    if (!storage) return;
    try {
        storage.setItem(MARKET_PERSISTED_CACHE_KEY, JSON.stringify(nextValue || {}));
    } catch (error) {
        console.log("Failed to persist market cache");
    }
}

function persistMarketSnapshot(payload) {
    if (!payload || !payload.account || !payload.market) return;
    var cacheKey = getMarketCacheKey();
    if (!cacheKey) return;

    var current = readPersistedMarketCache();
    current[cacheKey] = {
        savedAt: new Date().toISOString(),
        payload: payload
    };
    writePersistedMarketCache(current);
}

function loadPersistedMarketSnapshot() {
    var cacheKey = getMarketCacheKey();
    if (!cacheKey) return null;

    var current = readPersistedMarketCache();
    if (!current || !current[cacheKey] || !current[cacheKey].payload) return null;
    return current[cacheKey];
}

function withBusy(task) {
    if (marketBusy) return Promise.reject(new Error("目前還有其他操作進行中"));
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

    if (payload && typeof payload === "object") {
        Object.keys(payload).forEach(function (key) {
            body[key] = payload[key];
        });
    }

    return fetch("/api/market-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }).then(function (res) {
        return res.json();
    });
}

function fetchMarketSnapshot() {
    return fetch("/api/market-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sessionId: user.sessionId,
            action: "snapshot"
        })
    }).then(function (res) {
        return res.json().then(function (data) {
            return {
                data: data,
                cacheStatus: res.headers.get("X-Cache"),
                generatedAt: res.headers.get("X-Generated-At")
            };
        });
    });
}

function safeHistoryStringify(value) {
    var seen = [];
    try {
        return JSON.stringify(value, function (key, nextValue) {
            if (nextValue && typeof nextValue === "object") {
                if (seen.indexOf(nextValue) >= 0) return "[Circular]";
                seen.push(nextValue);
            }
            return nextValue;
        });
    } catch (error) {
        return "[資料過大，無法完整顯示]";
    }
}

function sparklineSvg(prices, width, height, cls) {
    if (!prices || prices.length === 0) return "";

    var w = width || 120;
    var h = height || 36;
    var min = Math.min.apply(null, prices);
    var max = Math.max.apply(null, prices);

    if (!isFinite(min) || !isFinite(max)) return "";
    if (min === max) max = min + 1;

    var len = prices.length;
    var step = len > 1 ? w / (len - 1) : w;
    var points = "";

    for (var i = 0; i < len; i += 1) {
        var x = i * step;
        var value = prices[i];
        var y = h - ((value - min) / (max - min)) * h;
        points += x.toFixed(2) + "," + y.toFixed(2) + " ";
    }

    return '<svg class="sparkline ' + (cls || "") + '" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' +
        '<polyline points="' + points.trim() + '"></polyline>' +
        "</svg>";
}

function renderMarketTable(market) {
    var table = document.getElementById("market-table");
    if (!table || !market || !market.symbols) return;

    var html = '<div class="market-row header"><span>商品</span><span>價格</span><span>漲跌幅</span><span>類型</span><span>走勢</span></div>';

    Object.keys(market.symbols).forEach(function (symbol) {
        var item = market.symbols[symbol];
        var cls = item.changePct >= 0 ? "change-up" : "change-down";
        var sign = item.changePct >= 0 ? "+" : "";
        var history = market.history && market.history[symbol] ? market.history[symbol] : [];

        html += '<div class="market-row">' +
            "<span>" + escapeMarketHtml(symbol) + " <small>(" + escapeMarketHtml(item.name) + ")</small></span>" +
            "<span>" + fmt(item.price, 4) + "</span>" +
            '<span class="' + cls + '">' + sign + fmt(item.changePct, 3) + "%</span>" +
            "<span>" + escapeMarketHtml(item.type) + "</span>" +
            "<span>" + sparklineSvg(history, 120, 36, cls) + "</span>" +
            "</div>";
    });

    table.innerHTML = html;
}

function renderFutures(account) {
    var list = document.getElementById("futures-list");
    if (!list) return;

    if (!account || !account.futuresPositions || account.futuresPositions.length === 0) {
        list.innerHTML = '<div class="history-item">目前沒有期貨倉位</div>';
        return;
    }

    var html = "";
    account.futuresPositions.forEach(function (pos) {
        var pnlClass = pos.unrealizedPnl >= 0 ? "change-up" : "change-down";
        html += '<div class="position-item">' +
            "<div>" +
            "<strong>" + escapeMarketHtml(pos.symbol) + " " + (pos.side === "short" ? "做空" : "做多") + " x" + fmt(pos.leverage, 0) + "</strong>" +
            '<div class="meta">名目價值 ' + fmt(pos.notional, 2) + " 子熙幣 | 保證金 " + fmt(pos.margin, 2) + " 子熙幣</div>" +
            '<div class="meta">進場價 ' + fmt(pos.entryPrice, 4) + " | 現價 " + fmt(pos.markPrice, 4) + " | 強平價 " + fmt(pos.liquidationPrice, 4) + "</div>" +
            "</div>" +
            '<div class="' + pnlClass + '">' + formatSignedMarketDelta(pos.unrealizedPnl, pos.roiPct) + "</div>" +
            '<button class="btn-secondary" onclick="closeFuturesPosition(\'' + escapeMarketHtml(pos.id) + '\')">平倉</button>' +
            "</div>";
    });

    list.innerHTML = html;
}

function renderStocks(account, market) {
    var list = document.getElementById("stock-holdings");
    if (!list) return;

    if (!account || !account.stockPositions || account.stockPositions.length === 0) {
        list.innerHTML = '<div class="history-item">目前沒有股票持倉</div>';
        return;
    }

    var html = "";
    account.stockPositions.forEach(function (pos) {
        var currentQuote = market && market.symbols ? market.symbols[pos.symbol] : null;
        var avgPrice = Number(pos.avgPrice || 0);
        var price = Number(pos.price || 0);
        var quantity = Number(pos.quantity || 0);
        var unrealizedPnl = (price - avgPrice) * quantity;
        var roiPct = avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : 0;
        var pnlClass = unrealizedPnl >= 0 ? "change-up" : "change-down";
        var dayChangePct = currentQuote ? Number(currentQuote.changePct || 0) : 0;
        var dayChangeClass = dayChangePct >= 0 ? "change-up" : "change-down";
        var dayChangePrefix = dayChangePct >= 0 ? "+" : "";

        html += '<div class="position-item">' +
            "<div>" +
            "<strong>" + escapeMarketHtml(pos.symbol) + "</strong>" +
            '<div class="meta">持有 ' + fmt(pos.quantity, 4) + " 股 | 均價 " + fmt(pos.avgPrice, 4) + " | 現價 " + fmt(pos.price, 4) + "</div>" +
            '<div class="meta ' + dayChangeClass + '">今日漲跌 ' + dayChangePrefix + fmt(dayChangePct, 2) + "%</div>" +
            "</div>" +
            '<div class="' + pnlClass + '">' + formatSignedMarketDelta(unrealizedPnl, roiPct) + "</div>" +
            "<div>市值 " + fmt(pos.marketValue, 2) + " 子熙幣</div>" +
            "</div>";
    });

    list.innerHTML = html;
}

function renderHistory(account) {
    var el = document.getElementById("history-log");
    if (!el) return;

    if (!account || !account.history || account.history.length === 0) {
        el.innerHTML = '<div class="history-item">目前沒有操作紀錄</div>';
        return;
    }

    var html = "";
    account.history.forEach(function (item) {
        var payloadText = safeHistoryStringify(item);
        html += '<div class="history-item">[' + escapeMarketHtml(item.at) + "] " + escapeMarketHtml(item.type) + " " + escapeMarketHtml(payloadText) + "</div>";
    });

    el.innerHTML = html;
}

function renderLiquidations(events) {
    var el = document.getElementById("liquidation-log");
    if (!el) return;

    if (!events || events.length === 0) {
        el.innerHTML = "";
        return;
    }

    el.innerText = "已觸發強平: " + events.map(function (event) {
        return event.symbol + " #" + event.positionId;
    }).join("、");
}

function loadSymbolOptions(symbols) {
    var stockEl = document.getElementById("stock-symbol");
    var futuresEl = document.getElementById("futures-symbol");
    if (!stockEl || !futuresEl || !symbols) return;

    var stockHtml = "";
    var futuresHtml = "";

    Object.keys(symbols).forEach(function (symbol) {
        var item = symbols[symbol];
        if (item.type === "stock") {
            stockHtml += '<option value="' + escapeMarketHtml(symbol) + '">' + escapeMarketHtml(symbol) + " - " + escapeMarketHtml(item.name) + "</option>";
        }
        futuresHtml += '<option value="' + escapeMarketHtml(symbol) + '">' + escapeMarketHtml(symbol) + " - " + escapeMarketHtml(item.name) + "</option>";
    });

    stockEl.innerHTML = stockHtml;
    futuresEl.innerHTML = futuresHtml;
}

function renderOverview(payload) {
    if (!payload || !payload.account || !payload.market) return;

    var account = payload.account;
    var market = payload.market;
    var betLimit = payload.betLimit !== undefined ? payload.betLimit : payload.maxBet;

    var simCash = document.getElementById("sim-cash");
    var simBank = document.getElementById("sim-bank");
    var simLoan = document.getElementById("sim-loan");
    var simNet = document.getElementById("sim-net");
    var marketVol = document.getElementById("market-vol");
    var fgIndex = document.getElementById("fg-index");
    var bankRateLabel = document.getElementById("bank-rate-label");
    var loanRateLabel = document.getElementById("loan-rate-label");
    var futuresMaxBetEl = document.getElementById("futures-max-bet");

    if (simCash) simCash.innerText = fmt(account.cash, 2);
    if (simBank) simBank.innerText = fmt(account.bankBalance, 2);
    if (simLoan) simLoan.innerText = fmt(account.loanPrincipal, 2);
    if (simNet) simNet.innerText = fmt(account.netWorth, 2);
    if (marketVol) marketVol.innerText = fmt(market.marketVolatilityPct, 2) + "%";
    if (fgIndex) fgIndex.innerText = String(market.fearGreedIndex || 0);
    if (bankRateLabel && payload.params) bankRateLabel.innerText = fmtPercent(payload.params.bankAnnualRate || 0);
    if (loanRateLabel && payload.params) loanRateLabel.innerText = fmtPercent(payload.params.loanAnnualRate || 0);
    if (futuresMaxBetEl && betLimit !== undefined) futuresMaxBetEl.innerText = formatDisplayNumber(betLimit, 2) + " 子熙幣";

    updateUI({
        balance: account.cash,
        totalBet: payload.totalBet,
        level: payload.level || payload.vipLevel,
        betLimit: betLimit
    }, { skipGlobalHooks: true });

    renderMarketTable(market);
    renderStocks(account, market);
    renderFutures(account);
    renderHistory(account);
    renderLiquidations(payload.liquidationEvents || []);

    marketPayload = payload;
    marketHasRendered = true;

    if (!marketSymbolsLoaded) {
        loadSymbolOptions(market.symbols);
        marketSymbolsLoaded = true;
    }
}

function refreshMarket(silent, options) {
    var opts = options && typeof options === "object" ? options : {};
    if (marketRefreshBusy || marketBusy) return Promise.resolve();

    var persisted = !opts.forceRefresh ? loadPersistedMarketSnapshot() : null;
    if (!silent) {
        if (persisted && persisted.payload && !marketHasRendered) {
            renderOverview(persisted.payload);
            setStatus("先顯示上次金融市場快照，背景更新中...", false);
            setMarketCacheMeta(buildMarketStatusText("STALE", persisted.payload.generatedAt || persisted.savedAt) || "已載入上次快照", false);
        } else if (!marketHasRendered) {
            setStatus("載入中...", false);
        }
    }

    marketRefreshBusy = true;
    return fetchMarketSnapshot()
        .then(function (result) {
            var data = result.data;
            if (!data || !data.success) {
                throw new Error((data && data.error) || "金融市場資料載入失敗");
            }

            if (!data.generatedAt && result.generatedAt) {
                data.generatedAt = result.generatedAt;
            }

            renderOverview(data);
            persistMarketSnapshot(data);

            if (!silent) {
                setStatus("金融市場已同步", false);
            }
            setMarketCacheMeta(buildMarketStatusText(result.cacheStatus, data.generatedAt) || "金融市場已更新", false);
        })
        .catch(function (error) {
            if (marketHasRendered) {
                setStatus("同步失敗，暫時保留目前快照: " + error.message, true);
            } else {
                setStatus("載入失敗: " + error.message, true);
            }
            setMarketCacheMeta("金融市場載入失敗", true);
        })
        .finally(function () {
            marketRefreshBusy = false;
        });
}

function submitStock(action) {
    var symbol = document.getElementById("stock-symbol").value;
    var quantity = Number(document.getElementById("stock-qty").value || 0);
    if (quantity <= 0) return;

    var btn = event && event.target && event.target.tagName === "BUTTON" ? event.target : null;
    var oldText = btn ? btn.innerText : "";
    if (btn) {
        btn.disabled = true;
        btn.innerText = "處理中...";
    }

    if (window.audioManager) window.audioManager.play("bet");
    setStatus(action === "buy_stock" ? "買入中..." : "賣出中...", false);

    withBusy(function () {
        return callMarket(action, {
            symbol: symbol,
            quantity: quantity
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || "股票交易失敗");
            renderOverview(data);
            persistMarketSnapshot(data);
            setStatus("股票交易完成", false);
            setMarketCacheMeta("已套用最新交易結果", false);
            showUserToast("股票交易成功");
            if (window.audioManager) window.audioManager.play("win_small");
        });
    }).catch(function (error) {
        setStatus("操作失敗: " + error.message, true);
        showUserToast(error.message, true);
    }).finally(function () {
        if (btn) {
            btn.disabled = false;
            btn.innerText = oldText;
        }
    });
}

function openFuturesPosition() {
    var symbol = document.getElementById("futures-symbol").value;
    var side = document.getElementById("futures-side").value;
    var margin = Number(document.getElementById("futures-margin").value || 0);
    var leverage = Number(document.getElementById("futures-leverage").value || 1);
    if (margin <= 0) return;

    var btn = document.querySelector('button[onclick="openFuturesPosition()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "處理中...";
    }

    if (window.audioManager) window.audioManager.play("bet");
    setStatus("期貨開倉中...", false);

    withBusy(function () {
        return callMarket("open_futures", {
            symbol: symbol,
            side: side,
            margin: margin,
            leverage: leverage
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || "期貨開倉失敗");
            renderOverview(data);
            persistMarketSnapshot(data);
            setStatus("期貨開倉完成", false);
            setMarketCacheMeta("已套用最新交易結果", false);
            showUserToast("期貨開倉成功");
            if (window.audioManager) window.audioManager.play("win_small");
        });
    }).catch(function (error) {
        setStatus("操作失敗: " + error.message, true);
        showUserToast(error.message, true);
    }).finally(function () {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "開倉";
        }
    });
}

function closeFuturesPosition(positionId) {
    if (!positionId) return;

    var btn = event && event.target && event.target.tagName === "BUTTON" ? event.target : null;
    if (btn) {
        btn.disabled = true;
        btn.innerText = "處理中...";
    }

    if (window.audioManager) window.audioManager.play("bet");
    setStatus("平倉中...", false);

    withBusy(function () {
        return callMarket("close_futures", { positionId: positionId }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || "期貨平倉失敗");
            renderOverview(data);
            persistMarketSnapshot(data);
            setStatus("平倉完成", false);
            setMarketCacheMeta("已套用最新交易結果", false);
            showUserToast("期貨平倉成功");
            if (window.audioManager) window.audioManager.play("win_small");
        });
    }).catch(function (error) {
        setStatus("操作失敗: " + error.message, true);
        showUserToast(error.message, true);
    }).finally(function () {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "平倉";
        }
    });
}

function submitBank(action) {
    var amount = String(document.getElementById("bank-amount").value || "").trim();
    if (!amount || Number(amount) <= 0) return;

    var btn = event && event.target && event.target.tagName === "BUTTON" ? event.target : null;
    var oldText = btn ? btn.innerText : "";
    if (btn) {
        btn.disabled = true;
        btn.innerText = "處理中...";
    }

    if (window.audioManager) window.audioManager.play("chip");
    setStatus(action === "bank_deposit" ? "存入銀行中..." : "銀行提款中...", false);

    withBusy(function () {
        return callMarket(action, { amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || "銀行操作失敗");
            renderOverview(data);
            persistMarketSnapshot(data);
            setStatus("銀行操作完成", false);
            setMarketCacheMeta("已套用最新交易結果", false);
        });
    }).catch(function (error) {
        setStatus("操作失敗: " + error.message, true);
    }).finally(function () {
        if (btn) {
            btn.disabled = false;
            btn.innerText = oldText;
        }
    });
}

function submitLoan(action) {
    var amount = String(document.getElementById("loan-amount").value || "").trim();
    if (!amount || Number(amount) <= 0) return;

    var btn = event && event.target && event.target.tagName === "BUTTON" ? event.target : null;
    var oldText = btn ? btn.innerText : "";
    if (btn) {
        btn.disabled = true;
        btn.innerText = "處理中...";
    }

    if (window.audioManager) window.audioManager.play("chip");
    setStatus(action === "borrow" ? "借款中..." : "還款中...", false);

    withBusy(function () {
        return callMarket(action, { amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || "貸款操作失敗");
            renderOverview(data);
            persistMarketSnapshot(data);
            setStatus("貸款操作完成", false);
            setMarketCacheMeta("已套用最新交易結果", false);
        });
    }).catch(function (error) {
        setStatus("操作失敗: " + error.message, true);
    }).finally(function () {
        if (btn) {
            btn.disabled = false;
            btn.innerText = oldText;
        }
    });
}

function initMarketPage() {
    if (marketRefreshTimerId) clearInterval(marketRefreshTimerId);
    refreshMarket(false);
    marketRefreshTimerId = setInterval(function () {
        refreshMarket(true);
    }, 10000);
}

function initMarketApp() {
    checkGameAuth(function (data) {
        updateUI(data);
        ensureSupportShortcut();
        ensureAudioManagerScript();
        ensureGlobalAudioBindings();
        ensureGlobalBgmPlayback(true);
        ensureSettingsButton();
        startBalanceRefresh();
        initMarketPage();
    });
}
