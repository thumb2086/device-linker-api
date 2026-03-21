var leaderboardBusy = false;
var leaderboardType = "total-bet";
var leaderboardScope = "total";
var leaderboardCache = {};
var cacheTimestamps = {};
var CACHE_DURATION_MS = 10 * 1000;

var config = {
    "total-bet": {
        title: "投注排行榜",
        scopes: {
            total: { action: "total_bet", title: "總投注排行榜", valueLabel: "總投注", emptyText: "目前還沒有投注資料" },
            weekly: { action: "weekly_bet", title: "週投注排行榜", valueLabel: "本週投注", emptyText: "本週還沒有投注資料" },
            monthly: { action: "monthly_bet", title: "月投注排行榜", valueLabel: "本月投注", emptyText: "本月還沒有投注資料" },
            season: { action: "season_bet", title: "賽季投注排行榜", valueLabel: "賽季投注", emptyText: "本賽季還沒有投注資料" }
        }
    },
    balance: {
        title: "淨值排行榜",
        scopes: {
            total: { action: "net_worth", title: "淨值排行榜", valueLabel: "淨值", emptyText: "目前還沒有淨值資料" }
        }
    }
};

function getLeaderboardConfig() {
    var typeCfg = config[leaderboardType] || config["total-bet"];
    return typeCfg.scopes[leaderboardScope] || typeCfg.scopes.total;
}

function setType(type) {
    if (!config[type] || leaderboardBusy) return;
    leaderboardType = type;
    leaderboardScope = "total";
    updateControlsUI();
    loadLeaderboard(false, false);
}

function setScope(scopeKey) {
    if (leaderboardBusy) return;
    var typeCfg = config[leaderboardType] || config["total-bet"];
    if (!typeCfg.scopes[scopeKey]) return;
    leaderboardScope = scopeKey;
    updateControlsUI();
    loadLeaderboard(false, false);
}

function updateControlsUI() {
    var lconfig = getLeaderboardConfig();
    var titleEl = document.getElementById("leaderboard-title");
    var labelEl = document.getElementById("my-bet-label");
    var periodEl = document.getElementById("leaderboard-period");
    var scopeContainer = document.getElementById("leaderboard-scope");
    var typeContainer = document.querySelector(".leaderboard-type-selector");

    if (titleEl) titleEl.innerText = lconfig.title;
    if (labelEl) labelEl.innerText = lconfig.valueLabel;
    if (periodEl) periodEl.style.display = leaderboardType === "total-bet" ? "block" : "none";

    if (typeContainer) {
        Array.prototype.slice.call(typeContainer.querySelectorAll(".type-btn")).forEach(function (btn) {
            btn.classList.toggle("is-active", btn.getAttribute("data-type") === leaderboardType);
        });
    }

    if (scopeContainer) {
        scopeContainer.style.display = leaderboardType === "total-bet" ? "flex" : "none";
        Array.prototype.slice.call(scopeContainer.querySelectorAll(".scope-btn")).forEach(function (btn) {
            btn.classList.toggle("is-active", btn.getAttribute("data-scope") === leaderboardScope);
        });
    }

    document.title = (lconfig.title || "排行榜") + " | Casino";
}

