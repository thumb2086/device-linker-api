var duelPollTimer = null;
var duelSyncBusy = false;
var duelState = null;
var selectedStakeTier = 1000;
var appliedPayoutTxHashes = {};

function duelApi(action, payload) {
    return fetch('/api/game?game=duel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
            game: 'duel',
            action: action,
            sessionId: user.sessionId
        }, payload || {}))
    }).then(function (res) { return res.json(); });
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDice(dice) {
    if (!Array.isArray(dice) || dice.length === 0) return '-';
    return dice.join(' / ');
}

function setDuelStatus(text, isError) {
    var statusEl = document.getElementById('status-msg');
    if (!statusEl) return;
    statusEl.innerText = text || '';
    statusEl.style.color = isError ? '#ff8b7d' : '#f0f7ff';
}

function setDuelTx(txHash) {
    var txEl = document.getElementById('tx-log');
    if (!txEl) return;
    txEl.innerHTML = txHash ? txLinkHTML(txHash) : '';
}

function selectStakeTier(stakeTier) {
    selectedStakeTier = Number(stakeTier) || 1000;
    [1000, 5000, 10000].forEach(function (tier) {
        var button = document.getElementById('stake-tier-' + tier);
        if (!button) return;
        button.classList.toggle('active', tier === selectedStakeTier);
    });
}

function setActionButtons(config) {
    var joinBtn = document.getElementById('join-btn');
    var cancelBtn = document.getElementById('cancel-btn');
    var rollBtn = document.getElementById('roll-btn');
    var timeoutBtn = document.getElementById('timeout-btn');
    var retryBtn = document.getElementById('retry-btn');

    if (joinBtn) joinBtn.disabled = !config.canJoin;
    if (cancelBtn) cancelBtn.disabled = !config.canCancel;
    if (rollBtn) rollBtn.disabled = !config.canRoll;
    if (timeoutBtn) timeoutBtn.disabled = !config.canClaimTimeout;
    if (retryBtn) retryBtn.disabled = !config.canRetryPayout;
}

function renderLog(items) {
    var logEl = document.getElementById('duel-log');
    if (!logEl) return;

    if (!Array.isArray(items) || items.length === 0) {
        logEl.innerHTML = '<div class="empty-state">目前沒有對戰紀錄</div>';
        return;
    }

    logEl.innerHTML = items.map(function (item) {
        return '<div class="log-item">' + escapeHtml(item) + '</div>';
    }).join('');
}

function renderRounds(rounds) {
    var roundEl = document.getElementById('round-list');
    if (!roundEl) return;

    if (!Array.isArray(rounds) || rounds.length === 0) {
        roundEl.innerHTML = '<div class="empty-state">尚未開始對局</div>';
        return;
    }

    roundEl.innerHTML = rounds.slice().reverse().map(function (round) {
        var badgeClass = 'round-result';
        var badgeText = '平手';
        if (round.outcome === 'win') {
            badgeClass += ' win';
            badgeText = '你贏';
        } else if (round.outcome === 'lose') {
            badgeClass += ' lose';
            badgeText = '你輸';
        } else {
            badgeClass += ' tie';
        }

        return '<div class="round-item">' +
            '<div class="' + badgeClass + '">' + badgeText + '</div>' +
            '<div class="round-title">第 ' + escapeHtml(round.number) + ' 局</div>' +
            '<div class="round-dice-row">你：' + escapeHtml(formatDice(round.myDice)) + ' = ' + escapeHtml(round.myTotal) + '</div>' +
            '<div class="round-dice-row">對手：' + escapeHtml(formatDice(round.opponentDice)) + ' = ' + escapeHtml(round.opponentTotal) + '</div>' +
            '<div class="round-summary">' + escapeHtml(round.summary || '') + '</div>' +
            '</div>';
    }).join('');
}

function applyWinnerBalanceIfNeeded(match) {
    if (!match || !match.payoutTxHash || match.winnerAddress !== String(user.address || '').toLowerCase()) return;
    if (appliedPayoutTxHashes[match.payoutTxHash]) return;

    appliedPayoutTxHashes[match.payoutTxHash] = true;
    setDisplayedBalance(getCurrentUserBalance() + Number(match.stakeTier || 0) * 2, 30000, 'duel');
}

