/* === 猜硬幣遊戲邏輯 === */

var COINFLIP_ROUND_MS = 20000;
var COINFLIP_LOCK_MS = 3000;
var coinflipPreviewToken = 0;
var isCoinflipDrawing = false;
var isCoinflipSubmitting = false;

var serverTimeOffsetMs = 0;
var serverTimeSynced = false;
var isClockSyncing = false;
var lastClockSyncAt = 0;

var pendingCoinflipBets = []; // [{amount, choice, roundId, closesAt}]

function calcDisplayBalance(realBalance) {
    if (pendingCoinflipBets.length > 0) {
        var bal = document.getElementById('balance-val');
        if (!bal) return realBalance;
        var currentUI = parseFloat(bal.innerText.replace(/,/g, ''));
        return currentUI;
    }
    return realBalance;
}

function hash32(input) {
    var str = String(input);
    var hash = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function getCoinflipRoundResult(roundId) {
    return (hash32('coinflip:' + roundId) % 2 === 0) ? 'heads' : 'tails';
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

function syncCoinflipClock(force) {
    var now = Date.now();
    if (isClockSyncing) return;
    if (!force && (now - lastClockSyncAt) < 10000) return;

    isClockSyncing = true;
    fetch('/api/auth?clock=1&game=coinflip&t=' + now)
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

function getCurrentCoinflipState() {
    var now = getServerNowMs();
    var roundId = Math.floor(now / COINFLIP_ROUND_MS);
    var closesAt = (roundId + 1) * COINFLIP_ROUND_MS;
    var bettingClosesAt = closesAt - COINFLIP_LOCK_MS;
    var isBettingOpen = now < bettingClosesAt;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

    return {
        now: now,
        roundId: roundId,
        closesAt: closesAt,
        bettingClosesAt: bettingClosesAt,
        isBettingOpen: isBettingOpen,
        secLeft: secLeft
    };
}

function setCoinFace(side) {
    var coin = document.getElementById('main-coin');
    if (!coin) return;
    coin.style.transition = 'none';
    coin.style.transform = side === 'heads' ? 'rotateY(0deg)' : 'rotateY(180deg)';
}

function animateCoinToResult(side, durationMs) {
    var coin = document.getElementById('main-coin');
    if (!coin) return;

    var baseRotation = 1440;
    var targetRotation = side === 'heads' ? baseRotation : baseRotation + 180;

    coin.style.transition = 'transform ' + durationMs + 'ms cubic-bezier(0.1, 0.8, 0.2, 1)';
    coin.style.transform = 'rotateY(' + targetRotation + 'deg)';
}

function updatePendingCoinflipBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;

    if (pendingCoinflipBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }

    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">待開獎下注：<br/>';
    pendingCoinflipBets.forEach(function (b) {
        html += (b.choice === 'heads' ? '正面' : '反面') + ' (' + b.amount + ' ZXC)<br/>';
    });
    html += '</div>';

    txLog.innerHTML = html;
}

function findDueCoinflipRoundId() {
    var now = getServerNowMs();
    var minRoundId = null;

    pendingCoinflipBets.forEach(function (b) {
        if (!Number.isFinite(b.closesAt) || b.closesAt > now) return;
        if (minRoundId === null || b.roundId < minRoundId) {
            minRoundId = b.roundId;
        }
    });

    return minRoundId;
}

function maybeDrawCoinflip() {
    if (isCoinflipDrawing) return;
    var dueRoundId = findDueCoinflipRoundId();
    if (dueRoundId === null) return;
    startCoinflipDraw(dueRoundId);
}

function startCoinflipDraw(roundId) {
    if (isCoinflipDrawing) return;
    isCoinflipDrawing = true;

    var token = ++coinflipPreviewToken;
    var status = document.getElementById('status-msg');
    var side = getCoinflipRoundResult(roundId);

    if (status) {
        status.innerText = '開獎中...';
        status.style.color = '#ffd36a';
    }

    animateCoinToResult(side, 1400);

    setTimeout(function () {
        if (token !== coinflipPreviewToken) return;

        setCoinFace(side);

        var roundBets = pendingCoinflipBets.filter(function (b) { return b.roundId === roundId; });
        pendingCoinflipBets = pendingCoinflipBets.filter(function (b) { return b.roundId !== roundId; });
        updatePendingCoinflipBetsUI();

        if (roundBets.length > 0) {
            var totalWon = 0;
            roundBets.forEach(function (b) {
                if (b.choice === side) {
                    totalWon += b.amount * 1.8;
                }
            });

            if (totalWon > 0) {
                status.innerText = '中獎，派彩 ' + totalWon.toFixed(2) + ' ZXC';
                status.style.color = '#00ff88';
            } else {
                status.innerText = '未中獎';
                status.style.color = '#ff4444';
            }
            refreshBalance();
        } else if (status) {
            status.innerText = '結果：' + (side === 'heads' ? '正面' : '反面');
            status.style.color = '#ffd36a';
        }

        isCoinflipDrawing = false;
        maybeDrawCoinflip();
    }, 1450);
}

function updateCoinflipRoundHint() {
    var hint = document.getElementById('round-hint');
    var btn1 = document.getElementById('play-btn');
    var btn2 = document.getElementById('play-btn-2');

    var state = getCurrentCoinflipState();

    if (hint) {
        if (state.isBettingOpen) {
            hint.innerText = '固定開獎：' + state.secLeft + ' 秒後截止下注';
        } else {
            hint.innerText = '封盤中：' + state.secLeft + ' 秒後開獎';
        }
    }

    if (btn1) btn1.disabled = !state.isBettingOpen || isCoinflipSubmitting;
    if (btn2) btn2.disabled = !state.isBettingOpen || isCoinflipSubmitting;

    maybeDrawCoinflip();

    if (!serverTimeSynced || (Date.now() - lastClockSyncAt > 15000)) {
        syncCoinflipClock(false);
    }
}

function play(choice) {
    if (isCoinflipSubmitting) return;

    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var status = document.getElementById('status-msg');
    var btn1 = document.getElementById('play-btn');
    var btn2 = document.getElementById('play-btn-2');

    if (isNaN(amount) || amount <= 0) {
        status.innerText = '請輸入有效的金額';
        return;
    }

    var state = getCurrentCoinflipState();
    if (state.now >= state.bettingClosesAt) {
        status.innerText = '已封盤，請等下一輪';
        status.style.color = '#ffd36a';
        return;
    }

    isCoinflipSubmitting = true;
    btn1.disabled = true;
    btn2.disabled = true;
    status.innerHTML = '<span class="loader"></span> 下注交易中...';
    status.style.color = '#ffcc00';

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/coinflip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            choice: choice,
            sessionId: user.sessionId
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (result.serverNowTs) updateServerTime(result.serverNowTs);
            if (result.error) throw new Error(result.error);

            status.innerText = '下注成功，等待開獎';
            status.style.color = '#00ff88';

            pendingCoinflipBets.push({
                amount: amount,
                choice: choice,
                roundId: Number(result.roundId),
                closesAt: Number(result.closesAt)
            });
            updatePendingCoinflipBetsUI();

            updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });
            maybeDrawCoinflip();
        })
        .catch(function (e) {
            status.innerText = '錯誤: ' + e.message;
            status.style.color = 'red';
            document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
            if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
            syncCoinflipClock(true);
        })
        .finally(function () {
            isCoinflipSubmitting = false;
            btn1.disabled = false;
            btn2.disabled = false;
        });
}

window.addEventListener('load', function () {
    syncCoinflipClock(true);
    updateCoinflipRoundHint();
    setInterval(updateCoinflipRoundHint, 1000);
    setInterval(function () { syncCoinflipClock(false); }, 15000);
});