function setLeaderboardStatus(text, isError) {
    var el = document.getElementById("leaderboard-status");
    if (!el) return;
    el.innerText = text || "";
    el.style.color = isError ? "#ff7b7b" : "#d9b75f";
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function fmtRank(rank) {
    var parsed = Number(rank || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return "-";
    return "#" + formatDisplayNumber(parsed, 0);
}

function renderMyRank(data) {
    var myRankEl = document.getElementById("my-rank");
    var myBetEl = document.getElementById("my-total-bet");
    var myNameEl = document.getElementById("my-name");
    var totalEl = document.getElementById("leaderboard-total");

    if (totalEl) totalEl.innerText = formatDisplayNumber(Number(data.totalPlayers || 0), 0);

    if (!data.myRank) {
        if (myRankEl) myRankEl.innerText = "未上榜";
        if (myBetEl) {
            var fallbackValue = leaderboardType === "balance" ? 0 : Number(data.myPeriodBet || 0);
            myBetEl.innerText = formatCompactZh(fallbackValue, 2) + " 金幣";
        }
        if (myNameEl) myNameEl.innerText = "-";
        return;
    }

    var rankValue = leaderboardType === "balance" ? data.myRank.netWorth : data.myRank.totalBet;
    if (myRankEl) myRankEl.innerText = fmtRank(data.myRank.rank);
    if (myBetEl) myBetEl.innerText = formatCompactZh(rankValue, 2) + " 金幣";
    if (myNameEl) {
        var titleText = data.myRank.title && data.myRank.title.name ? ("[" + data.myRank.title.name + "] ") : "";
        var avatarText = data.myRank.avatar && data.myRank.avatar.icon ? (data.myRank.avatar.icon + " ") : "";
        myNameEl.innerText = avatarText + titleText + (data.myRank.displayName || data.myRank.maskedAddress || "-");
    }
}

function renderSkeleton() {
    var container = document.getElementById("leaderboard-list");
    if (!container) return;
    var lconfig = getLeaderboardConfig();
    var html = '<div class="leaderboard-row leaderboard-head">' +
        "<span>排名</span><span>玩家</span><span>" + escapeHtml(lconfig.valueLabel) + "</span><span>VIP</span>" +
        "</div>";

    for (var i = 0; i < 10; i += 1) {
        html += '<div class="leaderboard-row is-skeleton">' +
            '<span class="rank-col"><span></span></span>' +
            '<span class="addr-col"><span></span></span>' +
            '<span class="bet-col"><span></span></span>' +
            '<span class="vip-col"><span></span></span>' +
            "</div>";
    }

    container.innerHTML = html;
}

function renderLeaderboardRows(items) {
    var container = document.getElementById("leaderboard-list");
    if (!container) return;
    var lconfig = getLeaderboardConfig();

    if (!items || !items.length) {
        container.innerHTML = '<div class="leaderboard-empty">' + escapeHtml(lconfig.emptyText) + "</div>";
        return;
    }

    var currentAddress = String((window.user && user.address) || "").trim().toLowerCase();
    var html = '<div class="leaderboard-row leaderboard-head">' +
        "<span>排名</span><span>玩家</span><span>" + escapeHtml(lconfig.valueLabel) + "</span><span>VIP</span>" +
        "</div>";

    items.forEach(function (item) {
        var isMine = item.address === currentAddress;
        var displayName = item.displayName || item.maskedAddress || item.address;
        var value = leaderboardType === "balance" ? item.netWorth : item.totalBet;
        var titleAttr = item.title && item.title.description ? (' title="' + escapeHtml(item.title.description) + '"') : "";
        var avatarAttr = item.avatar && item.avatar.description ? (' title="' + escapeHtml(item.avatar.description) + '"') : "";
        var title = item.title && item.title.name ? '<span class="leaderboard-title-chip"' + titleAttr + ">" + escapeHtml(item.title.name) + "</span>" : "";
        var avatarSpan = item.avatar && item.avatar.icon ? '<span class="leaderboard-avatar"' + avatarAttr + ">" + escapeHtml(item.avatar.icon) + "</span>" : "";

        html += '<div class="leaderboard-row' + (isMine ? " is-me" : "") + '">' +
            '<span class="rank-col">' + fmtRank(item.rank) + "</span>" +
            '<span class="addr-col" title="' + escapeHtml(item.address) + '">' + avatarSpan + title + '<span class="leaderboard-name">' + escapeHtml(displayName) + (isMine ? " (你)" : "") + "</span></span>" +
            '<span class="bet-col">' + formatCompactZh(value, 2) + " 金幣</span>" +
            '<span class="vip-col">' + escapeHtml(item.level || item.vipLevel || "-") + "</span>" +
            "</div>";
    });

    container.innerHTML = html;
}

function renderPeriodInfo(period) {
    var periodEl = document.getElementById("leaderboard-period");
    if (!periodEl || leaderboardType !== "total-bet") {
        if (periodEl) periodEl.innerText = "";
        return;
    }
    if (!period || !period.startAt || !period.endAt) {
        periodEl.innerText = "期間資訊載入中";
        return;
    }

    var start = new Date(period.startAt);
    var end = new Date(period.endAt);
    var startText = start.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }) + " " +
        start.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    var endText = end.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }) + " " +
        end.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    var idText = period.id ? ("期別: " + period.id + " | ") : "";
    periodEl.innerText = idText + startText + " ~ " + endText;
}

