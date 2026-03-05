/* === 猜硬幣遊戲邏輯 === */

var COINFLIP_ROUND_MS = 20000;
var COINFLIP_LOCK_MS = 3000;
var coinflipPreviewToken = 0;
var isCoinflipDrawing = false;
var isCoinflipSubmitting = false;
var lastCoinflipRoundId = null;

var pendingCoinflipBets = []; // [{amount, choice, roundId}]

function calcDisplayBalance(realBalance) {
    if (pendingCoinflipBets.length > 0) {
        var currentUI = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
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

function startCoinflipDraw(roundId) {
    if (isCoinflipDrawing) {
        setTimeout(function() { startCoinflipDraw(roundId); }, 2000);
        return;
    }
    isCoinflipDrawing = true;

    var token = ++coinflipPreviewToken;
    var status = document.getElementById('status-msg');
    var side = getCoinflipRoundResult(roundId);

    if (status) {
        status.innerText = '🎬 第 ' + roundId + ' 局開獎中...';
        status.style.color = '#ffd36a';
    }

    animateCoinToResult(side, 1400);

    setTimeout(function () {
        if (token !== coinflipPreviewToken) return;

        setCoinFace(side);

        var roundBets = pendingCoinflipBets.filter(function(b) { return b.roundId === roundId; });
        pendingCoinflipBets = pendingCoinflipBets.filter(function(b) { return b.roundId !== roundId; });
        updatePendingCoinflipBetsUI();

        if (roundBets.length > 0) {
            var totalWon = 0;
            roundBets.forEach(function(b) {
                if (b.choice === side) {
                    totalWon += b.amount * 1.8;
                }
            });

            if (totalWon > 0) {
                status.innerText = '🏆 第 ' + roundId + ' 局結算：贏得 ' + totalWon.toFixed(2) + ' ZXC！';
                status.style.color = '#00ff88';
            } else {
                status.innerText = '💀 第 ' + roundId + ' 局結算：未中獎';
                status.style.color = '#ff4444';
            }
            refreshBalance();
        } else {
            if (status) {
                status.innerText = '📣 第 ' + roundId + ' 局結果：' + (side === 'heads' ? '正面' : '反面');
                status.style.color = '#ffd36a';
            }
        }
        isCoinflipDrawing = false;
    }, 1450);
}

function updateCoinflipRoundHint() {
    var hint = document.getElementById('round-hint');
    var btn1 = document.getElementById('play-btn');
    var btn2 = document.getElementById('play-btn-2');

    var now = Date.now();
    var roundId = Math.floor(now / COINFLIP_ROUND_MS);
    var closesAt = (roundId + 1) * COINFLIP_ROUND_MS;
    var bettingClosesAt = closesAt - COINFLIP_LOCK_MS;
    var isBettingOpen = now < bettingClosesAt;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

    if (hint) {
        if (isBettingOpen) {
            hint.innerText = '固定開獎：第 ' + roundId + ' 局，' + secLeft + ' 秒後截止下注';
        } else {
            hint.innerText = '第 ' + roundId + ' 局截止下注，即將開跑（' + secLeft + ' 秒後下一局）';
        }
    }

    if (btn1) btn1.disabled = !isBettingOpen || isCoinflipSubmitting;
    if (btn2) btn2.disabled = !isBettingOpen || isCoinflipSubmitting;

    if (lastCoinflipRoundId !== null && lastCoinflipRoundId !== roundId) {
        var drawRoundId = lastCoinflipRoundId;
        lastCoinflipRoundId = roundId;
        startCoinflipDraw(drawRoundId);
    } else if (lastCoinflipRoundId === null) {
        lastCoinflipRoundId = roundId;
    }
}

function updatePendingCoinflipBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;
    if (pendingCoinflipBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }
    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">目前待開獎下注：<br/>';
    pendingCoinflipBets.forEach(function(b) {
        html += '第 ' + b.roundId + ' 局: ' + (b.choice === 'heads' ? '正面' : '反面') + ' (' + b.amount + ' ZXC)<br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function play(choice) {
    if (isCoinflipSubmitting) return;

    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var status = document.getElementById('status-msg');
    var btn1 = document.getElementById('play-btn');
    var btn2 = document.getElementById('play-btn-2');

    if (isNaN(amount) || amount <= 0) {
        status.innerText = '❌ 請輸入有效的金額';
        return;
    }

    var now = Date.now();
    var roundId = Math.floor(now / COINFLIP_ROUND_MS);
    var closesAt = (roundId + 1) * COINFLIP_ROUND_MS;
    if (now >= closesAt - COINFLIP_LOCK_MS) {
        status.innerText = '⏳ 本局已停止下注，請等下一局';
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
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.error) throw new Error(result.error);

        status.innerText = '✅ 下注成功！等待第 ' + result.roundId + ' 局開獎';
        status.style.color = '#00ff88';

        pendingCoinflipBets.push({
            amount: amount,
            choice: choice,
            roundId: result.roundId
        });
        updatePendingCoinflipBetsUI();

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });
    })
    .catch(function(e) {
        status.innerText = '❌ 錯誤: ' + e.message;
        status.style.color = 'red';
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    })
    .finally(function() {
        isCoinflipSubmitting = false;
        btn1.disabled = false;
        btn2.disabled = false;
    });
}

window.addEventListener('load', function () {
    updateCoinflipRoundHint();
    setInterval(updateCoinflipRoundHint, 1000);
});