function renderIdleState() {
    document.getElementById('self-name').innerText = user.displayName || user.address || '你';
    document.getElementById('opponent-name').innerText = '等待對手';
    document.getElementById('self-score').innerText = '0';
    document.getElementById('opponent-score').innerText = '0';
    document.getElementById('my-roll-state').innerText = '尚未出骰';
    document.getElementById('opponent-roll-state').innerText = '尚未出骰';
    document.getElementById('round-number').innerText = '第 1 局';
    document.getElementById('round-meta').innerText = '等待加入對戰';
    document.getElementById('round-deadline').innerText = '先拿下 2 局者獲勝';
    renderRounds([]);
    renderLog([]);
    setDuelTx('');
    setActionButtons({
        canJoin: true,
        canCancel: false,
        canRoll: false,
        canClaimTimeout: false,
        canRetryPayout: false
    });
    setDuelStatus('選擇檔位後加入配對，系統會自動匹配同檔位玩家', false);
}

function renderWaitingState(waiting) {
    selectedStakeTier = Number(waiting.stakeTier || selectedStakeTier);
    selectStakeTier(selectedStakeTier);
    document.getElementById('self-name').innerText = user.displayName || user.address || '你';
    document.getElementById('opponent-name').innerText = '等待對手';
    document.getElementById('self-score').innerText = '0';
    document.getElementById('opponent-score').innerText = '0';
    document.getElementById('my-roll-state').innerText = '已鎖定 ' + Number(waiting.stakeTier || 0).toLocaleString();
    document.getElementById('opponent-roll-state').innerText = '等待中';
    document.getElementById('round-number').innerText = '配對中';
    document.getElementById('round-meta').innerText = Number(waiting.stakeTier || 0).toLocaleString() + ' 檔位';
    document.getElementById('round-deadline').innerText = '已扣除入場金額，找到對手後自動開局';
    renderRounds([]);
    renderLog([
        '你已進入 ' + Number(waiting.stakeTier || 0).toLocaleString() + ' 檔位等待配對',
        '等待同檔位玩家加入後開始第 1 局'
    ]);
    setDuelTx(waiting.txHash || '');
    setActionButtons({
        canJoin: false,
        canCancel: true,
        canRoll: false,
        canClaimTimeout: false,
        canRetryPayout: false
    });
    setDuelStatus('配對中，找到對手後會自動開始擲骰對戰', false);
}

function renderMatchState(match) {
    if (!match) {
        renderIdleState();
        return;
    }

    selectedStakeTier = Number(match.stakeTier || selectedStakeTier);
    selectStakeTier(selectedStakeTier);

    document.getElementById('self-name').innerText = match.self && match.self.displayName ? match.self.displayName : (user.displayName || user.address || '你');
    document.getElementById('opponent-name').innerText = match.opponent && match.opponent.displayName ? match.opponent.displayName : '等待對手';
    document.getElementById('self-score').innerText = String(match.score && match.score.self !== undefined ? match.score.self : 0);
    document.getElementById('opponent-score').innerText = String(match.score && match.score.opponent !== undefined ? match.score.opponent : 0);
    document.getElementById('my-roll-state').innerText = match.currentRound && match.currentRound.mySubmitted ? '本局已出骰' : '尚未出骰';
    document.getElementById('opponent-roll-state').innerText = match.currentRound && match.currentRound.opponentSubmitted ? '本局已出骰' : '尚未出骰';
    document.getElementById('round-number').innerText = '第 ' + String(match.roundNumber || 1) + ' 局';

    if (match.status === 'finished') {
        document.getElementById('round-meta').innerText = match.winnerAddress === String(user.address || '').toLowerCase() ? '你已獲勝' : '對手獲勝';
        document.getElementById('round-deadline').innerText = match.payoutTxHash ? '派彩完成' : '對戰結束';
    } else if (match.status === 'settling') {
        document.getElementById('round-meta').innerText = '等待派彩';
        document.getElementById('round-deadline').innerText = match.settlementError ? ('派彩失敗：' + match.settlementError) : '系統正在派彩';
    } else {
        document.getElementById('round-meta').innerText = Number(match.stakeTier || 0).toLocaleString() + ' 檔位，先贏 2 局';
        document.getElementById('round-deadline').innerText = '剩餘 ' + Math.ceil(Number(match.currentRound && match.currentRound.deadlineMs || 0) / 1000) + ' 秒';
    }

    renderRounds(match.resolvedRounds || []);
    renderLog(match.log || []);
    setDuelTx(match.payoutTxHash || '');
    setActionButtons({
        canJoin: false,
        canCancel: false,
        canRoll: !!match.canRoll,
        canClaimTimeout: !!match.canClaimTimeout,
        canRetryPayout: !!match.canRetryPayout
    });

    applyWinnerBalanceIfNeeded(match);

    if (match.status === 'finished') {
        setDuelStatus(match.winnerAddress === String(user.address || '').toLowerCase() ? '你贏得了這場 PVP 對戰' : '本場 PVP 對戰已分出勝負', false);
        return;
    }

    if (match.status === 'settling') {
        setDuelStatus(match.canRetryPayout ? '你已獲勝，但派彩失敗，可點擊重試派彩' : '對戰已結束，系統正在完成派彩', !!match.settlementError);
        return;
    }

    if (match.canRoll) {
        setDuelStatus('輪到你擲骰，雙方都提交後才會揭露點數', false);
    } else if (match.currentRound && match.currentRound.mySubmitted) {
        setDuelStatus('你已提交本局骰點，等待對手出骰', false);
    } else {
        setDuelStatus('等待對手行動', false);
    }
}

