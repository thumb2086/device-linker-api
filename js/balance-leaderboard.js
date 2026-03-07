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
    var myAssetsEl = document.getElementById('my-assets');
    var totalEl = document.getElementById('leaderboard-total');
    if (totalEl) totalEl.innerText = Number(data.totalPlayers || 0).toLocaleString();

    if (!data.myRank) {
        if (myRankEl) myRankEl.innerText = '未上榜';
        if (myBalanceEl) myBalanceEl.innerText = '0';
        if (myAssetsEl) myAssetsEl.innerText = '-';
        return;
    }

    if (myRankEl) myRankEl.innerText = '#' + Number(data.myRank.rank).toLocaleString();
    if (myBalanceEl) myBalanceEl.innerText = formatCompactZh(data.myRank.netWorth, 2) + ' 子熙幣';
    if (myAssetsEl) {
        myAssetsEl.innerText =
            '鏈上 ' + formatCompactZh(data.myRank.walletBalance, 2) +
            ' / 銀行 ' + formatCompactZh(data.myRank.bankBalance, 2) +
            ' / 股票 ' + formatCompactZh(data.myRank.stockValue, 2) +
            ' / 期貨損益 ' + formatCompactZh(data.myRank.futuresUnrealizedPnl, 2) +
            ' / 負債 -' + formatCompactZh(data.myRank.loanPrincipal, 2);
    }
}

function renderBalanceLeaderboardRows(items) {
    var container = document.getElementById('leaderboard-list');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="leaderboard-empty">目前還沒有可用淨資產資料</div>';
        return;
    }

    var currentAddress = String(user.address || '').trim().toLowerCase();
    var html = '<div class="leaderboard-row leaderboard-head leaderboard-balance-row">' +
        '<span>名次</span><span>地址</span><span>淨資產</span><span>VIP</span>' +
        '</div>';

    items.forEach(function (item) {
        var isMine = item.address === currentAddress;
        var displayName = item.displayName || item.maskedAddress;
        html += '<div class="leaderboard-row leaderboard-balance-row' + (isMine ? ' is-me' : '') + '">' +
            '<span class="rank-col">#' + Number(item.rank).toLocaleString() + '</span>' +
            '<span class="addr-col" title="' + item.address + '">' + displayName + (isMine ? ' (你)' : '') + '</span>' +
            '<span class="bet-col" title="鏈上 ' + item.walletBalance + ' / 銀行 ' + item.bankBalance + ' / 股票 ' + item.stockValue + ' / 期貨損益 ' + item.futuresUnrealizedPnl + ' / 負債 -' + item.loanPrincipal + '">' + formatCompactZh(item.netWorth, 2) + ' 子熙幣</span>' +
            '<span class="vip-col">' + item.vipLevel + '</span>' +
            '</div>';
    });

    container.innerHTML = html;
}

function loadBalanceLeaderboard(silent) {
    if (balanceLeaderboardBusy) return Promise.resolve();
    balanceLeaderboardBusy = true;
    if (!silent) setBalanceLeaderboardStatus('同步淨資產排行榜中...', false);

    return fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'net_worth',
            sessionId: user.sessionId,
            limit: 50
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '淨資產排行榜載入失敗');
            renderMyBalanceRank(data);
            renderBalanceLeaderboardRows(data.leaderboard);
            setBalanceLeaderboardStatus('淨資產排行榜已更新', false);
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
