var pokerPollTimer = null;
var pokerBusy = false;
var pokerState = null;

function pokerApi(action, payload) {
    return fetch('/api/game?game=poker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
            game: 'poker',
            action: action,
            sessionId: user.sessionId,
            tableId: getSelectedPokerTableId()
        }, payload || {}))
    }).then(function (res) { return res.json(); });
}

function escapePokerHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSelectedPokerTableId() {
    var select = document.getElementById('poker-table-select');
    return select ? String(select.value || 'public') : 'public';
}

function renderPokerTableOptions(tables, selectedTableId) {
    var select = document.getElementById('poker-table-select');
    if (!select) return;
    select.innerHTML = (tables || []).map(function (table) {
        var lockText = table.allowed ? '' : (' | 需 ' + (table.requiredTierLabel || 'VIP'));
        return '<option value="' + escapePokerHtml(table.id) + '">' +
            escapePokerHtml(table.label + ' | 底注 ' + formatDisplayNumber(table.ante, 0) + lockText) +
            '</option>';
    }).join('');
    select.value = selectedTableId || 'public';
}

function renderPokerSeats(table) {
    var seatGrid = document.getElementById('poker-seat-grid');
    if (!seatGrid) return;
    seatGrid.innerHTML = (table.players || []).map(function (player) {
        var cls = 'seat-card ' + (player.type === 'bot' ? 'bot' : 'human');
        if (player.winner) cls += ' winner';
        if (player.folded && !player.winner) cls += ' loser';
        return '<div class="' + cls + '">' +
            '<div class="seat-name">' + escapePokerHtml(player.displayName) + '</div>' +
            '<div class="seat-meta">Seat ' + escapePokerHtml(player.seat) + ' | ' + escapePokerHtml(player.type === 'bot' ? 'Bot' : '玩家') + '</div>' +
            '<div class="seat-meta">投入 ' + escapePokerHtml(formatDisplayNumber(player.committed || 0, 0)) + '</div>' +
            '<div class="seat-cards">' + (player.cards || []).map(function (card) {
                return '<span class="card-chip">' + escapePokerHtml(card) + '</span>';
            }).join('') + '</div>' +
            '</div>';
    }).join('');
}

function renderPokerLog(items) {
    var logEl = document.getElementById('poker-log');
    if (!logEl) return;
    if (!items || !items.length) {
        logEl.innerHTML = '<div class="table-log-item">目前沒有紀錄</div>';
        return;
    }
    logEl.innerHTML = items.map(function (item) {
        return '<div class="table-log-item">' + escapePokerHtml(item) + '</div>';
    }).join('');
}

function applyPokerButtons(table) {
    var joinBtn = document.getElementById('poker-join-btn');
    var leaveBtn = document.getElementById('poker-leave-btn');
    var startBtn = document.getElementById('poker-start-btn');
    var foldBtn = document.getElementById('poker-fold-btn');
    var checkBtn = document.getElementById('poker-check-btn');
    var callBtn = document.getElementById('poker-call-btn');
    var raiseBtn = document.getElementById('poker-raise-btn');

    if (joinBtn) joinBtn.disabled = !table.canJoin;
    if (leaveBtn) leaveBtn.disabled = !table.canLeave;
    if (startBtn) startBtn.disabled = !table.canStart;
    if (foldBtn) foldBtn.disabled = !table.canFold;
    if (checkBtn) checkBtn.disabled = !table.canCheck;
    if (callBtn) callBtn.disabled = !table.canCall;
    if (raiseBtn) raiseBtn.disabled = !table.canRaise;
}

function renderPokerState(data) {
    pokerState = data || null;
    if (!data || !data.table) return;
    renderPokerTableOptions(data.tables || [], data.selectedTableId);

    var table = data.table;
    var communityEl = document.getElementById('poker-community-cards');
    var titleEl = document.getElementById('poker-table-title');
    var statusEl = document.getElementById('poker-status-note');
    var resultEl = document.getElementById('poker-result');
    var potEl = document.getElementById('poker-pot-pill');
    var turnEl = document.getElementById('poker-turn-note');

    if (titleEl) titleEl.innerText = table.tableLabel + ' | 底注 ' + formatDisplayNumber(table.ante || 0, 0);
    if (statusEl) statusEl.innerText = table.status === 'active' ? '牌局進行中' : (table.status === 'completed' ? '本局已結束' : '等待開局');
    if (potEl) potEl.innerText = '底池 ' + formatDisplayNumber(table.pot || 0, 0);
    if (resultEl) resultEl.innerText = table.resultSummary || '';
    if (turnEl) {
        turnEl.innerText = table.isMyTurn ? '輪到你行動' : (table.currentTurnId ? '等待其他座位行動' : '尚未開始');
    }
    if (communityEl) {
        communityEl.innerHTML = (table.communityCards || []).map(function (card) {
            return '<span class="card-chip">' + escapePokerHtml(card) + '</span>';
        }).join('');
    }

    renderPokerSeats(table);
    renderPokerLog(table.log || []);
    applyPokerButtons(table);
}

function syncPokerStatus() {
    if (pokerBusy) return Promise.resolve();
    pokerBusy = true;
    return pokerApi('status')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '同步德州撲克狀態失敗');
            renderPokerState(data);
        })
        .catch(function (error) {
            console.error(error);
        })
        .finally(function () {
            pokerBusy = false;
        });
}

function sendPokerRequest(action, payload) {
    return pokerApi(action, payload)
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '德州撲克操作失敗');
            renderPokerState(data);
            refreshBalance();
        })
        .catch(function (error) {
            showUserToast(error.message || '德州撲克操作失敗', true);
        });
}

function joinPokerTable() {
    sendPokerRequest('join_table');
}

function leavePokerTable() {
    sendPokerRequest('leave_table');
}

function startPokerHand() {
    sendPokerRequest('start_hand');
}

function sendPokerMove(move) {
    sendPokerRequest('player_action', { move: move });
}

function initPokerPage() {
    var select = document.getElementById('poker-table-select');
    if (select) {
        select.addEventListener('change', function () {
            syncPokerStatus();
        });
    }
    syncPokerStatus();
    if (pokerPollTimer) clearInterval(pokerPollTimer);
    pokerPollTimer = setInterval(syncPokerStatus, 3000);
}
