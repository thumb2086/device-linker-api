/* === 輪盤遊戲邏輯 === */

var ROULETTE_ROUND_MS = 30000;
var roulettePreviewToken = 0;
var rouletteBetting = false;
var lastRouletteRoundId = null;

var BET_OPTIONS = {
    color: [
        { value: 'red', label: '紅色' },
        { value: 'black', label: '黑色' }
    ],
    parity: [
        { value: 'odd', label: '單數' },
        { value: 'even', label: '雙數' }
    ],
    range: [
        { value: 'low', label: '小 1-18' },
        { value: 'high', label: '大 19-36' }
    ],
    dozen: [
        { value: '1', label: '1-12' },
        { value: '2', label: '13-24' },
        { value: '3', label: '25-36' }
    ]
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

function getColor(num) {
    if (num === 0) return 'green';
    var reds = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 12: 1, 14: 1, 16: 1, 18: 1, 19: 1, 21: 1, 23: 1, 25: 1, 27: 1, 30: 1, 32: 1, 34: 1, 36: 1 };
    return reds[num] ? 'red' : 'black';
}

function getRouletteRoundResult(roundId) {
    return hash32('roulette:' + roundId) % 37;
}

function runRoulettePreviewRound(roundId) {
    if (rouletteBetting) return;

    var token = ++roulettePreviewToken;
    var status = document.getElementById('status-msg');
    var wheel = document.getElementById('wheel-display');
    var lastResult = document.getElementById('last-result');

    var winningNumber = getRouletteRoundResult(roundId);
    var winningColor = getColor(winningNumber);

    if (status) {
        status.innerText = '🎬 第 ' + roundId + ' 局自動開獎中...';
        status.style.color = '#ffd36a';
    }

    if (wheel) {
        wheel.classList.remove('win-red', 'win-black', 'win-green');
        wheel.style.transform = 'rotate(1080deg)';
    }

    setTimeout(function () {
        if (token !== roulettePreviewToken || rouletteBetting) return;

        if (wheel) {
            wheel.style.transform = 'rotate(0deg)';
            wheel.innerText = winningNumber;
            wheel.classList.add('win-' + winningColor);
        }

        if (lastResult) {
            lastResult.innerText = '第 ' + roundId + ' 局自動開獎: ' + winningNumber + '（' + winningColor + '）';
        }

        if (status && !rouletteBetting) {
            status.innerText = '📣 第 ' + roundId + ' 局自動結果已更新';
            status.style.color = '#ffd36a';
        }
    }, 1200);
}

function updateRouletteRoundHint() {
    var hint = document.getElementById('round-hint');

    var now = Date.now();
    var roundId = Math.floor(now / ROULETTE_ROUND_MS);
    var closesAt = (roundId + 1) * ROULETTE_ROUND_MS;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

    if (hint) {
        hint.innerText = '固定開獎：第 ' + roundId + ' 局，' + secLeft + ' 秒後切下一局';
    }

    if (lastRouletteRoundId !== roundId) {
        lastRouletteRoundId = roundId;
        runRoulettePreviewRound(roundId);
    }
}

function onBetTypeChange() {
    var betType = document.getElementById('bet-type').value;
    var betValueSelect = document.getElementById('bet-value');
    betValueSelect.innerHTML = '';

    if (betType === 'number') {
        for (var n = 0; n <= 36; n++) {
            var numOpt = document.createElement('option');
            numOpt.value = String(n);
            numOpt.textContent = '號碼 ' + n;
            betValueSelect.appendChild(numOpt);
        }
        return;
    }

    var options = BET_OPTIONS[betType] || [];
    options.forEach(function (item) {
        var option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        betValueSelect.appendChild(option);
    });
}

function spinRoulette() {
    if (rouletteBetting) return;

    var amount = parseFloat(document.getElementById('bet-amount').value);
    var betType = document.getElementById('bet-type').value;
    var betValue = document.getElementById('bet-value').value;
    var status = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var wheel = document.getElementById('wheel-display');
    var spinBtn = document.getElementById('spin-btn');
    var hBal = document.getElementById('header-balance');

    if (isNaN(amount) || amount <= 0) {
        status.innerText = '❌ 請輸入有效的金額';
        return;
    }

    rouletteBetting = true;
    roulettePreviewToken += 1;

    spinBtn.disabled = true;
    status.innerHTML = '<span class="loader"></span> 交易確認中...';
    status.style.color = '#ffcc00';
    txLog.innerHTML = '';

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    wheel.classList.remove('win-red', 'win-black', 'win-green');
    wheel.style.transform = 'rotate(1080deg)';

    fetch('/api/roulette', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            sessionId: user.sessionId,
            betType: betType,
            betValue: betValue
        })
    })
    .then(function (res) { return res.json(); })
    .then(function (result) {
        if (result.error) throw new Error(result.error);

        setTimeout(function () {
            wheel.style.transform = 'rotate(0deg)';
            wheel.innerText = result.winningNumber;
            wheel.classList.add('win-' + result.winningColor);

            document.getElementById('last-result').innerText =
                '第 ' + result.roundId + ' 局開獎: ' + result.winningNumber + '（' + result.winningColor + '）';

            updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

            if (result.isWin) {
                var profitAmount = amount * result.multiplier;
                var newBalance = tempBalance + amount + profitAmount;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                status.innerText = '🏆 第 ' + result.roundId + ' 局中獎！獲利 ' + profitAmount.toFixed(2) + ' ZXC';
                status.style.color = '#00ff88';
            } else {
                status.innerText = '💀 第 ' + result.roundId + ' 局未中獎';
                status.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            rouletteBetting = false;
            spinBtn.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 1200);
    })
    .catch(function (e) {
        status.innerText = '❌ 錯誤: ' + e.message;
        status.style.color = 'red';
        rouletteBetting = false;
        spinBtn.disabled = false;

        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}

window.addEventListener('load', function () {
    updateRouletteRoundHint();
    setInterval(updateRouletteRoundHint, 1000);
});
