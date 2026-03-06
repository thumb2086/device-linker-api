var SICBO_ROUND_MS = 25000;
var SICBO_LOCK_MS = 3000;
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

function syncSicboClock(force) {
    var now = Date.now();
    if (isClockSyncing) return;
    if (!force && (now - lastClockSyncAt) < 10000) return;
    isClockSyncing = true;
    fetch('/api/auth?clock=1&game=sicbo&t=' + now)
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

function getCurrentSicboState() {
    var now = getServerNowMs();
    var roundId = Math.floor(now / SICBO_ROUND_MS);
    var closesAt = (roundId + 1) * SICBO_ROUND_MS;
    var bettingClosesAt = closesAt - SICBO_LOCK_MS;
    var isBettingOpen = now < bettingClosesAt;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));
    return { roundId: roundId, closesAt: closesAt, bettingClosesAt: bettingClosesAt, isBettingOpen: isBettingOpen, secLeft: secLeft };
}

function updateRoundHint() {
    var hint = document.getElementById('round-hint');
    if (!hint) return;
    var state = getCurrentSicboState();
    hint.innerText = state.isBettingOpen
        ? ('下注中，剩 ' + state.secLeft + ' 秒')
        : '開獎中，請稍候...';
}

function onBetTypeChange() {
    var type = document.getElementById('bet-type').value;
    var select = document.getElementById('bet-value');
    if (!select) return;
    var options = [];
    if (type === 'total') {
        options = [4,5,6,7,8,9,10,11,12,13,14,15,16,17].map(function (v) { return { value: v, label: '點數 ' + v }; });
    } else if (type === 'single' || type === 'double_specific' || type === 'triple_specific') {
        options = [1,2,3,4,5,6].map(function (v) { return { value: v, label: '點數 ' + v }; });
    }
    if (options.length === 0) {
        select.innerHTML = '<option value="">無</option>';
        select.disabled = true;
        return;
    }
    select.disabled = false;
    select.innerHTML = options.map(function (opt) {
        return '<option value="' + opt.value + '">' + opt.label + '</option>';
    }).join('');
}

function setDice(dice) {
    var d1 = document.getElementById('die-1');
    var d2 = document.getElementById('die-2');
    var d3 = document.getElementById('die-3');
    if (d1) d1.innerText = dice[0] || '?';
    if (d2) d2.innerText = dice[1] || '?';
    if (d3) d3.innerText = dice[2] || '?';
}

function placeSicboBet() {
    var amount = Number(document.getElementById('bet-amount').value || 0);
    var betType = document.getElementById('bet-type').value;
    var betValue = document.getElementById('bet-value').value;
    var status = document.getElementById('status-msg');
    if (!amount || amount <= 0) {
        if (status) status.innerText = '請輸入有效押注金額';
        return;
    }

    if (betValue === '' || betValue === null) betValue = undefined;

    if (status) status.innerText = '下注中...';
    fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game: 'sicbo',
            address: user.address,
            amount: amount,
            sessionId: user.sessionId,
            betType: betType,
            betValue: betValue
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || data.error) throw new Error(data.error || '下注失敗');
            setDice(data.dice || []);
            var resultText = data.multiplier > 0 ? ('中獎 x' + data.multiplier) : '未中';
            if (status) status.innerText = '結果: ' + resultText + '，點數 ' + data.total;
            updateUI({ totalBet: data.totalBet, vipLevel: data.vipLevel, maxBet: data.maxBet });
        })
        .catch(function (err) {
            if (status) status.innerText = '錯誤: ' + err.message;
        });
}

setInterval(function () {
    syncSicboClock(false);
    updateRoundHint();
}, 1000);

syncSicboClock(true);
updateRoundHint();
