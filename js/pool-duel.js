var poolStatusBusy = false;
var poolPollTimer = null;
var currentPoolState = null;

function setPoolStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#d7f5e6';
}

function setPoolTx(txHash) {
    var txEl = document.getElementById('tx-log');
    if (!txEl) return;
    txEl.innerHTML = txHash ? txLinkHTML(txHash) : '';
}

function renderPoolLog(items) {
    var logEl = document.getElementById('pool-log');
    if (!logEl) return;
    if (!Array.isArray(items) || items.length === 0) {
        logEl.innerHTML = '<div class="pool-log-item">目前還沒有對局紀錄</div>';
        return;
    }

    logEl.innerHTML = items.map(function (item) {
        return '<div class="pool-log-item">' + String(item || '') + '</div>';
    }).join('');
}

function setPoolButtons(config) {
    var joinBtn = document.getElementById('join-btn');
    var cancelBtn = document.getElementById('cancel-btn');
    var timeoutBtn = document.getElementById('timeout-btn');
    var rewardBtn = document.getElementById('reward-btn');
    var shotButtons = ['shot-soft', 'shot-bank', 'shot-power'].map(function (id) { return document.getElementById(id); });

    if (joinBtn) joinBtn.disabled = !config.canJoin;
    if (cancelBtn) cancelBtn.disabled = !config.canCancel;
    if (timeoutBtn) timeoutBtn.disabled = !config.canClaimTimeout;
    if (rewardBtn) rewardBtn.disabled = !config.canClaimReward;
    shotButtons.forEach(function (button) {
        if (button) button.disabled = !config.canShoot;
    });
}

function renderPoolState(payload) {
    currentPoolState = payload || null;
    var match = payload && payload.match ? payload.match : null;
    var waiting = payload && payload.waiting;
    var queue = payload && payload.queue ? payload.queue : null;

    var selfNameEl = document.getElementById('self-name');
    var opponentNameEl = document.getElementById('opponent-name');
    var selfScoreEl = document.getElementById('self-score');
    var opponentScoreEl = document.getElementById('opponent-score');
    var turnBadgeEl = document.getElementById('turn-badge');
    var turnTimerEl = document.getElementById('turn-timer');

    if (waiting && queue) {
        if (selfNameEl) selfNameEl.innerText = '你';
        if (opponentNameEl) opponentNameEl.innerText = '等待對手';
        if (selfScoreEl) selfScoreEl.innerText = '0';
        if (opponentScoreEl) opponentScoreEl.innerText = '0';
        if (turnBadgeEl) turnBadgeEl.innerText = '配對中';
        if (turnTimerEl) turnTimerEl.innerText = '已鎖定 1,000 子熙幣';
        setPoolButtons({
            canJoin: false,
            canCancel: true,
            canClaimTimeout: false,
            canClaimReward: false,
            canShoot: false
        });
        setPoolStatus('配對中，找到對手後會自動開局', false);
        if (queue.txHash) setPoolTx(queue.txHash);
        renderPoolLog(['你已進入撞球對戰等待隊列']);
        return;
    }

    if (!match || match.status === 'idle') {
        if (selfNameEl) selfNameEl.innerText = '你';
        if (opponentNameEl) opponentNameEl.innerText = '等待對手';
        if (selfScoreEl) selfScoreEl.innerText = '0';
        if (opponentScoreEl) opponentScoreEl.innerText = '0';
        if (turnBadgeEl) turnBadgeEl.innerText = '尚未開局';
        if (turnTimerEl) turnTimerEl.innerText = '固定賭注 1,000';
        setPoolButtons({
            canJoin: true,
            canCancel: false,
            canClaimTimeout: false,
            canClaimReward: false,
            canShoot: false
        });
        setPoolStatus('點擊加入配對後會先鎖定 1,000 子熙幣', false);
        setPoolTx('');
        renderPoolLog([]);
        return;
    }

    if (selfNameEl) selfNameEl.innerText = match.self ? match.self.displayName : '你';
    if (opponentNameEl) opponentNameEl.innerText = match.opponent ? match.opponent.displayName : '等待對手';
    if (selfScoreEl) selfScoreEl.innerText = String(match.self ? match.self.score : 0);
    if (opponentScoreEl) opponentScoreEl.innerText = String(match.opponent ? match.opponent.score : 0);
    if (turnBadgeEl) {
        if (match.status === 'finished') {
            turnBadgeEl.innerText = match.winnerAddress === (match.self && match.self.address) ? '你獲勝' : (match.winnerDisplayName || '對手獲勝');
        } else if (match.status === 'settling') {
            turnBadgeEl.innerText = '等待結算';
        } else {
            turnBadgeEl.innerText = match.isMyTurn ? '輪到你出桿' : '輪到對手';
        }
    }
    if (turnTimerEl) {
        turnTimerEl.innerText = match.status === 'active'
            ? ('剩餘 ' + Math.ceil((match.turnDeadlineMs || 0) / 1000) + ' 秒')
            : (match.settlementError ? ('結算待重試：' + match.settlementError) : '本局固定賭注 1,000');
    }

    setPoolButtons({
        canJoin: false,
        canCancel: false,
        canClaimTimeout: !!match.canClaimTimeout,
        canClaimReward: !!match.canClaimReward,
        canShoot: !!match.isMyTurn && match.status === 'active'
    });

    if (match.payoutTxHash) setPoolTx(match.payoutTxHash);
    renderPoolLog(match.log);

    if (match.status === 'active') {
        setPoolStatus(match.isMyTurn ? '選擇一種出桿方式，先進 3 顆球獲勝' : '等待對手出桿', false);
    } else if (match.status === 'settling') {
        setPoolStatus(match.canClaimReward ? '你已獲勝，請領取 2,000 子熙幣' : '對局已分勝負，等待勝者領獎', false);
    } else {
        setPoolStatus(match.winnerAddress === (match.self && match.self.address) ? '你贏下本局撞球對戰' : '本局撞球對戰已結束', false);
    }
}

