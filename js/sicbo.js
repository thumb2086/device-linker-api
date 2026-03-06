var SICBO_ROUND_MS = 25000;
var SICBO_LOCK_MS = 3000;
var serverTimeOffsetMs = 0;
var serverTimeSynced = false;
var isClockSyncing = false;
var lastClockSyncAt = 0;
var pendingSicboBets = [];
var isSicboDrawing = false;

var TOTAL_PAYOUTS = {
    4: 50,
    5: 18,
    6: 14,
    7: 12,
    8: 8,
    9: 6,
    10: 6,
    11: 6,
    12: 6,
    13: 8,
    14: 12,
    15: 14,
    16: 18,
    17: 50
};

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
    return { now: now, roundId: roundId, closesAt: closesAt, bettingClosesAt: bettingClosesAt, isBettingOpen: isBettingOpen, secLeft: secLeft };
}

function updateRoundHint() {
    var hint = document.getElementById('round-hint');
    if (!hint) return;
    var state = getCurrentSicboState();
    hint.innerText = state.isBettingOpen
        ? ('固定開獎：' + state.secLeft + ' 秒後截止下注')
        : '封盤中：等待開獎';
    maybeDrawSicbo();
}

function onBetTypeChange() {
    var type = document.getElementById('bet-type').value;
    var select = document.getElementById('bet-value');
    if (!select) return;
    var options = [];
    if (type === 'total') {
        options = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(function (v) { return { value: v, label: '點數 ' + v }; });
    } else if (type === 'single' || type === 'double_specific' || type === 'triple_specific') {
        options = [1, 2, 3, 4, 5, 6].map(function (v) { return { value: v, label: '點數 ' + v }; });
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

function rollDice(roundId) {
    return [
        (hash32('sicbo:' + roundId + ':1') % 6) + 1,
        (hash32('sicbo:' + roundId + ':2') % 6) + 1,
        (hash32('sicbo:' + roundId + ':3') % 6) + 1
    ];
}

function countValue(dice, target) {
    var count = 0;
    dice.forEach(function (d) {
        if (d === target) count += 1;
    });
    return count;
}

function evaluateBet(dice, betType, betValue) {
    var total = dice[0] + dice[1] + dice[2];
    var isTriple = dice[0] === dice[1] && dice[1] === dice[2];
    var target = Number(betValue);

    if (betType === 'big') return (!isTriple && total >= 11 && total <= 17) ? 1 : 0;
    if (betType === 'small') return (!isTriple && total >= 4 && total <= 10) ? 1 : 0;
    if (betType === 'odd') return (!isTriple && total % 2 === 1) ? 1 : 0;
    if (betType === 'even') return (!isTriple && total % 2 === 0) ? 1 : 0;
    if (betType === 'total') return TOTAL_PAYOUTS[target] || 0;
    if (betType === 'triple_any') return isTriple ? 24 : 0;
    if (betType === 'triple_specific') return (isTriple && dice[0] === target) ? 150 : 0;
    if (betType === 'double_specific') return countValue(dice, target) >= 2 ? 11 : 0;
    if (betType === 'single') return countValue(dice, target);
    return 0;
}

function updatePendingSicboBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;
    if (pendingSicboBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }
    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">待開獎下注：<br/>';
    pendingSicboBets.forEach(function (b) {
        html += b.betType + (b.betValue !== undefined ? (' ' + b.betValue) : '') + ' (' + b.amount + ' 子熙幣)<br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function findDueSicboRoundId() {
    var now = getServerNowMs();
    var minRoundId = null;
    pendingSicboBets.forEach(function (b) {
        if (!Number.isFinite(b.closesAt) || b.closesAt > now) return;
        if (minRoundId === null || b.roundId < minRoundId) {
            minRoundId = b.roundId;
        }
    });
    return minRoundId;
}

function maybeDrawSicbo() {
    if (isSicboDrawing) return;
    var roundId = findDueSicboRoundId();
    if (roundId === null) return;
    startSicboDraw(roundId);
}

function startSicboDraw(roundId) {
    if (isSicboDrawing) return;
    isSicboDrawing = true;
    var status = document.getElementById('status-msg');
    if (status) {
        status.innerText = '開獎中...';
        status.style.color = '#ffd36a';
    }
    var dice = rollDice(roundId);
    setTimeout(function () {
        setDice(dice);
        var roundBets = pendingSicboBets.filter(function (b) { return b.roundId === roundId; });
        pendingSicboBets = pendingSicboBets.filter(function (b) { return b.roundId !== roundId; });
        updatePendingSicboBetsUI();

        var totalPayout = 0;
        roundBets.forEach(function (b) {
            var mult = evaluateBet(dice, b.betType, b.betValue);
            if (mult > 0) totalPayout += b.amount + (b.amount * mult);
        });

        if (status) {
            if (totalPayout > 0) {
                status.innerText = '開獎結果 ' + dice.join('-') + '，派彩 ' + totalPayout.toFixed(2) + ' 子熙幣';
                status.style.color = '#00ff88';
            } else {
                status.innerText = '開獎結果 ' + dice.join('-') + '，未中獎';
                status.style.color = '#ff6666';
            }
        }
        refreshBalance();
        isSicboDrawing = false;
        maybeDrawSicbo();
    }, 1200);
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

    var state = getCurrentSicboState();
    if (state.now >= state.bettingClosesAt) {
        if (status) status.innerText = '已封盤，請等下一輪';
        return;
    }

    if (betValue === '' || betValue === null) betValue = undefined;
    if (status) {
        status.innerText = '下注中...';
        status.style.color = '#ffd36a';
    }

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
            if (data.serverNowTs) updateServerTime(data.serverNowTs);
            if (!data || data.error) throw new Error(data.error || '下注失敗');
            pendingSicboBets.push({
                amount: amount,
                betType: betType,
                betValue: betValue,
                roundId: data.roundId,
                closesAt: data.closesAt
            });
            updatePendingSicboBetsUI();
            if (status) {
                status.innerText = '下注成功，等待開獎';
                status.style.color = '#00ff88';
            }
            updateUI({ totalBet: data.totalBet, vipLevel: data.vipLevel, maxBet: data.maxBet });
        })
        .catch(function (err) {
            if (status) {
                status.innerText = '錯誤: ' + err.message;
                status.style.color = '#ff6666';
            }
        });
}

setInterval(function () {
    syncSicboClock(false);
    updateRoundHint();
}, 1000);

syncSicboClock(true);
updateRoundHint();
