var leaderboardBusy = false;
var leaderboardScope = 'total';
var scopeConfig = {
    total: {
        action: 'total_bet',
        title: '🏆 累積押注排行榜',
        betLabel: '累積押注',
        emptyText: '目前還沒有累積押注資料'
    },
    weekly: {
        action: 'weekly_bet',
        title: '🏆 周榜押注排行榜',
        betLabel: '本週押注',
        emptyText: '本週尚無押注資料'
    },
    monthly: {
        action: 'monthly_bet',
        title: '🏆 月榜押注排行榜',
        betLabel: '本月押注',
        emptyText: '本月尚無押注資料'
    },
    season: {
        action: 'season_bet',
        title: '🏆 賽季押注排行榜',
        betLabel: '賽季押注',
        emptyText: '本賽季尚無押注資料'
    }
};

function getScopeConfig() {
    return scopeConfig[leaderboardScope] || scopeConfig.total;
}

function setScope(scopeKey) {
    if (!scopeConfig[scopeKey]) return;
    leaderboardScope = scopeKey;
    updateScopeUI();
    loadLeaderboard(false);
}

function updateScopeUI() {
    var config = getScopeConfig();
    var titleEl = document.getElementById('leaderboard-title');
    var labelEl = document.getElementById('my-bet-label');
    var periodEl = document.getElementById('leaderboard-period');
    var scopeEl = document.getElementById('leaderboard-scope');
    if (titleEl) titleEl.innerText = config.title;
    if (labelEl) labelEl.innerText = config.betLabel;
    if (periodEl) periodEl.innerText = leaderboardScope === 'total' ? '累積至今' : '載入本期區間...';
    if (scopeEl) {
        Array.prototype.slice.call(scopeEl.querySelectorAll('.scope-btn')).forEach(function (btn) {
            var isActive = btn.getAttribute('data-scope') === leaderboardScope;
            if (isActive) btn.classList.add('is-active');
            else btn.classList.remove('is-active');
        });
    }
    document.title = (config.title || '排行榜') + ' | 子熙模擬器';
}

function setLeaderboardStatus(text, isError) {
    var el = document.getElementById('leaderboard-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#d9b75f';
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
            var fallbackBet = data.myPeriodBet ? Number(data.myPeriodBet) : 0;
            myBetEl.innerText = formatCompactZh(fallbackBet, 2) + ' 子熙幣';
        }
        if (myNameEl) myNameEl.innerText = '-';
        return;
    }

    if (myRankEl) myRankEl.innerText = fmtRank(data.myRank.rank);
    if (myBetEl) myBetEl.innerText = formatCompactZh(data.myRank.totalBet, 2) + ' 子熙幣';
    if (myNameEl) {
        var titleText = data.myRank.title && data.myRank.title.name ? ('[' + data.myRank.title.name + '] ') : '';
        var avatarText = data.myRank.avatar && data.myRank.avatar.icon ? (data.myRank.avatar.icon + ' ') : '';
        myNameEl.innerText = avatarText + titleText + (data.myRank.displayName || data.myRank.maskedAddress);
    }
}

function renderLeaderboardRows(items) {
    var container = document.getElementById('leaderboard-list');
    if (!container) return;
    var config = getScopeConfig();

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="leaderboard-empty">' + escapeHtml(config.emptyText) + '</div>';
        return;
    }

    var currentAddress = String(user.address || '').trim().toLowerCase();
    var html = '<div class="leaderboard-row leaderboard-head">' +
        '<span>名次</span><span>地址</span><span>' + escapeHtml(config.betLabel) + '</span><span>VIP</span>' +
        '</div>';

    items.forEach(function (item) {
        var isMine = item.address === currentAddress;
        var displayName = item.displayName || item.maskedAddress;
        var avatar = item.avatar && item.avatar.icon ? '<span class="leaderboard-avatar">' + escapeHtml(item.avatar.icon) + '</span>' : '';
        var titleAttr = item.title && item.title.description ? (' title="' + escapeHtml(item.title.description) + '"') : '';
        var avatarAttr = item.avatar && item.avatar.description ? (' title="' + escapeHtml(item.avatar.description) + '"') : '';
        var title = item.title && item.title.name ? '<span class="leaderboard-title-chip"' + titleAttr + '>' + escapeHtml(item.title.name) + '</span>' : '';
        var avatarSpan = item.avatar && item.avatar.icon ? '<span class="leaderboard-avatar"' + avatarAttr + '>' + escapeHtml(item.avatar.icon) + '</span>' : '';
        html += '<div class="leaderboard-row' + (isMine ? ' is-me' : '') + '">' +
            '<span class="rank-col">' + fmtRank(item.rank) + '</span>' +
            '<span class="addr-col" title="' + escapeHtml(item.address) + '">' + avatarSpan + title + '<span class="leaderboard-name">' + escapeHtml(displayName) + (isMine ? ' (你)' : '') + '</span></span>' +
            '<span class="bet-col">' + formatCompactZh(item.totalBet, 2) + ' 子熙幣</span>' +
            '<span class="vip-col">' + escapeHtml(item.vipLevel) + '</span>' +
            '</div>';
    });

    container.innerHTML = html;
}

function renderPeriodInfo(period) {
    var periodEl = document.getElementById('leaderboard-period');
    if (!periodEl) return;
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
    var config = getScopeConfig();

    return fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: config.action,
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
    var scopeEl = document.getElementById('leaderboard-scope');
    if (scopeEl) {
        Array.prototype.slice.call(scopeEl.querySelectorAll('.scope-btn')).forEach(function (btn) {
            btn.addEventListener('click', function () {
                setScope(btn.getAttribute('data-scope'));
            });
        });
    }
    updateScopeUI();
    loadLeaderboard(false);
}