function callPoolApi(action, payload) {
    var body = {
        game: 'poolduel',
        action: action,
        sessionId: user.sessionId
    };
    if (payload && typeof payload === 'object') {
        Object.keys(payload).forEach(function (key) {
            body[key] = payload[key];
        });
    }

    return fetch('/api/game?game=poolduel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (res) { return res.json(); });
}

function syncPoolStatus(silent) {
    if (poolStatusBusy) return Promise.resolve();
    poolStatusBusy = true;

    return callPoolApi('status')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '撞球對戰同步失敗');
            renderPoolState(data);
        })
        .catch(function (error) {
            if (!silent) setPoolStatus('錯誤: ' + error.message, true);
        })
        .finally(function () {
            poolStatusBusy = false;
        });
}

function joinPoolQueue() {
    setPoolStatus('加入配對中...', false);
    callPoolApi('join_queue')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '加入配對失敗');
            renderPoolState(data);
            refreshBalance();
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function cancelPoolQueue() {
    setPoolStatus('取消等待中...', false);
    callPoolApi('cancel_queue')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '取消等待失敗');
            renderPoolState(data);
            if (data.txHash) setPoolTx(data.txHash);
            refreshBalance();
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function submitPoolShot(type) {
    setPoolStatus('出桿中...', false);
    callPoolApi('shoot', { shotType: type })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '出桿失敗');
            renderPoolState(data);
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function claimTurnTimeout() {
    setPoolStatus('正在確認超時...', false);
    callPoolApi('claim_turn_timeout')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '宣告超時失敗');
            renderPoolState(data);
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function claimPoolReward() {
    setPoolStatus('領取獎勵中...', false);
    callPoolApi('claim_reward')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '領取獎勵失敗');
            renderPoolState(data);
            if (data.txHash) setPoolTx(data.txHash);
            refreshBalance();
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function initPoolDuelPage() {
    syncPoolStatus(false);
    poolPollTimer = window.setInterval(function () {
        syncPoolStatus(true);
    }, 3000);
}
