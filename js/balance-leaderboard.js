var balanceLeaderboardBusy = false;

function setBalanceLeaderboardStatus(text, isError) {
    var el = document.getElementById('leaderboard-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#d9b75f';
}

function renderMyBalanceRank(data) {
    var myRankEl = document.getElementById('my-rank');
    var myBalanceEl = document.getElementById('my-balance');
    var totalEl = document.getElementById('leaderboard-total');
    if (totalEl) totalEl.innerText = Number(data.totalPlayers || 0).toLocaleString();

    if (!data.myRank) {
        if (myRankEl) myRankEl.innerText = '未上榜';
        if (myBalanceEl) myBalanceEl.innerText = '0';
        return;
    }

    if (myRankEl) myRankEl.innerText = '#' + Number(data.myRank.rank).toLocaleString();
    if (myBalanceEl) myBalanceEl.innerText = formatCompactZh(data.myRank.balance, 2) + ' 子熙幣';
}

function renderBalanceLeaderboardRows(items) {
    var container = document.getElementById('leaderboard-list');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="leaderboard-empty">目前還沒有可用餘額資料</div>';
        return;
    }

    var currentAddress = String(user.address || '').trim().toLowerCase();
    var html = '<div class="leaderboard-row leaderboard-head leaderboard-balance-row">' +
        '<span>名次</span><span>地址</span><span>鏈上餘額</span><span>VIP</span>' +
        '</div>';

    items.forEach(function (item) {
        var isMine = item.address === currentAddress;
        html += '<div class="leaderboard-row leaderboard-balance-row' + (isMine ? ' is-me' : '') + '">' +
            '<span class="rank-col">#' + Number(item.rank).toLocaleString() + '</span>' +
            '<span class="addr-col" title="' + item.address + '">' + item.maskedAddress + (isMine ? ' (你)' : '') + '</span>' +
            '<span class="bet-col">' + formatCompactZh(item.balance, 2) + ' 子熙幣</span>' +
            '<span class="vip-col">' + item.vipLevel + '</span>' +
            '</div>';
    });

    container.innerHTML = html;
}

function loadBalanceLeaderboard(silent) {
    if (balanceLeaderboardBusy) return Promise.resolve();
    balanceLeaderboardBusy = true;
    if (!silent) setBalanceLeaderboardStatus('同步餘額排行榜中...', false);

    return fetch('/api/balance-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: user.sessionId,
            limit: 50
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '餘額排行榜載入失敗');
            renderMyBalanceRank(data);
            renderBalanceLeaderboardRows(data.leaderboard);
            setBalanceLeaderboardStatus('餘額排行榜已更新', false);
        })
        .catch(function (error) {
            setBalanceLeaderboardStatus('錯誤: ' + error.message, true);
        })
        .finally(function () {
            balanceLeaderboardBusy = false;
        });
}

function initBalanceLeaderboardPage() {
    loadBalanceLeaderboard(false);
}
