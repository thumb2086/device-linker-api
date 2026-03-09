var BINGO_ROUND_MS = 60000;
var BINGO_LOCK_MS = 5000;
var serverTimeOffsetMs = 0;
var serverTimeSynced = false;
var isClockSyncing = false;
var lastClockSyncAt = 0;
var pendingBingoBets = [];
var isBingoDrawing = false;
var selectedNumbers = [];

function hash32(input) {
    var str = String(input);
    var hash = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function getServerNowMs() {
    return Date.now() + (serverTimeSynced ? serverTimeOffsetMs : 0);
}

function updateServerTime(serverNowTs) {
    var serverNow = Number(serverNowTs);
    if (!Number.isFinite(serverNow)) return;
    var sample = serverNow - Date.now();
    if (!serverTimeSynced) {
        serverTimeOffsetMs = sample;
        serverTimeSynced = true;
        return;
    }
    serverTimeOffsetMs = (serverTimeOffsetMs * 0.8) + (sample * 0.2);
}

function syncBingoClock(force) {
    var now = Date.now();
    if (isClockSyncing) return;
    if (!force && (now - lastClockSyncAt) < 10000) return;
    isClockSyncing = true;
    fetch('/api/user?clock=1&game=bingo&t=' + now)
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) return;
            updateServerTime(data.serverNowTs);
        })
        .catch(function () {})
        .finally(function () {
            isClockSyncing = false;
            lastClockSyncAt = Date.now();
        });
}

function getCurrentBingoState() {
    var now = getServerNowMs();
    var roundId = Math.floor(now / BINGO_ROUND_MS);
    var closesAt = (roundId + 1) * BINGO_ROUND_MS;
    var bettingClosesAt = closesAt - BINGO_LOCK_MS;
    var isBettingOpen = now < bettingClosesAt;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));
    return { now: now, roundId: roundId, closesAt: closesAt, bettingClosesAt: bettingClosesAt, isBettingOpen: isBettingOpen, secLeft: secLeft };
}

function updateRoundHint() {
    var hint = document.getElementById('round-hint');
    if (!hint) return;
    var state = getCurrentBingoState();
    hint.innerText = state.isBettingOpen
        ? ('固定開獎：' + state.secLeft + ' 秒後截止下注')
        : '封盤中：等待開獎';
    maybeDrawBingo();
}

function parseNumbers(input) {
    return String(input || '')
        .split(/[,\s]+/)
        .map(function (v) { return Number(v); })
        .filter(function (n) { return Number.isInteger(n); });
}

function renderPickSummary() {
    var summary = document.getElementById('pick-summary');
    if (!summary) return;
    if (selectedNumbers.length === 0) {
        summary.innerText = '尚未選號';
        return;
    }
    summary.innerText = selectedNumbers.join(', ');
}

function renderNumberPad() {
    var pad = document.getElementById('number-pad');
    if (!pad) return;
    var html = '';
    for (var i = 1; i <= 75; i += 1) {
        var selected = selectedNumbers.indexOf(i) >= 0;
        html += '<button class="number-btn' + (selected ? ' is-selected' : '') + '" onclick="toggleNumber(' + i + ')">' + i + '</button>';
    }
    pad.innerHTML = html;
    renderPickSummary();
}

function setSelectedNumbers(numbers) {
    selectedNumbers = numbers.slice().sort(function (a, b) { return a - b; });
    renderNumberPad();
}

function toggleNumber(number) {
    var index = selectedNumbers.indexOf(number);
    if (index >= 0) {
        selectedNumbers.splice(index, 1);
        renderNumberPad();
        return;
    }
    if (selectedNumbers.length >= 8) return;
    selectedNumbers.push(number);
    selectedNumbers.sort(function (a, b) { return a - b; });
    renderNumberPad();
}

function randomPick() {
    var pool = [];
    for (var i = 1; i <= 75; i += 1) pool.push(i);
    for (var j = pool.length - 1; j > 0; j -= 1) {
        var k = Math.floor(Math.random() * (j + 1));
        var tmp = pool[j];
        pool[j] = pool[k];
        pool[k] = tmp;
    }
    var pick = pool.slice(0, 8).sort(function (a, b) { return a - b; });
    setSelectedNumbers(pick);
}

function clearPick() {
    selectedNumbers = [];
    renderNumberPad();
}

function drawNumbers(roundId) {
    var pool = [];
    for (var i = 1; i <= 75; i += 1) pool.push(i);
    for (var j = pool.length - 1; j > 0; j -= 1) {
        var k = hash32('bingo:' + roundId + ':' + j) % (j + 1);
        var tmp = pool[j];
        pool[j] = pool[k];
        pool[k] = tmp;
    }
    return pool.slice(0, 20).sort(function (a, b) { return a - b; });
}

