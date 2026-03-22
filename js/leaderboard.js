var leaderboardBusy = false;
var championBusy = false;
var leaderboardType = "total-bet";
var leaderboardScope = "total";
var leaderboardCache = {};
var championCache = null;
var cacheTimestamps = {};
var championCacheTimestamp = 0;
var CACHE_DURATION_MS = 10 * 1000;
var PERSISTED_CACHE_KEY = "zixi_leaderboard_persisted_cache_v1";

var config = {
    "total-bet": {
        title: "下注排行榜",
        scopes: {
            total: {
                action: "total_bet",
                title: "總下注排行榜",
                valueLabel: "累積下注",
                emptyText: "目前還沒有下注紀錄。"
            },
            weekly: {
                action: "weekly_bet",
                title: "週下注排行榜",
                valueLabel: "本週下注",
                emptyText: "本週還沒有下注紀錄。"
            },
            monthly: {
                action: "monthly_bet",
                title: "月下注排行榜",
                valueLabel: "本月下注",
                emptyText: "本月還沒有下注紀錄。"
            },
            season: {
                action: "season_bet",
                title: "賽季下注排行榜",
                valueLabel: "本賽季下注",
                emptyText: "本賽季還沒有下注紀錄。"
            }
        }
    },
    balance: {
        title: "資產排行榜",
        scopes: {
            total: {
                action: "net_worth",
                title: "總資產排行榜",
                valueLabel: "總資產",
                emptyText: "目前還沒有資產排行資料。"
            }
        }
    }
};

var championCardOrder = ["totalBet", "weeklyBet", "monthlyBet", "seasonBet", "netWorth"];
var hallOfFameCardOrder = ["weeklyBet", "monthlyBet", "seasonBet"];
var championMeta = {
    totalBet: { label: "總下注榜一", metricLabel: "累積下注" },
    weeklyBet: { label: "週榜榜一", metricLabel: "本週下注" },
    monthlyBet: { label: "月榜榜一", metricLabel: "本月下注" },
    seasonBet: { label: "賽季榜一", metricLabel: "本賽季下注" },
    netWorth: { label: "總資產榜一", metricLabel: "總資產" }
};
var hallOfFameMeta = {
    weeklyBet: { label: "週榜王", metricLabel: "累計正式榜一" },
    monthlyBet: { label: "月榜王", metricLabel: "累計正式榜一" },
    seasonBet: { label: "賽季榜王", metricLabel: "累計正式榜一" }
};

