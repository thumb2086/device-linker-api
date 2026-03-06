var BINGO_ROUND_MS = 60000;
var BINGO_LOCK_MS = 5000;
var serverTimeOffsetMs = 0;
var serverTimeSynced = false;
var isClockSyncing = false;
var lastClockSyncAt = 0;

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
    fetch('/api/auth?clock=1&game=bingo&t=' + now)
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
    return { roundId: roundId, closesAt: closesAt, bettingClosesAt: bettingClosesAt, isBettingOpen: isBettingOpen, secLeft: secLeft };
}

function updateRoundHint() {
    var hint = document.getElementById('round-hint');
    if (!hint) return;
    var state = getCurrentBingoState();
    hint.innerText = state.isBettingOpen
        ? ('下注中，剩 ' + state.secLeft + ' 秒')
        : '開獎中，請稍候...';
}

function parseNumbers(input) {
    return String(input || '')
        .split(/[,\\s]+/)
        .map(function (v) { return Number(v); })
        .filter(function (n) { return Number.isInteger(n); });
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
    document.getElementById('number-input').value = pick.join(',');
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

function placeBingoBet() {
    var amount = Number(document.getElementById('bet-amount').value || 0);
    var numbers = parseNumbers(document.getElementById('number-input').value);
    var status = document.getElementById('status-msg');
    if (!amount || amount <= 0) {
        if (status) status.innerText = '請輸入有效押注金額';
        return;
    }
    if (numbers.length !== 8) {
        if (status) status.innerText = '請輸入 8 個號碼 (1-75)';
        return;
    }

    if (status) status.innerText = '下注中...';
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
            if (!data || data.error) throw new Error(data.error || '下注失敗');
            renderDrawn(data.drawn || []);
            var resultText = data.multiplier > 0 ? ('中獎 x' + data.multiplier) : '未中';
            if (status) status.innerText = '命中 ' + (data.hits ? data.hits.length : 0) + ' 個，' + resultText;
            updateUI({ totalBet: data.totalBet, vipLevel: data.vipLevel, maxBet: data.maxBet });
        })
        .catch(function (err) {
            if (status) status.innerText = '錯誤: ' + err.message;
        });
}

function initBingoPage() {
    randomPick();
    setInterval(function () {
        syncBingoClock(false);
        updateRoundHint();
    }, 1000);
    syncBingoClock(true);
    updateRoundHint();
}
