var leaderboardBusy = false;

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
        if (myBetEl) myBetEl.innerText = '0';
        if (myNameEl) myNameEl.innerText = '-';
        return;
    }

    if (myRankEl) myRankEl.innerText = fmtRank(data.myRank.rank);
    if (myBetEl) myBetEl.innerText = formatCompactZh(data.myRank.totalBet, 2) + ' 子熙幣';
    if (myNameEl) myNameEl.innerText = data.myRank.displayName || data.myRank.maskedAddress;
}

function renderLeaderboardRows(items) {
    var container = document.getElementById('leaderboard-list');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="leaderboard-empty">目前還沒有累積押注資料</div>';
        return;
    }

    var currentAddress = String(user.address || '').trim().toLowerCase();
    var html = '<div class="leaderboard-row leaderboard-head">' +
        '<span>名次</span><span>地址</span><span>累積押注</span><span>VIP</span>' +
        '</div>';

    items.forEach(function (item) {
        var isMine = item.address === currentAddress;
        var displayName = item.displayName || item.maskedAddress;
        html += '<div class="leaderboard-row' + (isMine ? ' is-me' : '') + '">' +
            '<span class="rank-col">' + fmtRank(item.rank) + '</span>' +
            '<span class="addr-col" title="' + escapeHtml(item.address) + '">' + escapeHtml(displayName) + (isMine ? ' (你)' : '') + '</span>' +
            '<span class="bet-col">' + formatCompactZh(item.totalBet, 2) + ' 子熙幣</span>' +
            '<span class="vip-col">' + escapeHtml(item.vipLevel) + '</span>' +
            '</div>';
    });

    container.innerHTML = html;
}

function loadLeaderboard(silent) {
    if (leaderboardBusy) return Promise.resolve();
    leaderboardBusy = true;
    if (!silent) setLeaderboardStatus('同步排行榜中...', false);

    return fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'total_bet',
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
    loadLeaderboard(false);
}
