var bluffPollTimer = null;
var bluffBusy = false;
var bluffState = null;

function bluffApi(action, payload) {
    return fetch('/api/game?game=bluffdice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
            game: 'bluffdice',
            action: action,
            sessionId: user.sessionId,
            tableId: getSelectedBluffTableId()
        }, payload || {}))
    }).then(function (res) { return res.json(); });
}

function escapeBluffHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSelectedBluffTableId() {
    var select = document.getElementById('bluff-table-select');
    return select ? String(select.value || 'public') : 'public';
}

function renderBluffTableOptions(tables, selectedTableId) {
    var select = document.getElementById('bluff-table-select');
    if (!select) return;
    select.innerHTML = (tables || []).map(function (table) {
        var lockText = table.allowed ? '' : (' | 需 ' + (table.requiredTierLabel || 'VIP'));
        return '<option value="' + escapeBluffHtml(table.id) + '">' +
            escapeBluffHtml(table.label + ' | 底注 ' + formatDisplayNumber(table.ante, 0) + lockText) +
            '</option>';
    }).join('');
    select.value = selectedTableId || 'public';
}

function renderBluffSeats(table) {
    var seatGrid = document.getElementById('bluff-seat-grid');
    if (!seatGrid) return;
    seatGrid.innerHTML = (table.players || []).map(function (player) {
        var cls = 'seat-card ' + (player.type === 'bot' ? 'bot' : 'human');
        if (player.winner) cls += ' winner';
        if (player.loser) cls += ' loser';
        return '<div class="' + cls + '">' +
            '<div class="seat-name">' + escapeBluffHtml(player.displayName) + '</div>' +
            '<div class="seat-meta">Seat ' + escapeBluffHtml(player.seat) + ' | ' + escapeBluffHtml(player.type === 'bot' ? 'Bot' : '玩家') + '</div>' +
            '<div class="dice-row">' + (player.dice || []).map(function (dice) {
                return '<span class="dice-chip">' + escapeBluffHtml(dice) + '</span>';
            }).join('') + '</div>' +
            '<div class="seat-meta">骰數 ' + escapeBluffHtml(player.diceCount || 0) + '</div>' +
            '</div>';
    }).join('');
}

function renderBluffLog(items) {
    var logEl = document.getElementById('bluff-log');
    if (!logEl) return;
    if (!items || !items.length) {
        logEl.innerHTML = '<div class="table-log-item">目前沒有紀錄</div>';
        return;
    }
    logEl.innerHTML = items.map(function (item) {
        return '<div class="table-log-item">' + escapeBluffHtml(item) + '</div>';
    }).join('');
}

function applyBluffButtons(table) {
    var joinBtn = document.getElementById('bluff-join-btn');
    var leaveBtn = document.getElementById('bluff-leave-btn');
    var startBtn = document.getElementById('bluff-start-btn');
    var bidBtn = document.getElementById('bluff-bid-btn');
    var challengeBtn = document.getElementById('bluff-challenge-btn');

    if (joinBtn) joinBtn.disabled = !table.canJoin;
    if (leaveBtn) leaveBtn.disabled = !table.canLeave;
    if (startBtn) startBtn.disabled = !table.canStart;
    if (bidBtn) bidBtn.disabled = !table.canBid;
    if (challengeBtn) challengeBtn.disabled = !table.canChallenge;
}

function renderBluffState(data) {
    bluffState = data || null;
    if (!data || !data.table) return;
    renderBluffTableOptions(data.tables || [], data.selectedTableId);

    var table = data.table;
    var titleEl = document.getElementById('bluff-table-title');
    var statusEl = document.getElementById('bluff-status-note');
    var bidEl = document.getElementById('bluff-bid-pill');
    var resultEl = document.getElementById('bluff-result');
    var turnEl = document.getElementById('bluff-turn-note');

    if (titleEl) titleEl.innerText = table.tableLabel + ' | 底注 ' + formatDisplayNumber(table.ante || 0, 0);
    if (statusEl) statusEl.innerText = table.status === 'active' ? '回合進行中' : (table.status === 'completed' ? '本局已結束' : '等待開局');
    if (bidEl) {
        bidEl.innerText = table.currentBid
            ? ('目前喊骰：' + table.currentBid.quantity + ' 顆 ' + table.currentBid.face)
            : '尚未喊骰';
    }
    if (resultEl) {
        resultEl.innerText = table.resultSummary || (table.revealedCount ? ('揭骰：' + table.revealedCount + ' 顆 ' + table.revealedFace) : '');
    }
    if (turnEl) {
        turnEl.innerText = table.isMyTurn ? '輪到你行動' : (table.currentTurnId ? '等待其他座位行動' : '尚未開始');
    }

    renderBluffSeats(table);
    renderBluffLog(table.log || []);
    applyBluffButtons(table);
}

function syncBluffStatus() {
    if (bluffBusy) return Promise.resolve();
    bluffBusy = true;
    return bluffApi('status')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '同步吹牛骰子狀態失敗');
            renderBluffState(data);
        })
        .catch(function (error) {
            console.error(error);
        })
        .finally(function () {
            bluffBusy = false;
        });
}

function sendBluffRequest(action, payload) {
    return bluffApi(action, payload)
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '吹牛骰子操作失敗');
            renderBluffState(data);
            refreshBalance();
        })
        .catch(function (error) {
            showUserToast(error.message || '吹牛骰子操作失敗', true);
        });
}

function joinBluffTable() {
    sendBluffRequest('join_table');
}

function leaveBluffTable() {
    sendBluffRequest('leave_table');
}

function startBluffRound() {
    sendBluffRequest('start_round');
}

function submitBluffBid() {
    var quantityEl = document.getElementById('bluff-bid-quantity');
    var faceEl = document.getElementById('bluff-bid-face');
    sendBluffRequest('bid', {
        quantity: quantityEl ? Number(quantityEl.value || 1) : 1,
        face: faceEl ? Number(faceEl.value || 2) : 2
    });
}

function challengeBluffBid() {
    sendBluffRequest('challenge');
}

function initBluffPage() {
    var select = document.getElementById('bluff-table-select');
    if (select) {
        select.addEventListener('change', function () {
            syncBluffStatus();
        });
    }
    syncBluffStatus();
    if (bluffPollTimer) clearInterval(bluffPollTimer);
    bluffPollTimer = setInterval(syncBluffStatus, 3000);
}