function getLeaderboardConfig() {
    var typeCfg = config[leaderboardType] || config["total-bet"];
    return typeCfg.scopes[leaderboardScope] || typeCfg.scopes.total;
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

function buildLeaderboardStatusText(cacheStatus, generatedAt) {
    var parts = [];
    if (cacheStatus) parts.push("快取 " + cacheStatus);
    var generatedTime = formatGeneratedTime(generatedAt);
    if (generatedTime) parts.push("生成於 " + generatedTime);
    return parts.join(" | ");
}

function fmtRank(rank) {
    var parsed = Number(rank || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return "-";
    return "#" + formatDisplayNumber(parsed, 0);
}

function formatLeaderboardValue(value) {
    return formatCompactZh(Number(value || 0), 2) + " 子熙幣";
}

function formatCountValue(value) {
    return "累計 " + formatDisplayNumber(Number(value || 0), 0) + " 次";
}

function getCurrentUserAddress() {
    return String((window.user && window.user.address) || "").trim().toLowerCase();
}

function getLeaderboardStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

function readPersistedLeaderboardCache() {
    var storage = getLeaderboardStorage();
    if (!storage) return {};
    try {
        var raw = storage.getItem(PERSISTED_CACHE_KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writePersistedLeaderboardCache(nextValue) {
    var storage = getLeaderboardStorage();
    if (!storage) return;
    try {
        storage.setItem(PERSISTED_CACHE_KEY, JSON.stringify(nextValue || {}));
    } catch (error) {
        console.log("Failed to persist leaderboard cache");
    }
}

function persistLeaderboardSnapshot(cacheKey, payload) {
    if (!cacheKey || !payload) return;
    var current = readPersistedLeaderboardCache();
    current[cacheKey] = {
        savedAt: new Date().toISOString(),
        payload: payload
    };
    writePersistedLeaderboardCache(current);
}

function loadPersistedLeaderboardSnapshot(cacheKey) {
    if (!cacheKey) return null;
    var current = readPersistedLeaderboardCache();
    if (!current || !current[cacheKey] || !current[cacheKey].payload) return null;
    return current[cacheKey].payload;
}

function setLeaderboardStatus(text, isError) {
    var el = document.getElementById("leaderboard-status");
    if (!el) return;
    el.innerText = text || "";
    el.style.color = isError ? "#ff7b7b" : "#d9b75f";
}

function setChampionMetaText(text, isError) {
    var el = document.getElementById("leaderboard-champion-meta");
    if (!el) return;
    el.innerText = text || "";
    el.style.color = isError ? "#ff7b7b" : "#96a1b7";
}

function setHallOfFameMetaText(text, isError) {
    var el = document.getElementById("leaderboard-hof-meta");
    if (!el) return;
    el.innerText = text || "";
    el.style.color = isError ? "#ff7b7b" : "#96a1b7";
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

function jumpToLeaderboard(type, scope) {
    if (!config[type] || leaderboardBusy) return;
    var typeCfg = config[type];
    leaderboardType = type;
    leaderboardScope = typeCfg.scopes[scope] ? scope : "total";
    updateControlsUI();
    loadLeaderboard(false, false);
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
            myBetEl.innerText = formatLeaderboardValue(fallbackValue);
        }
        if (myNameEl) myNameEl.innerText = "-";
        return;
    }

    var rankValue = leaderboardType === "balance" ? Number(data.myRank.netWorth || 0) : Number(data.myRank.totalBet || 0);
    if (myRankEl) myRankEl.innerText = fmtRank(data.myRank.rank);
    if (myBetEl) myBetEl.innerText = formatLeaderboardValue(rankValue);
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

    var currentAddress = getCurrentUserAddress();
    var html = '<div class="leaderboard-row leaderboard-head">' +
        "<span>排名</span><span>玩家</span><span>" + escapeHtml(lconfig.valueLabel) + "</span><span>VIP</span>" +
        "</div>";

    items.forEach(function (item) {
        var isMine = item.address === currentAddress;
        var displayName = item.displayName || item.maskedAddress || item.address;
        var value = leaderboardType === "balance" ? Number(item.netWorth || 0) : Number(item.totalBet || 0);
        var titleAttr = item.title && item.title.description ? (' title="' + escapeHtml(item.title.description) + '"') : "";
        var avatarAttr = item.avatar && item.avatar.description ? (' title="' + escapeHtml(item.avatar.description) + '"') : "";
        var title = item.title && item.title.name
            ? '<span class="leaderboard-title-chip"' + titleAttr + ">" + escapeHtml(item.title.name) + "</span>"
            : "";
        var avatarSpan = item.avatar && item.avatar.icon
            ? '<span class="leaderboard-avatar"' + avatarAttr + ">" + escapeHtml(item.avatar.icon) + "</span>"
            : "";

        html += '<div class="leaderboard-row' + (isMine ? " is-me" : "") + '">' +
            '<span class="rank-col">' + fmtRank(item.rank) + "</span>" +
            '<span class="addr-col" title="' + escapeHtml(item.address) + '">' +
            avatarSpan + title + '<span class="leaderboard-name">' + escapeHtml(displayName) + (isMine ? " (你)" : "") + "</span></span>" +
            '<span class="bet-col">' + formatLeaderboardValue(value) + "</span>" +
            '<span class="vip-col">' + escapeHtml(item.level || item.vipLevel || "-") + '</span>' +
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
        periodEl.innerText = "目前沒有週期資料。";
        return;
    }

    var start = new Date(period.startAt);
    var end = new Date(period.endAt);
    var startText = start.toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }) + " " + start.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    var endText = end.toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }) + " " + end.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    var idText = period.id ? ("期別: " + period.id + " | ") : "";
    periodEl.innerText = idText + startText + " ~ " + endText;
}

function buildChampionSubtitle(item) {
    if (!item || !item.period || !item.period.startAt || !item.period.endAt) return "";
    var start = new Date(item.period.startAt);
    var end = new Date(item.period.endAt);
    return start.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" }) +
        " - " +
        end.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
}

function buildChampionStreakText(item) {
    var count = Number(item && item.streakCount || 0);
    if (count > 1) return "連冠 " + formatDisplayNumber(count, 0) + " 次";
    if (count === 1) return "首冠";
    return "";
}

function buildHallOfFameSubtitle(item) {
    if (!item || !item.lastSettledPeriodId) return "";
    return "最近奪冠期別 " + item.lastSettledPeriodId;
}

function buildHallOfFameTieText(item) {
    var ties = item && Array.isArray(item.ties) ? item.ties : [];
    var primaryAddress = String(item && item.address || "").trim().toLowerCase();
    var otherTies = ties.filter(function (entry) {
        return String(entry && entry.address || "").trim().toLowerCase() !== primaryAddress;
    });
    if (otherTies.length > 0) {
        return "另有 " + formatDisplayNumber(otherTies.length, 0) + " 人並列";
    }
    return "";
}

function renderHallOfFameTieList(item) {
    var ties = item && Array.isArray(item.ties) ? item.ties : [];
    var primaryAddress = String(item && item.address || "").trim().toLowerCase();
    var otherTies = ties.filter(function (entry) {
        return String(entry && entry.address || "").trim().toLowerCase() !== primaryAddress;
    });
    if (!otherTies.length) return "";

    return '<div class="champion-ties">' + otherTies.map(function (entry) {
        var avatar = entry.avatar && entry.avatar.icon
            ? '<span class="champion-tie-avatar">' + escapeHtml(entry.avatar.icon) + '</span>'
            : "";
        var title = entry.title && entry.title.name
            ? '<span class="leaderboard-title-chip champion-tie-title">' + escapeHtml(entry.title.name) + '</span>'
            : "";
        var displayName = entry.displayName || entry.maskedAddress || entry.address || "-";
        return '<div class="champion-tie-row">' +
            avatar +
            '<div class="champion-tie-copy">' +
            title +
            '<span class="champion-tie-name">' + escapeHtml(displayName) + '</span>' +
            '<span class="champion-tie-meta">' + escapeHtml(entry.maskedAddress || entry.address || "-") + ' | VIP ' + escapeHtml(entry.level || "-") + '</span>' +
            '</div>' +
            '</div>';
    }).join("") + "</div>";
}

function buildSkeletonCards(count) {
    var html = "";
    for (var index = 0; index < count; index += 1) {
        html += '<div class="leaderboard-champion-card is-skeleton">' +
            '<span class="champion-label skeleton-line short"></span>' +
            '<strong class="champion-value skeleton-line"></strong>' +
            '<div class="champion-player">' +
            '<span class="champion-avatar skeleton-bubble"></span>' +
            '<div class="champion-player-copy">' +
            '<span class="skeleton-line medium"></span>' +
            '<span class="skeleton-line short"></span>' +
            "</div></div></div>";
    }
    return html;
}

function renderChampionSkeleton() {
    var container = document.getElementById("leaderboard-champion-grid");
    if (!container) return;
    container.innerHTML = buildSkeletonCards(championCardOrder.length);
}

function renderHallOfFameSkeleton() {
    var container = document.getElementById("leaderboard-hof-grid");
    if (!container) return;
    container.innerHTML = buildSkeletonCards(hallOfFameCardOrder.length);
}

function renderChampionCards(champions) {
    var container = document.getElementById("leaderboard-champion-grid");
    if (!container) return;

    var html = "";
    championCardOrder.forEach(function (key) {
        var item = champions && champions[key] ? champions[key] : null;
        var fallback = championMeta[key] || { label: "榜一", metricLabel: "數值" };
        var label = fallback.label;
        var metricLabel = fallback.metricLabel;
        var subtitle = buildChampionSubtitle(item);
        var streakText = buildChampionStreakText(item);

        if (!item || !item.hasChampion) {
            html += '<div class="leaderboard-champion-card is-empty">' +
                '<span class="champion-label">' + escapeHtml(label) + "</span>" +
                '<strong class="champion-value">尚無資料</strong>' +
                '<div class="champion-empty-copy">目前還沒有產生榜一資料。</div>' +
                "</div>";
            return;
        }

        var titleAttr = item.title && item.title.description ? (' title="' + escapeHtml(item.title.description) + '"') : "";
        var avatarAttr = item.avatar && item.avatar.description ? (' title="' + escapeHtml(item.avatar.description) + '"') : "";
        var titleChip = item.title && item.title.name
            ? '<span class="leaderboard-title-chip champion-title-chip"' + titleAttr + ">" + escapeHtml(item.title.name) + "</span>"
            : "";
        var avatar = item.avatar && item.avatar.icon
            ? '<span class="champion-avatar"' + avatarAttr + ">" + escapeHtml(item.avatar.icon) + "</span>"
            : '<span class="champion-avatar champion-avatar-fallback">榜一</span>';
        var displayName = item.displayName || item.maskedAddress || item.address;
        var valueText = formatLeaderboardValue(item.value);

        html += '<button type="button" class="leaderboard-champion-card" data-type="' + escapeHtml(item.viewType || "") + '" data-scope="' + escapeHtml(item.viewScope || "") + '">' +
            '<span class="champion-label">' + escapeHtml(label) + "</span>" +
            '<strong class="champion-value">' + escapeHtml(valueText) + "</strong>" +
            '<div class="champion-metric">' + escapeHtml(metricLabel) + (subtitle ? " | " + escapeHtml(subtitle) : "") + "</div>" +
            (streakText ? '<div class="champion-streak">' + escapeHtml(streakText) + "</div>" : "") +
            '<div class="champion-player">' + avatar +
            '<div class="champion-player-copy">' +
            titleChip +
            '<span class="champion-name">' + escapeHtml(displayName) + "</span>" +
            '<span class="champion-address">' + escapeHtml(item.maskedAddress || item.address || "-") + " | VIP " + escapeHtml(item.level || "-") + "</span>" +
            "</div></div>" +
            "</button>";
    });

    container.innerHTML = html;
}

function renderHallOfFameCards(hallOfFame) {
    var container = document.getElementById("leaderboard-hof-grid");
    if (!container) return;

    var html = "";
    hallOfFameCardOrder.forEach(function (key) {
        var item = hallOfFame && hallOfFame[key] ? hallOfFame[key] : null;
        var fallback = hallOfFameMeta[key] || { label: "榜王", metricLabel: "累計正式榜一" };
        var label = fallback.label;
        var metricLabel = fallback.metricLabel;
        var subtitle = buildHallOfFameSubtitle(item);
        var tieText = buildHallOfFameTieText(item);

        if (!item || !item.hasChampion) {
            html += '<div class="leaderboard-champion-card is-empty">' +
                '<span class="champion-label">' + escapeHtml(label) + "</span>" +
                '<strong class="champion-value">尚無資料</strong>' +
                '<div class="champion-empty-copy">目前還沒有已結算冠軍歷史。</div>' +
                "</div>";
            return;
        }

        var titleAttr = item.title && item.title.description ? (' title="' + escapeHtml(item.title.description) + '"') : "";
        var avatarAttr = item.avatar && item.avatar.description ? (' title="' + escapeHtml(item.avatar.description) + '"') : "";
        var titleChip = item.title && item.title.name
            ? '<span class="leaderboard-title-chip champion-title-chip"' + titleAttr + ">" + escapeHtml(item.title.name) + "</span>"
            : "";
        var avatar = item.avatar && item.avatar.icon
            ? '<span class="champion-avatar"' + avatarAttr + ">" + escapeHtml(item.avatar.icon) + "</span>"
            : '<span class="champion-avatar champion-avatar-fallback">榜王</span>';
        var displayName = item.displayName || item.maskedAddress || item.address;

        html += '<button type="button" class="leaderboard-champion-card" data-type="total-bet" data-scope="' + escapeHtml(item.viewScope || "total") + '">' +
            '<span class="champion-label">' + escapeHtml(label) + "</span>" +
            '<strong class="champion-value">' + escapeHtml(formatCountValue(item.count)) + "</strong>" +
            '<div class="champion-metric">' + escapeHtml(metricLabel) + (subtitle ? " | " + escapeHtml(subtitle) : "") + "</div>" +
            (tieText ? '<div class="champion-streak">' + escapeHtml(tieText) + "</div>" : "") +
            '<div class="champion-player">' + avatar +
            '<div class="champion-player-copy">' +
            titleChip +
            '<span class="champion-name">' + escapeHtml(displayName) + "</span>" +
            '<span class="champion-address">' + escapeHtml(item.maskedAddress || item.address || "-") + " | VIP " + escapeHtml(item.level || "-") + "</span>" +
            "</div></div>" +
            renderHallOfFameTieList(item) +
            "</button>";
    });

    container.innerHTML = html;
}

function loadChampionSummary(silent, forceRefresh) {
    if (championBusy) return Promise.resolve();

    var now = Date.now();
    if (!forceRefresh && championCache && (now - championCacheTimestamp < CACHE_DURATION_MS)) {
        renderChampionCards(championCache.champions);
        renderHallOfFameCards(championCache.hallOfFame);
        setChampionMetaText("目前榜一使用頁內快取。", false);
        setHallOfFameMetaText("歷史榜王使用頁內快取。", false);
        return Promise.resolve();
    }

    championBusy = true;
    if (!silent) {
        var persistedChampionData = !forceRefresh ? loadPersistedLeaderboardSnapshot("champions") : null;
        if (persistedChampionData && persistedChampionData.champions) {
            renderChampionCards(persistedChampionData.champions);
            renderHallOfFameCards(persistedChampionData.hallOfFame);
            setChampionMetaText("先顯示上次榜一快照，背景更新中...", false);
            setHallOfFameMetaText("先顯示上次榜王快照，背景更新中...", false);
        } else {
            renderChampionSkeleton();
            renderHallOfFameSkeleton();
            setChampionMetaText("目前榜一讀取中...", false);
            setHallOfFameMetaText("歷史榜王讀取中...", false);
        }
    }

    return fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "champions",
            sessionId: user.sessionId
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
                throw new Error((data && data.error) || "榜一資料載入失敗");
            }
            if (!data.generatedAt && result.generatedAt) {
                data.generatedAt = result.generatedAt;
            }
            championCache = data;
            championCacheTimestamp = Date.now();
            persistLeaderboardSnapshot("champions", data);
            renderChampionCards(data.champions);
            renderHallOfFameCards(data.hallOfFame);
            var metaText = buildLeaderboardStatusText(result.cacheStatus, data.generatedAt) || "榜一資料已更新";
            setChampionMetaText(metaText, false);
            setHallOfFameMetaText(metaText, false);
        })
        .catch(function (error) {
            setChampionMetaText("榜一資料載入失敗: " + error.message, true);
            setHallOfFameMetaText("歷史榜王載入失敗: " + error.message, true);
        })
        .finally(function () {
            championBusy = false;
        });
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
        setLeaderboardStatus("頁內快取回應。", false);
        return Promise.resolve();
    }

    leaderboardBusy = true;
    if (!silent) {
        var persistedData = !forceRefresh ? loadPersistedLeaderboardSnapshot(cacheKey) : null;
        if (persistedData && persistedData.leaderboard) {
            renderMyRank(persistedData);
            renderLeaderboardRows(persistedData.leaderboard);
            renderPeriodInfo(persistedData.period);
            setLeaderboardStatus("先顯示上次排行榜快照，背景更新中...", false);
        } else {
            setLeaderboardStatus("排行榜讀取中...", false);
            renderSkeleton();
        }
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
                throw new Error((data && data.error) || "排行榜載入失敗");
            }
            if (!data.generatedAt && result.generatedAt) {
                data.generatedAt = result.generatedAt;
            }

            leaderboardCache[cacheKey] = data;
            cacheTimestamps[cacheKey] = Date.now();
            persistLeaderboardSnapshot(cacheKey, data);

            renderMyRank(data);
            renderLeaderboardRows(data.leaderboard);
            renderPeriodInfo(data.period);
            setLeaderboardStatus(buildLeaderboardStatusText(result.cacheStatus, data.generatedAt) || "排行榜已更新", false);
        })
        .catch(function (error) {
            setLeaderboardStatus("排行榜載入失敗: " + error.message, true);
        })
        .finally(function () {
            leaderboardBusy = false;
        });
}

function refreshLeaderboard() {
    return Promise.allSettled([
        loadChampionSummary(false, true),
        loadLeaderboard(false, true)
    ]);
}

function bindChampionCardClicks() {
    ["leaderboard-champion-grid", "leaderboard-hof-grid"].forEach(function (containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.addEventListener("click", function (event) {
            var card = event.target.closest(".leaderboard-champion-card[data-type]");
            if (!card) return;
            jumpToLeaderboard(card.getAttribute("data-type"), card.getAttribute("data-scope"));
        });
    });
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

    bindChampionCardClicks();
    updateControlsUI();
    loadChampionSummary(false, false);
    loadLeaderboard(false, false);
}

window.loadLeaderboard = loadLeaderboard;
window.refreshLeaderboard = refreshLeaderboard;
window.initLeaderboardPage = initLeaderboardPage;
