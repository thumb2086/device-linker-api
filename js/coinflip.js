/* === 猜硬幣遊戲邏輯 === */

var COINFLIP_ROUND_MS = 20000;
var coinflipPreviewToken = 0;
var coinflipBetting = false;
var lastCoinflipRoundId = null;

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

function runCoinflipPreviewRound(roundId) {
    if (coinflipBetting) return;

    var token = ++coinflipPreviewToken;
    var status = document.getElementById('status-msg');
    var side = getCoinflipRoundResult(roundId);

    if (status) {
        status.innerText = '🎬 第 ' + roundId + ' 局自動開獎中...';
        status.style.color = '#ffd36a';
    }

    animateCoinToResult(side, 1400);

    setTimeout(function () {
        if (token !== coinflipPreviewToken || coinflipBetting) return;

        setCoinFace(side);
        if (status) {
            status.innerText = '📣 第 ' + roundId + ' 局自動結果：' + (side === 'heads' ? '正面' : '反面');
            status.style.color = '#ffd36a';
        }
    }, 1450);
}

function updateCoinflipRoundHint() {
    var hint = document.getElementById('round-hint');

    var now = Date.now();
    var roundId = Math.floor(now / COINFLIP_ROUND_MS);
    var closesAt = (roundId + 1) * COINFLIP_ROUND_MS;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

    if (hint) {
        hint.innerText = '固定開獎：第 ' + roundId + ' 局，' + secLeft + ' 秒後切下一局';
    }

    if (lastCoinflipRoundId !== roundId) {
        lastCoinflipRoundId = roundId;
        runCoinflipPreviewRound(roundId);
    }
}

function play(choice) {
    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var status = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var btn1 = document.getElementById('play-btn');
    var btn2 = document.getElementById('play-btn-2');

    if (isNaN(amount) || amount <= 0) {
        status.innerText = '❌ 請輸入有效的金額';
        return;
    }

    coinflipBetting = true;
    coinflipPreviewToken += 1;

    btn1.disabled = true;
    btn2.disabled = true;
    status.innerHTML = '<span class="loader"></span> 交易確認中...';
    status.style.color = '#ffcc00';
    txLog.innerHTML = '';

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

        status.innerHTML = '<span class="loader"></span> 第 ' + result.roundId + ' 局開獎中...';
        status.style.color = '#ffcc00';

        animateCoinToResult(result.resultSide, 3000);
        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

        setTimeout(function() {
            setCoinFace(result.resultSide);

            if (result.isWin) {
                status.innerText = '🏆 第 ' + result.roundId + ' 局中獎！';
                status.style.color = '#00ff88';
                var winAmount = amount * 1.8;
                var newBalance = tempBalance + winAmount;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
            } else {
                status.innerText = '💀 第 ' + result.roundId + ' 局未中獎';
                status.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            btn1.disabled = false;
            btn2.disabled = false;
            coinflipBetting = false;
            setTimeout(refreshBalance, 10000);
        }, 3000);
    })
    .catch(function(e) {
        status.innerText = '❌ 錯誤: ' + e.message;
        status.style.color = 'red';
        btn1.disabled = false;
        btn2.disabled = false;
        coinflipBetting = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}

window.addEventListener('load', function () {
    updateCoinflipRoundHint();
    setInterval(updateCoinflipRoundHint, 1000);
});
