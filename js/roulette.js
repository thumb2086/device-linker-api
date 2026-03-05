/* === Roulette === */

var ROULETTE_ROUND_MS = 30000;
var ROULETTE_LOCK_MS = 3000;
var roulettePreviewToken = 0;
var currentRotation = 0;
var isRouletteDrawing = false; // 是否正在開獎動畫中
var isRouletteSubmitting = false; // 是否正在通訊中
var lastRouletteRoundId = null;
var rouletteWheelReady = false;

var pendingRouletteBets = []; // [{amount, betType, betValue, roundId}]
var EUROPEAN_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

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
        { value: 'low', label: '1-18' },
        { value: 'high', label: '19-36' }
    ],
    dozen: [
        { value: '1', label: '1-12' },
        { value: '2', label: '13-24' },
        { value: '3', label: '25-36' }
    ]
};

function calcDisplayBalance(realBalance) {
    if (pendingRouletteBets.length > 0) {
        var balVal = document.getElementById('balance-val');
        if (balVal) {
            var currentUI = parseFloat(balVal.innerText.replace(/,/g, ''));
            return currentUI;
        }
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

function getColor(num) {
    if (num === 0) return 'green';
    var reds = { 1:1,3:1,5:1,7:1,9:1,12:1,14:1,16:1,18:1,19:1,21:1,23:1,25:1,27:1,30:1,32:1,34:1,36:1 };
    return reds[num] ? 'red' : 'black';
}

function getRouletteRoundResult(roundId) {
    return hash32('roulette:' + roundId) % 37;
}

function buildEuropeanWheelVisual() {
    var wheelOuter = document.getElementById('wheel-outer');
    if (!wheelOuter || rouletteWheelReady) return;

    var anglePerSlot = 360 / EUROPEAN_LAYOUT.length;
    var halfSlot = anglePerSlot / 2;
    var stops = [];

    EUROPEAN_LAYOUT.forEach(function (num, index) {
        var color = getColor(num);
        var start = (index * anglePerSlot).toFixed(4);
        var end = ((index + 1) * anglePerSlot).toFixed(4);
        var bg = color === 'green' ? '#1f8f4d' : (color === 'red' ? '#b22424' : '#1a1a1a');
        stops.push(bg + ' ' + start + 'deg ' + end + 'deg');
    });

    wheelOuter.style.backgroundImage = 'conic-gradient(from ' + (-halfSlot).toFixed(4) + 'deg, ' + stops.join(', ') + ')';

    EUROPEAN_LAYOUT.forEach(function (num, index) {
        var label = document.createElement('span');
        label.className = 'wheel-label wheel-label-' + getColor(num);
        label.textContent = String(num);

        var angle = index * anglePerSlot;
        label.style.transform = 'translate(-50%, -50%) rotate(' + angle.toFixed(4) + 'deg) translateY(-114px) rotate(' + (-angle).toFixed(4) + 'deg)';
        wheelOuter.appendChild(label);
    });

    rouletteWheelReady = true;
}

function evaluateRouletteBet(number, betType, betValue) {
    var color = getColor(number);
    if (betType === "color") return (betValue === color) ? 1 : 0;
    if (betType === "parity") {
        if (number === 0) return 0;
        var parity = (number % 2 === 0) ? "even" : "odd";
        return (parity === betValue) ? 1 : 0;
    }
    if (betType === "range") {
        if (number === 0) return 0;
        var range = (number <= 18) ? "low" : "high";
        return (range === betValue) ? 1 : 0;
    }
    if (betType === "dozen") {
        var n = Number(betValue);
        if (number === 0) return 0;
        var dozen = Math.ceil(number / 12);
        return (dozen === n) ? 2 : 0;
    }
    if (betType === "number") {
        return (number === Number(betValue)) ? 35 : 0;
    }
    return 0;
}

function updatePendingRouletteBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;
    if (pendingRouletteBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }
    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">目前待開獎下注：<br/>';
    pendingRouletteBets.forEach(function(b) {
        var label = b.betValue;
        if (BET_OPTIONS[b.betType]) {
            BET_OPTIONS[b.betType].forEach(function(opt) {
                if (opt.value === b.betValue) label = opt.label;
            });
        } else if (b.betType === 'number') {
            label = '號碼 ' + b.betValue;
        }
        html += '第 ' + b.roundId + ' 局: ' + label + ' (' + b.amount + ' ZXC)<br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function startRouletteDraw(roundId) {
    if (isRouletteDrawing) {
        setTimeout(function() { startRouletteDraw(roundId); }, 2000);
        return;
    }
    isRouletteDrawing = true;

    var token = ++roulettePreviewToken;
    var status = document.getElementById('status-msg');
    var wheelDisplay = document.getElementById('wheel-display');
    var wheelOuter = document.getElementById('wheel-outer');
    var lastResult = document.getElementById('last-result');

    var winningNumber = getRouletteRoundResult(roundId);
    var winningColor = getColor(winningNumber);

    var index = EUROPEAN_LAYOUT.indexOf(winningNumber);
    var anglePerSlot = 360 / 37;
    var targetAngle = 360 - (index * anglePerSlot);

    // 旋轉至少 5 圈
    currentRotation += 1800 + targetAngle - (currentRotation % 360);

    if (status) {
        status.innerText = '🎬 第 ' + roundId + ' 局開獎中...';
        status.style.color = '#ffd36a';
    }

    if (wheelOuter) {
        wheelOuter.style.transform = 'rotate(' + currentRotation + 'deg)';
    }
    if (wheelDisplay) {
        wheelDisplay.classList.remove('win-red', 'win-black', 'win-green');
        wheelDisplay.innerText = '?';
    }

    setTimeout(function () {
        if (token !== roulettePreviewToken) return;

        if (wheelDisplay) {
            wheelDisplay.innerText = winningNumber;
            wheelDisplay.classList.add('win-' + winningColor);
        }

        if (lastResult) {
            lastResult.innerText = '第 ' + roundId + ' 局開獎: ' + winningNumber + '（' + winningColor + '）';
        }

        // 結算下注
        var roundBets = pendingRouletteBets.filter(function(b) { return b.roundId === roundId; });
        pendingRouletteBets = pendingRouletteBets.filter(function(b) { return b.roundId !== roundId; });
        updatePendingRouletteBetsUI();

        if (roundBets.length > 0) {
            var totalPayout = 0;
            roundBets.forEach(function(b) {
                var mult = evaluateRouletteBet(winningNumber, b.betType, b.betValue);
                if (mult > 0 || (winningNumber === Number(b.betValue) && b.betType === 'number')) {
                   totalPayout += b.amount + (b.amount * mult);
                }
            });

            if (status) {
                if (totalPayout > 0) {
                    status.innerText = '🏆 第 ' + roundId + ' 局結算：贏得 ' + totalPayout.toFixed(2) + ' ZXC！';
                    status.style.color = '#00ff88';
                } else {
                    status.innerText = '💀 第 ' + roundId + ' 局結算：未中獎';
                    status.style.color = '#ff4444';
                }
            }
            refreshBalance();
        } else {
            if (status) {
                status.innerText = '📣 第 ' + roundId + ' 局開獎完成';
                status.style.color = '#ffd36a';
            }
        }

        isRouletteDrawing = false;
    }, 4000);
}

function updateRouletteRoundHint() {
    var hint = document.getElementById('round-hint');
    var spinBtn = document.getElementById('spin-btn');

    var now = Date.now();
    var roundId = Math.floor(now / ROULETTE_ROUND_MS);
    var closesAt = (roundId + 1) * ROULETTE_ROUND_MS;
    var bettingClosesAt = closesAt - ROULETTE_LOCK_MS;
    var isBettingOpen = now < bettingClosesAt;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

    if (hint) {
        if (isBettingOpen) {
            hint.innerText = '固定開獎：第 ' + roundId + ' 局，' + secLeft + ' 秒後截止下注';
        } else {
            hint.innerText = '第 ' + roundId + ' 局截止下注，即將開跑（' + secLeft + ' 秒後下一局）';
        }
    }

    if (spinBtn) {
        spinBtn.disabled = !isBettingOpen || isRouletteSubmitting;
    }

    if (lastRouletteRoundId !== null && lastRouletteRoundId !== roundId) {
        var drawRoundId = lastRouletteRoundId;
        lastRouletteRoundId = roundId;
        startRouletteDraw(drawRoundId);
    } else if (lastRouletteRoundId === null) {
        lastRouletteRoundId = roundId;
    }
}

function onBetTypeChange() {
    var betType = document.getElementById('bet-type').value;
    var betValueSelect = document.getElementById('bet-value');
    if (!betValueSelect) return;
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
    if (isRouletteSubmitting) return;

    var amount = parseFloat(document.getElementById('bet-amount').value);
    var betType = document.getElementById('bet-type').value;
    var betValue = document.getElementById('bet-value').value;
    var status = document.getElementById('status-msg');
    var spinBtn = document.getElementById('spin-btn');
    var hBal = document.getElementById('header-balance');

    if (isNaN(amount) || amount <= 0) {
        status.innerText = '請輸入有效金額';
        return;
    }

    var now = Date.now();
    var roundId = Math.floor(now / ROULETTE_ROUND_MS);
    var closesAt = (roundId + 1) * ROULETTE_ROUND_MS;
    if (now >= closesAt - ROULETTE_LOCK_MS) {
        status.innerText = '⏳ 本局已停止下注，請等下一局';
        status.style.color = '#ffd36a';
        return;
    }

    isRouletteSubmitting = true;
    spinBtn.disabled = true;
    status.innerHTML = '<span class="loader"></span> 下注交易中...';
    status.style.color = '#ffcc00';

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

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

        status.innerText = '✅ 下注成功！等待第 ' + result.roundId + ' 局開獎';
        status.style.color = '#00ff88';

        pendingRouletteBets.push({
            amount: amount,
            betType: betType,
            betValue: betValue,
            roundId: result.roundId
        });
        updatePendingRouletteBetsUI();

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });
    })
    .catch(function (e) {
        status.innerText = '❌ 錯誤: ' + e.message;
        status.style.color = 'red';
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    })
    .finally(function() {
        isRouletteSubmitting = false;
        spinBtn.disabled = false;
    });
}

window.addEventListener('load', function () {
    buildEuropeanWheelVisual();
    updateRouletteRoundHint();
    setInterval(updateRouletteRoundHint, 1000);
});
