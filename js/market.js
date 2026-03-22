var marketPayload = null;
var marketSymbolsLoaded = false;
var marketBusy = false;
var marketRefreshBusy = false;
var marketRefreshTimerId = null;
var marketHasRendered = false;
var tradeQueue = [];
var tradeQueueRunning = false;

var MARKET_PERSISTED_CACHE_KEY = "zixi_market_persisted_cache_v2";

function fmt(value, digits) {
    return formatDisplayNumber(Number(value || 0), digits === undefined ? 2 : digits);
}

function fmtSigned(value, digits) {
    var num = Number(value || 0);
    var prefix = num > 0 ? "+" : "";
    return prefix + fmt(num, digits === undefined ? 2 : digits);
}

function fmtRatePercent(value) {
    var num = Number(value || 0);
    if (!isFinite(num)) num = 0;
    return (num * 100).toLocaleString(undefined, {
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
    el.style.color = isError ? "#ff7d7d" : "#ffd36a";
}

function setMarketCacheMeta(text, isError) {
    var el = document.getElementById("market-cache-meta");
    if (!el) return;
    el.innerText = text || "";
    el.style.color = isError ? "#ff8d8d" : "#96a1b7";
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
    if (marketBusy) return Promise.reject(new Error("上一筆市場操作尚未完成"));
    marketBusy = true;
    return task().finally(function () {
        marketBusy = false;
    });
}

function updateTradeQueueStatus() {
    var el = document.getElementById("trade-queue-status");
    if (!el) return;
    var pendingCount = tradeQueue.length + (tradeQueueRunning ? 1 : 0);
    if (pendingCount <= 0) {
        el.classList.add("hidden");
        el.innerText = "";
        return;
    }
    el.classList.remove("hidden");
    el.innerText = "快速交易佇列中：" + pendingCount + " 筆，系統會依序送出。";
}

function runTradeQueue() {
    if (tradeQueueRunning) return;
    if (tradeQueue.length === 0) {
        updateTradeQueueStatus();
        return;
    }

    var job = tradeQueue.shift();
    tradeQueueRunning = true;
    updateTradeQueueStatus();

    Promise.resolve()
        .then(function () {
            return callMarket(job.action, job.payload);
        })
        .then(function (data) {
            handleMarketMutation(data, job.successText, job.toastText);
        })
        .catch(function (error) {
            var message = error && error.message ? error.message : String(error || "市場交易失敗");
            setStatus(job.errorPrefix + message, true);
            showUserToast(message, true);
        })
        .finally(function () {
            tradeQueueRunning = false;
            updateTradeQueueStatus();
            if (tradeQueue.length > 0) {
                setTimeout(runTradeQueue, 0);
            }
        });
}

function enqueueTradeJob(job) {
    tradeQueue.push(job);
    updateTradeQueueStatus();
    runTradeQueue();
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

    return fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }).then(function (res) {
        return res.json();
    });
}

