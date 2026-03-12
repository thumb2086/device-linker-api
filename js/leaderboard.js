var leaderboardBusy = false;
var leaderboardType = 'total-bet';
var leaderboardScope = 'total';

var config = {
    'total-bet': {
        title: '押注榜',
        scopes: {
            total: { action: 'total_bet', title: '🏆 累積押注排行榜', valueLabel: '累積押注', emptyText: '目前還沒有累積押注資料' },
            weekly: { action: 'weekly_bet', title: '🏆 周榜押注排行榜', valueLabel: '本週押注', emptyText: '本週尚無押注資料' },
            monthly: { action: 'monthly_bet', title: '🏆 月榜押注排行榜', valueLabel: '本月押注', emptyText: '本月尚無押注資料' },
            season: { action: 'season_bet', title: '🏆 賽季押注排行榜', valueLabel: '賽季押注', emptyText: '本賽季尚無押注資料' }
        }
    },
    'balance': {
        title: '淨資產榜',
        scopes: {
            total: { action: 'net_worth', title: '🏆 淨資產排行榜', valueLabel: '淨資產', emptyText: '目前還沒有淨資產資料' }
        }
    }
};

function getLeaderboardConfig() {
    var typeCfg = config[leaderboardType] || config['total-bet'];
    var scopeCfg = typeCfg.scopes[leaderboardScope] || typeCfg.scopes.total;
    return scopeCfg;
}

function setType(type) {
    if (!config[type] || leaderboardBusy) return;
    leaderboardType = type;
    leaderboardScope = 'total';
    updateControlsUI();
    loadLeaderboard(false);
}

function setScope(scopeKey) {
    if (leaderboardBusy) return;
    var typeCfg = config[leaderboardType] || config['total-bet'];
    if (!typeCfg.scopes[scopeKey]) return;
    leaderboardScope = scopeKey;
    updateControlsUI();
    loadLeaderboard(false);
}

function updateControlsUI() {
    var lconfig = getLeaderboardConfig();
    var titleEl = document.getElementById('leaderboard-title');
    var labelEl = document.getElementById('my-bet-label');
    var periodEl = document.getElementById('leaderboard-period');
    var scopeContainer = document.getElementById('leaderboard-scope');
    var typeContainer = document.querySelector('.leaderboard-type-selector');

    if (titleEl) titleEl.innerText = lconfig.title;
    if (labelEl) labelEl.innerText = lconfig.valueLabel;
    if (periodEl) periodEl.style.display = leaderboardType === 'total-bet' ? 'block' : 'none';

    if (typeContainer) {
        Array.prototype.slice.call(typeContainer.querySelectorAll('.type-btn')).forEach(function (btn) {
            var isActive = btn.getAttribute('data-type') === leaderboardType;
            if (isActive) btn.classList.add('is-active');
            else btn.classList.remove('is-active');
        });
    }

    if (scopeContainer) {
        scopeContainer.style.display = leaderboardType === 'total-bet' ? 'flex' : 'none';
        Array.prototype.slice.call(scopeContainer.querySelectorAll('.scope-btn')).forEach(function (btn) {
            var isActive = btn.getAttribute('data-scope') === leaderboardScope;
            if (isActive) btn.classList.add('is-active');
            else btn.classList.remove('is-active');
        });
    }
    document.title = (lconfig.title || '排行榜') + ' | 子熙模擬器';
}