function payoutForHits(hitCount) {
    if (hitCount === 8) return 50;
    if (hitCount === 7) return 10;
    if (hitCount === 6) return 3;
    if (hitCount === 5) return 1.5;
    if (hitCount === 4) return 1;
    return 0;
}

function renderDrawn(numbers) {
    var grid = document.getElementById('drawn-grid');
    if (!grid) return;
    if (!numbers || numbers.length === 0) {
        grid.innerHTML = '';
        return;
    }
    grid.innerHTML = numbers.map(function (n) {
        return '<span class="bingo-ball">' + n + '</span>';
    }).join('');
}

function updatePendingBingoBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;
    if (pendingBingoBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }
    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">待開獎下注：<br/>';
    pendingBingoBets.forEach(function (b) {
        html += b.numbers.join(',') + ' (' + b.amount + ' 子熙幣)<br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function findDueBingoRoundId() {
    var now = getServerNowMs();
    var minRoundId = null;
    pendingBingoBets.forEach(function (b) {
        if (!Number.isFinite(b.closesAt) || b.closesAt > now) return;
        if (minRoundId === null || b.roundId < minRoundId) minRoundId = b.roundId;
    });
    return minRoundId;
}

function maybeDrawBingo() {
    if (isBingoDrawing) return;
    var roundId = findDueBingoRoundId();
    if (roundId === null) return;
    startBingoDraw(roundId);
}

function startBingoDraw(roundId) {
    if (isBingoDrawing) return;
    isBingoDrawing = true;
    var status = document.getElementById('status-msg');
    if (status) {
        status.innerText = '開獎中...';
        status.style.color = '#ffd36a';
    }

    var drawn = drawNumbers(roundId);
    setTimeout(function () {
        renderDrawn(drawn);
        var drawnSet = {};
        drawn.forEach(function (n) { drawnSet[n] = true; });

        var roundBets = pendingBingoBets.filter(function (b) { return b.roundId === roundId; });
        pendingBingoBets = pendingBingoBets.filter(function (b) { return b.roundId !== roundId; });
        updatePendingBingoBetsUI();

        var totalPayout = 0;
        roundBets.forEach(function (b) {
            var hits = b.numbers.filter(function (n) { return drawnSet[n]; }).length;
            var mult = payoutForHits(hits);
            if (mult > 0) totalPayout += b.amount * (mult + 1);
        });

        if (status) {
            if (totalPayout > 0) {
                status.innerText = '開獎完成，派彩 ' + totalPayout.toFixed(2) + ' 子熙幣';
                status.style.color = '#00ff88';
            } else {
                status.innerText = '開獎完成，未中獎';
                status.style.color = '#ff6666';
            }
        }
        refreshBalance();
        isBingoDrawing = false;
        maybeDrawBingo();
    }, 1400);
}

function placeBingoBet() {
    var amount = Number(document.getElementById('bet-amount').value || 0);
    var numbers = selectedNumbers.slice();
    var status = document.getElementById('status-msg');
    if (!amount || amount <= 0) {
        if (status) status.innerText = '請輸入有效押注金額';
        return;
    }
    if (numbers.length !== 8) {
        if (status) status.innerText = '請輸入 8 個號碼 (1-75)';
        return;
    }

    var state = getCurrentBingoState();
    if (state.now >= state.bettingClosesAt) {
        if (status) status.innerText = '已封盤，請等下一輪';
        return;
    }

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var headerBalance = document.getElementById('header-balance');
    if (currentBalance < amount) {
        if (status) {
            status.innerText = '餘額不足';
            status.style.color = '#ff6666';
        }
        return;
    }

    if (status) {
        status.innerText = '下注中...';
        status.style.color = '#ffd36a';
    }

    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (headerBalance) headerBalance.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game: 'bingo',
            address: user.address,
            amount: amount,
            sessionId: user.sessionId,
            numbers: numbers
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.serverNowTs) updateServerTime(data.serverNowTs);
            if (!data || data.error) throw new Error(data.error || '下注失敗');
            pendingBingoBets.push({
                amount: amount,
                numbers: data.userNumbers || numbers.slice().sort(function (a, b) { return a - b; }),
                roundId: data.roundId,
                closesAt: data.closesAt
            });
            updatePendingBingoBetsUI();
            if (status) {
                status.innerText = '下注成功，等待開獎';
                status.style.color = '#00ff88';
            }
            updateUI({ totalBet: data.totalBet, vipLevel: data.vipLevel, maxBet: data.maxBet });
        })
        .catch(function (err) {
            document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
            if (headerBalance) headerBalance.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
            if (status) {
                status.innerText = '錯誤: ' + err.message;
                status.style.color = '#ff6666';
            }
        });
}

function initBingoPage() {
    renderNumberPad();
    randomPick();
    setInterval(function () {
        syncBingoClock(false);
        updateRoundHint();
    }, 1000);
    syncBingoClock(true);
    updateRoundHint();
}