function fetchMarketSnapshot() {
    return fetch("/api/market", {
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

function renderMarketIndexPanel(market) {
    var valueEl = document.getElementById("market-index-value");
    var trendEl = document.getElementById("market-index-trend");
    var chartEl = document.getElementById("market-index-chart");
    if (!valueEl || !trendEl || !chartEl || !market) return;

    var trendPct = Number(market.marketTrendPct || 0);
    var trendClass = trendPct >= 0 ? "change-up" : "change-down";
    var trendPrefix = trendPct > 0 ? "+" : "";
    var indexSeries = market.marketHistory && Array.isArray(market.marketHistory.index)
        ? market.marketHistory.index
        : [];

    valueEl.innerText = fmt(market.marketIndex || 100, 2);
    trendEl.className = "market-index-trend " + trendClass;
    trendEl.innerText = String(market.marketTrendLabel || "震盪") + " " + trendPrefix + fmt(trendPct, 2) + "%";
    chartEl.innerHTML = sparklineSvg(indexSeries, 280, 84, trendClass);
}

function renderMarketTable(market) {
    var table = document.getElementById("market-table");
    if (!table || !market || !market.symbols) return;

    var html = "";

    Object.keys(market.symbols).forEach(function (symbol) {
        var item = market.symbols[symbol];
        var cls = item.changePct >= 0 ? "change-up" : "change-down";
        var sign = item.changePct >= 0 ? "+" : "";
        var history = market.history && market.history[symbol] ? market.history[symbol] : [];

        html += '<article class="market-card">' +
            '<div class="market-card-top">' +
            '<div class="market-symbol"><strong>' + escapeMarketHtml(symbol) + '</strong><small>' + escapeMarketHtml(item.name) + '</small></div>' +
            '<div class="market-price">' + fmt(item.price, 4) + '</div>' +
            '<div class="market-change ' + cls + '">' + sign + fmt(item.changePct, 2) + '%</div>' +
            '</div>' +
            '<div class="market-card-meta">' +
            '<span>類型 <strong>' + escapeMarketHtml(item.type) + '</strong></span>' +
            '<span>板塊 <strong>' + escapeMarketHtml(item.sector) + '</strong></span>' +
            '</div>' +
            '<div class="market-card-chart">' + sparklineSvg(history, 220, 52, cls) + '</div>' +
            "</div>";
    });

    table.innerHTML = html;
}

function renderSectorBoard(market) {
    var el = document.getElementById("sector-board");
    if (!el) return;
    var sectors = market && Array.isArray(market.sectorSummary) ? market.sectorSummary : [];
    if (sectors.length === 0) {
        el.innerHTML = "";
        return;
    }

    var html = "";
    sectors.slice(0, 6).forEach(function (sector) {
        var cls = Number(sector.avgChangePct || 0) >= 0 ? "change-up" : "change-down";
        var sign = Number(sector.avgChangePct || 0) >= 0 ? "+" : "";
        html += '<div class="sector-chip ' + cls + '">' +
            '<span>' + escapeMarketHtml(sector.sector) + '</span>' +
            '<strong>' + sign + fmt(sector.avgChangePct, 2) + '%</strong>' +
            "</div>";
    });
    el.innerHTML = html;
}

function renderFutures(account) {
    var list = document.getElementById("futures-list");
    if (!list) return;

    if (!account || !account.futuresPositions || account.futuresPositions.length === 0) {
        list.innerHTML = '<div class="history-item empty">目前沒有期貨倉位</div>';
        return;
    }

    var html = "";
    account.futuresPositions.forEach(function (pos) {
        var pnlClass = pos.unrealizedPnl >= 0 ? "change-up" : "change-down";
        html += '<div class="position-item">' +
            "<div>" +
            "<strong>" + escapeMarketHtml(pos.symbol) + " " + (pos.side === "short" ? "空單" : "多單") + " x" + fmt(pos.leverage, 0) + "</strong>" +
            '<div class="meta">名目 ' + fmt(pos.notional, 2) + " 子熙幣 | 保證金 " + fmt(pos.margin, 2) + " 子熙幣</div>" +
            '<div class="meta">進場 ' + fmt(pos.entryPrice, 4) + " | 現價 " + fmt(pos.markPrice, 4) + " | 爆倉 " + fmt(pos.liquidationPrice, 4) + "</div>" +
            "</div>" +
            '<div class="' + pnlClass + '">' + formatSignedMarketDelta(pos.unrealizedPnl, pos.roiPct) + "</div>" +
            '<button class="btn-secondary" onclick="closeFuturesPosition(\'' + escapeMarketHtml(pos.id) + '\')">平倉</button>' +
            "</div>";
    });

    list.innerHTML = html;
}

function renderStocks(account) {
    var list = document.getElementById("stock-holdings");
    if (!list) return;

    if (!account || !account.stockPositions || account.stockPositions.length === 0) {
        list.innerHTML = '<div class="history-item empty">目前沒有現股持倉</div>';
        return;
    }

    var html = "";
    account.stockPositions.forEach(function (pos) {
        var pnlClass = pos.unrealizedPnl >= 0 ? "change-up" : "change-down";
        var dayChangeClass = pos.dayChangePct >= 0 ? "change-up" : "change-down";
        var dayPrefix = pos.dayChangePct >= 0 ? "+" : "";

        html += '<div class="position-item">' +
            "<div>" +
            "<strong>" + escapeMarketHtml(pos.symbol) + " <small>" + escapeMarketHtml(pos.name || "") + "</small></strong>" +
            '<div class="meta">持有 ' + fmt(pos.quantity, 4) + " 股 | 均價 " + fmt(pos.avgPrice, 4) + " | 現價 " + fmt(pos.price, 4) + "</div>" +
            '<div class="meta ' + dayChangeClass + '">今日漲跌 ' + dayPrefix + fmt(pos.dayChangePct, 2) + "%</div>" +
            "</div>" +
            '<div class="' + pnlClass + '">' + formatSignedMarketDelta(pos.unrealizedPnl, pos.roiPct) + "</div>" +
            '<div class="holding-actions"><div>市值 ' + fmt(pos.marketValue, 2) + ' 子熙幣</div></div>' +
            "</div>";
    });

    list.innerHTML = html;
}

function renderHistory(account) {
    var el = document.getElementById("history-log");
    if (!el) return;

    if (!account || !account.history || account.history.length === 0) {
        el.innerHTML = '<div class="history-item empty">目前沒有操作紀錄</div>';
        return;
    }

    var html = "";
    account.history.slice(0, 20).forEach(function (item) {
        html += '<div class="history-item">' +
            '<div class="history-main">' + escapeMarketHtml(item.summary || item.type || "市場操作") + "</div>" +
            '<div class="history-meta">' + escapeMarketHtml(formatGeneratedTime(item.at) || item.at || "") + " | " + escapeMarketHtml(item.type || "") + "</div>" +
            "</div>";
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
    var html = "";
    events.forEach(function (event) {
        html += '<div class="liquidation-item">強制平倉：' + escapeMarketHtml(event.symbol) + " #" + escapeMarketHtml(event.positionId) + "</div>";
    });
    el.innerHTML = html;
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
    var marketTrend = document.getElementById("market-trend");
    var marketBreadth = document.getElementById("market-breadth");
    var bankRateLabel = document.getElementById("bank-rate-label");
    var loanRateLabel = document.getElementById("loan-rate-label");
    var futuresMaxBetEl = document.getElementById("futures-max-bet");

    if (simCash) simCash.innerText = fmt(account.cash, 2);
    if (simBank) simBank.innerText = fmt(account.bankBalance, 2);
    if (simLoan) simLoan.innerText = fmt(account.loanPrincipal, 2);
    if (simNet) simNet.innerText = fmt(account.netWorth, 2);
    if (marketVol) marketVol.innerText = fmt(market.marketVolatilityPct, 2) + "%";
    if (fgIndex) fgIndex.innerText = String(market.fearGreedIndex || 0);
    if (marketTrend) marketTrend.innerText = String(market.marketTrendLabel || "震盪") + " " + fmtSigned(market.marketTrendPct || 0, 2) + "%";
    if (marketBreadth) marketBreadth.innerText = String(market.advancers || 0) + " 上漲 / " + String(market.decliners || 0) + " 下跌";
    if (bankRateLabel && payload.params) bankRateLabel.innerText = fmtRatePercent(payload.params.bankAnnualRate || 0);
    if (loanRateLabel && payload.params) loanRateLabel.innerText = fmtRatePercent(payload.params.loanAnnualRate || 0);
    if (futuresMaxBetEl && betLimit !== undefined) futuresMaxBetEl.innerText = formatDisplayNumber(betLimit, 2) + " 子熙幣";

    updateUI({
        balance: account.cash,
        totalBet: payload.totalBet,
        level: payload.level || payload.vipLevel,
        betLimit: betLimit
    }, { skipGlobalHooks: true });

    renderMarketIndexPanel(market);
    renderSectorBoard(market);
    renderMarketTable(market);
    renderStocks(account);
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
            setStatus("先顯示上次快照，正在背景同步最新市場資料...", false);
            setMarketCacheMeta(buildMarketStatusText("STALE", persisted.payload.generatedAt || persisted.savedAt) || "快取快照", false);
        } else if (!marketHasRendered) {
            setStatus("載入中...", false);
        }
    }

    marketRefreshBusy = true;
    return fetchMarketSnapshot()
        .then(function (result) {
            var data = result.data;
            if (!data || !data.success) {
                throw new Error((data && data.error) || "市場快照載入失敗");
            }

            if (!data.generatedAt && result.generatedAt) {
                data.generatedAt = result.generatedAt;
            }

            renderOverview(data);
            persistMarketSnapshot(data);

            if (!silent) {
                setStatus("市場資料已同步", false);
            }
            setMarketCacheMeta(buildMarketStatusText(result.cacheStatus, data.generatedAt) || "市場資料已同步", false);
        })
        .catch(function (error) {
            if (marketHasRendered) {
                setStatus("刷新失敗，保留目前快照：" + error.message, true);
            } else {
                setStatus("載入失敗：" + error.message, true);
            }
            setMarketCacheMeta("市場快照同步失敗", true);
        })
        .finally(function () {
            marketRefreshBusy = false;
        });
}

function handleMarketMutation(data, successText, toastText) {
    if (!data || !data.success) throw new Error((data && data.error) || "市場操作失敗");
    renderOverview(data);
    persistMarketSnapshot(data);
    setStatus(successText, false);
    setMarketCacheMeta("已使用最新市場資料", false);
    if (toastText) showUserToast(toastText);
    if (window.audioManager) window.audioManager.play("win_small");
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
    setStatus(action === "buy_stock" ? "買單已加入快速交易佇列" : "賣單已加入快速交易佇列", false);

    enqueueTradeJob({
        action: action,
        payload: { symbol: symbol, quantity: quantity },
        successText: "股票交易完成",
        toastText: "股票交易已完成",
        errorPrefix: "股票交易失敗："
    });

    if (btn) {
        btn.disabled = false;
        btn.innerText = oldText;
    }
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
    setStatus("送出期貨委託...", false);

    withBusy(function () {
        return callMarket("open_futures", {
            symbol: symbol,
            side: side,
            margin: margin,
            leverage: leverage
        }).then(function (data) {
            handleMarketMutation(data, "期貨倉位已建立", "期貨倉位已建立");
        });
    }).catch(function (error) {
        setStatus("期貨委託失敗：" + error.message, true);
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
    setStatus("送出平倉...", false);

    withBusy(function () {
        return callMarket("close_futures", { positionId: positionId })
            .then(function (data) {
                handleMarketMutation(data, "期貨倉位已平倉", "期貨倉位已平倉");
            });
    }).catch(function (error) {
        setStatus("平倉失敗：" + error.message, true);
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

    if (window.audioManager) window.audioManager.play("bet");
    setStatus(action === "bank_deposit" ? "處理銀行存入..." : "處理銀行提領...", false);

    withBusy(function () {
        return callMarket(action, { amount: amount }).then(function (data) {
            handleMarketMutation(data, "銀行操作完成", "銀行操作已完成");
        });
    }).catch(function (error) {
        setStatus("銀行操作失敗：" + error.message, true);
        showUserToast(error.message, true);
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

    if (window.audioManager) window.audioManager.play("bet");
    setStatus(action === "borrow" ? "處理貸款..." : "處理還款...", false);

    withBusy(function () {
        return callMarket(action, { amount: amount }).then(function (data) {
            handleMarketMutation(data, "貸款操作完成", "貸款操作已完成");
        });
    }).catch(function (error) {
        setStatus("貸款操作失敗：" + error.message, true);
        showUserToast(error.message, true);
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