function buildLeaderboardStatusText(cacheStatus, generatedAt) {
    var parts = [];
    if (cacheStatus) parts.push("快取 " + cacheStatus);
    if (generatedAt) {
        var ts = Date.parse(generatedAt);
        if (Number.isFinite(ts)) {
            parts.push("生成於 " + new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        }
    }
    return parts.join(" | ");
}

function loadLeaderboard(silent, forceRefresh) {
    if (leaderboardBusy) return Promise.resolve();

    var cacheKey = leaderboardType + "_" + leaderboardScope;
    var now = Date.now();
    if (!forceRefresh && leaderboardCache[cacheKey] && (now - cacheTimestamps[cacheKey] < CACHE_DURATION_MS)) {
        var cachedData = leaderboardCache[cacheKey];
        renderMyRank(cachedData);
        renderLeaderboardRows(cachedData.leaderboard);
        renderPeriodInfo(cachedData.period);
        setLeaderboardStatus("使用頁面快取", false);
        return Promise.resolve();
    }

    leaderboardBusy = true;
    if (!silent) {
        setLeaderboardStatus("排行榜載入中...", false);
        renderSkeleton();
    }

    var lconfig = getLeaderboardConfig();
    return fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: lconfig.action,
            sessionId: user.sessionId,
            limit: 50
        })
    })
        .then(function (res) {
            return res.json().then(function (data) {
                return {
                    data: data,
                    cacheStatus: res.headers.get("X-Cache"),
                    generatedAt: res.headers.get("X-Generated-At")
                };
            });
        })
        .then(function (result) {
            var data = result.data;
            if (!data || !data.success) {
                throw new Error((data && data.error) || "排行榜讀取失敗");
            }
            if (!data.generatedAt && result.generatedAt) {
                data.generatedAt = result.generatedAt;
            }
            leaderboardCache[cacheKey] = data;
            cacheTimestamps[cacheKey] = Date.now();

            renderMyRank(data);
            renderLeaderboardRows(data.leaderboard);
            renderPeriodInfo(data.period);
            setLeaderboardStatus(buildLeaderboardStatusText(result.cacheStatus, data.generatedAt) || "排行榜已更新", false);
        })
        .catch(function (error) {
            setLeaderboardStatus("錯誤: " + error.message, true);
        })
        .finally(function () {
            leaderboardBusy = false;
        });
}

function refreshLeaderboard() {
    return loadLeaderboard(false, true);
}

function initLeaderboardPage() {
    var typeContainer = document.querySelector(".leaderboard-type-selector");
    if (typeContainer) {
        Array.prototype.slice.call(typeContainer.querySelectorAll(".type-btn")).forEach(function (btn) {
            btn.addEventListener("click", function () {
                setType(btn.getAttribute("data-type"));
            });
        });
    }

    var scopeContainer = document.getElementById("leaderboard-scope");
    if (scopeContainer) {
        Array.prototype.slice.call(scopeContainer.querySelectorAll(".scope-btn")).forEach(function (btn) {
            btn.addEventListener("click", function () {
                setScope(btn.getAttribute("data-scope"));
            });
        });
    }

    updateControlsUI();
    loadLeaderboard(false, false);
}

window.loadLeaderboard = loadLeaderboard;
window.refreshLeaderboard = refreshLeaderboard;
window.initLeaderboardPage = initLeaderboardPage;