function renderDuelState(payload) {
    duelState = payload || null;
    if (!payload || payload.status === 'idle') {
        renderIdleState();
        return;
    }
    if (payload.status === 'waiting') {
        renderWaitingState(payload.waiting || {});
        return;
    }
    renderMatchState(payload.match || null);
}

function syncDuelStatus(silent) {
    if (duelSyncBusy) return Promise.resolve();
    duelSyncBusy = true;

    return duelApi('status')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '同步對戰狀態失敗');
            renderDuelState(data);
        })
        .catch(function (error) {
            if (!silent) setDuelStatus('錯誤: ' + error.message, true);
        })
        .finally(function () {
            duelSyncBusy = false;
        });
}

function joinDuelQueue() {
    setDuelStatus('加入配對中...', false);
    duelApi('join_queue', { stakeTier: selectedStakeTier })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '加入配對失敗');
            if (Number(data.debitedAmount || 0) > 0) {
                setDisplayedBalance(getCurrentUserBalance() - Number(data.debitedAmount), 30000, 'duel');
            }
            renderDuelState(data);
            refreshBalance();
        })
        .catch(function (error) {
            setDuelStatus('錯誤: ' + error.message, true);
        });
}

function cancelDuelQueue() {
    setDuelStatus('取消等待中...', false);
    duelApi('cancel_queue')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '取消等待失敗');
            if (Number(data.refundedAmount || 0) > 0) {
                setDisplayedBalance(getCurrentUserBalance() + Number(data.refundedAmount), 30000, 'duel');
            }
            renderDuelState(data);
            if (data.txHash) setDuelTx(data.txHash);
            refreshBalance();
        })
        .catch(function (error) {
            setDuelStatus('錯誤: ' + error.message, true);
        });
}

function rollDuelDice() {
    setDuelStatus('擲骰中...', false);
    duelApi('roll')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '擲骰失敗');
            if (Number(data.payoutAmount || 0) > 0) {
                setDisplayedBalance(getCurrentUserBalance() + Number(data.payoutAmount), 30000, 'duel');
                if (data.txHash) appliedPayoutTxHashes[data.txHash] = true;
            }
            renderDuelState(data);
            if (Number(data.payoutAmount || 0) > 0) refreshBalance();
        })
        .catch(function (error) {
            setDuelStatus('錯誤: ' + error.message, true);
        });
}

function claimDuelTimeout() {
    setDuelStatus('確認對手超時中...', false);
    duelApi('claim_timeout')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '宣告超時失敗');
            if (Number(data.payoutAmount || 0) > 0) {
                setDisplayedBalance(getCurrentUserBalance() + Number(data.payoutAmount), 30000, 'duel');
                if (data.txHash) appliedPayoutTxHashes[data.txHash] = true;
            }
            renderDuelState(data);
            if (Number(data.payoutAmount || 0) > 0) refreshBalance();
        })
        .catch(function (error) {
            setDuelStatus('錯誤: ' + error.message, true);
        });
}

function retryDuelPayout() {
    setDuelStatus('重新發送派彩中...', false);
    duelApi('retry_payout')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '重試派彩失敗');
            if (Number(data.payoutAmount || 0) > 0) {
                setDisplayedBalance(getCurrentUserBalance() + Number(data.payoutAmount), 30000, 'duel');
                if (data.txHash) appliedPayoutTxHashes[data.txHash] = true;
            }
            renderDuelState(data);
            if (Number(data.payoutAmount || 0) > 0) refreshBalance();
        })
        .catch(function (error) {
            setDuelStatus('錯誤: ' + error.message, true);
        });
}

function initDuelPage() {
    selectStakeTier(selectedStakeTier);
    renderIdleState();
    syncDuelStatus(false);

    if (duelPollTimer) clearInterval(duelPollTimer);
    duelPollTimer = window.setInterval(function () {
        syncDuelStatus(true);
    }, 3000);
}