function setLeaderboardStatus(text, isError) {
    var el = document.getElementById('leaderboard-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#d9b75f';
}

function escapeHtml(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtRank(rank) {
    var parsed = Number(rank || 0);
    if (!isFinite(parsed) || parsed <= 0) return '-';
    return '#' + parsed.toLocaleString();
}

function renderMyRank(data) {
    var myRankEl = document.getElementById('my-rank');
    var myBetEl = document.getElementById('my-total-bet');
    var myNameEl = document.getElementById('my-name');
    var totalEl = document.getElementById('leaderboard-total');
    if (totalEl) totalEl.innerText = Number(data.totalPlayers || 0).toLocaleString();

    if (!data.myRank) {
        if (myRankEl) myRankEl.innerText = '未上榜';
        if (myBetEl) {
            var fallbackValue = (leaderboardType === 'balance') ? 0 : (data.myPeriodBet || 0);
            myBetEl.innerText = formatCompactZh(fallbackValue, 2) + ' 子熙幣';
        }
        if (myNameEl) myNameEl.innerText = '-';
        return;
    }

    var rankValue = leaderboardType === 'balance' ? data.myRank.netWorth : data.myRank.totalBet;

    if (myRankEl) myRankEl.innerText = fmtRank(data.myRank.rank);
    if (myBetEl) myBetEl.innerText = formatCompactZh(rankValue, 2) + ' 子熙幣';
    if (myNameEl) {
        var titleText = data.myRank.title && data.myRank.title.name ? ('[' + data.myRank.title.name + '] ') : '';
        var avatarText = data.myRank.avatar && data.myRank.avatar.icon ? (data.myRank.avatar.icon + ' ') : '';
        myNameEl.innerText = avatarText + titleText + (data.myRank.displayName || data.myRank.maskedAddress);
    }
}

function renderLeaderboardRows(items) {
    var container = document.getElementById('leaderboard-list');
    if (!container) return;
    var lconfig = getLeaderboardConfig();

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="leaderboard-empty">' + escapeHtml(lconfig.emptyText) + '</div>';
        return;
    }

    var currentAddress = String(user.address || '').trim().toLowerCase();
    var html = '<div class="leaderboard-row leaderboard-head">' +
        '<span>名次</span><span>地址</span><span>' + escapeHtml(lconfig.valueLabel) + '</span><span>VIP</span>' +
        '</div>';

    items.forEach(function (item) {
        var isMine = item.address === currentAddress;
        var displayName = item.displayName || item.maskedAddress;
        var value = leaderboardType === 'balance' ? item.netWorth : item.totalBet;

        var titleAttr = item.title && item.title.description ? (' title="' + escapeHtml(item.title.description) + '"') : '';
        var avatarAttr = item.avatar && item.avatar.description ? (' title="' + escapeHtml(item.avatar.description) + '"') : '';
        var title = item.title && item.title.name ? '<span class="leaderboard-title-chip"' + titleAttr + '>' + escapeHtml(item.title.name) + '</span>' : '';
        var avatarSpan = item.avatar && item.avatar.icon ? '<span class="leaderboard-avatar"' + avatarAttr + '>' + escapeHtml(item.avatar.icon) + '</span>' : '';

        html += '<div class="leaderboard-row' + (isMine ? ' is-me' : '') + '">' +
            '<span class="rank-col">' + fmtRank(item.rank) + '</span>' +
            '<span class="addr-col" title="' + escapeHtml(item.address) + '">' + avatarSpan + title + '<span class="leaderboard-name">' + escapeHtml(displayName) + (isMine ? ' (你)' : '') + '</span></span>' +
            '<span class="bet-col">' + formatCompactZh(value, 2) + ' 子熙幣</span>' +
            '<span class="vip-col">' + escapeHtml(item.vipLevel) + '</span>' +
            '</div>';
    });

    container.innerHTML = html;
}

function renderPeriodInfo(period) {
    var periodEl = document.getElementById('leaderboard-period');
    if (!periodEl || leaderboardType !== 'total-bet') {
        if (periodEl) periodEl.innerText = '';
        return;
    }
    if (!period || !period.startAt || !period.endAt) {
        periodEl.innerText = '累積至今';
        return;
    }
    var start = new Date(period.startAt);
    var end = new Date(period.endAt);
    var dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
    var timeOptions = { hour: '2-digit', minute: '2-digit' };
    var startText = start.toLocaleDateString('zh-TW', dateOptions) + ' ' + start.toLocaleTimeString('zh-TW', timeOptions);
    var endText = end.toLocaleDateString('zh-TW', dateOptions) + ' ' + end.toLocaleTimeString('zh-TW', timeOptions);
    var idText = period.id ? ('期別: ' + period.id + ' · ') : '';
    periodEl.innerText = idText + startText + ' ~ ' + endText;
}

function loadLeaderboard(silent) {
    if (leaderboardBusy) return Promise.resolve();
    leaderboardBusy = true;
    if (!silent) setLeaderboardStatus('同步排行榜中...', false);
    var lconfig = getLeaderboardConfig();

    return fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: lconfig.action,
            sessionId: user.sessionId,
            limit: 50
        })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
        if (!data || !data.success) {
            throw new Error((data && data.error) || '排行榜載入失敗');
        }
        renderMyRank(data);
        renderLeaderboardRows(data.leaderboard);
        renderPeriodInfo(data.period);
        setLeaderboardStatus('排行榜已更新', false);
    })
    .catch(function (error) {
        setLeaderboardStatus('錯誤: ' + error.message, true);
    })
    .finally(function () {
        leaderboardBusy = false;
    });
}

function initLeaderboardPage() {
    var typeContainer = document.querySelector('.leaderboard-type-selector');
    if (typeContainer) {
        Array.prototype.slice.call(typeContainer.querySelectorAll('.type-btn')).forEach(function (btn) {
            btn.addEventListener('click', function () {
                setType(btn.getAttribute('data-type'));
            });
        });
    }

    var scopeContainer = document.getElementById('leaderboard-scope');
    if (scopeContainer) {
        Array.prototype.slice.call(scopeContainer.querySelectorAll('.scope-btn')).forEach(function (btn) {
            btn.addEventListener('click', function () {
                setScope(btn.getAttribute('data-scope'));
            });
        });
    }
    updateControlsUI();
    loadLeaderboard(false);
}
