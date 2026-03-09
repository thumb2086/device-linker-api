var SICBO_ROUND_MS = 15000;
var SICBO_LOCK_MS = 2000;
var serverTimeOffsetMs = 0;
var serverTimeSynced = false;
var isClockSyncing = false;
var lastClockSyncAt = 0;
var pendingSicboBets = [];
var isSicboDrawing = false;
var selectedBetType = 'big';
var selectedBetValue = '';
var sicboTickerId = null;

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

var BET_TYPE_OPTIONS = [
    { value: 'big', label: '大', needsValue: false },
    { value: 'small', label: '小', needsValue: false },
    { value: 'odd', label: '單', needsValue: false },
    { value: 'even', label: '雙', needsValue: false },
    { value: 'total', label: '總和', needsValue: true },
    { value: 'single', label: '單骰', needsValue: true },
    { value: 'double_specific', label: '雙同號', needsValue: true },
    { value: 'triple_any', label: '任意圍', needsValue: false },
    { value: 'triple_specific', label: '指定圍', needsValue: true }
];

function hash32(input) {
    var str = String(input);
    var hash = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i += 1) {
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
    fetch('/api/user?clock=1&game=sicbo&t=' + now)
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

    return {
        now: now,
        roundId: roundId,
        closesAt: closesAt,
        bettingClosesAt: bettingClosesAt,
        isBettingOpen: isBettingOpen,
        secLeft: secLeft
    };
}

function updateRoundHint() {
    var hint = document.getElementById('round-hint');
    if (!hint) return;

    var state = getCurrentSicboState();
    hint.innerText = state.isBettingOpen
        ? ('本局倒數 ' + state.secLeft + ' 秒，仍可下注')
        : '本局已封盤，等待開獎';

    maybeDrawSicbo();
}

function getValueOptions(type) {
    if (type === 'total') {
        return [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(function (value) {
            return { value: String(value), label: '總和 ' + value };
        });
    }

    if (type === 'single' || type === 'double_specific' || type === 'triple_specific') {
        return [1, 2, 3, 4, 5, 6].map(function (value) {
            return { value: String(value), label: '點數 ' + value };
        });
    }

    return [];
}

function renderBetTypeGrid() {
    var grid = document.getElementById('bet-type-grid');
    if (!grid) return;

    grid.innerHTML = BET_TYPE_OPTIONS.map(function (option) {
        return '<button class="bet-chip' + (selectedBetType === option.value ? ' is-selected' : '') + '" data-type="' + option.value + '">' + option.label + '</button>';
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('[data-type]'), function (button) {
        button.addEventListener('click', function () {
            selectBetType(button.getAttribute('data-type'));
        });
    });
}

function renderBetValueGrid() {
    var grid = document.getElementById('bet-value-grid');
    if (!grid) return;

    var options = getValueOptions(selectedBetType);
    if (options.length === 0) {
        grid.innerHTML = '';
        selectedBetValue = '';
        return;
    }

    if (!selectedBetValue || !options.some(function (option) { return option.value === selectedBetValue; })) {
        selectedBetValue = options[0].value;
    }

    grid.innerHTML = options.map(function (option) {
        return '<button class="bet-chip' + (selectedBetValue === option.value ? ' is-selected' : '') + '" data-value="' + option.value + '">' + option.label + '</button>';
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('[data-value]'), function (button) {
        button.addEventListener('click', function () {
            selectBetValue(button.getAttribute('data-value'));
        });
    });
}

function selectBetType(type) {
    selectedBetType = type;
    renderBetTypeGrid();
    renderBetValueGrid();
}

function selectBetValue(value) {
    selectedBetValue = value;
    renderBetValueGrid();
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
    dice.forEach(function (die) {
        if (die === target) count += 1;
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

    var html = '<div style="font-size:0.92em;color:#aaa;margin-top:10px;line-height:1.6;">待開獎下注：<br/>';
    pendingSicboBets.forEach(function (bet) {
        html += bet.label + ' (' + formatDisplayNumber(bet.amount, 2) + ' 子熙幣)<br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function findDueSicboRoundId() {
    var now = getServerNowMs();
    var minRoundId = null;

    pendingSicboBets.forEach(function (bet) {
        if (!Number.isFinite(bet.closesAt) || bet.closesAt > now) return;
        if (minRoundId === null || bet.roundId < minRoundId) {
            minRoundId = bet.roundId;
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
        status.innerText = '骰子搖動中...';
        status.style.color = '#ffd36a';
    }

    var roundBets = pendingSicboBets.filter(function (bet) { return bet.roundId === roundId; });
    var resolvedDice = roundBets.length > 0 && Array.isArray(roundBets[0].dice) ? roundBets[0].dice : rollDice(roundId);

    window.setTimeout(function () {
        setDice(resolvedDice);
        pendingSicboBets = pendingSicboBets.filter(function (bet) { return bet.roundId !== roundId; });
        updatePendingSicboBetsUI();

        var totalPayout = 0;
        roundBets.forEach(function (bet) {
            var multiplier = evaluateBet(resolvedDice, bet.betType, bet.betValue);
            if (multiplier > 0) totalPayout += bet.amount * (multiplier + 1);
        });

        if (status) {
            if (totalPayout > 0) {
                status.innerText = '開獎結果 ' + resolvedDice.join('-') + '，本輪獲得 ' + formatDisplayNumber(totalPayout, 2) + ' 子熙幣';
                status.style.color = '#34f59f';
            } else {
                status.innerText = '開獎結果 ' + resolvedDice.join('-') + '，本輪未中獎';
                status.style.color = '#ff6b6b';
            }
        }

        refreshBalance();
        isSicboDrawing = false;
        maybeDrawSicbo();
    }, 1200);
}

function getBetLabel(betType, betValue) {
    var option = BET_TYPE_OPTIONS.find(function (item) { return item.value === betType; });
    if (!option) return betType;
    if (!option.needsValue) return option.label;
    return option.label + ' ' + betValue;
}

function placeSicboBet() {
    var amount = Number(document.getElementById('bet-amount').value || 0);
    var betType = selectedBetType;
    var betValue = selectedBetValue;
    var status = document.getElementById('status-msg');

    if (!Number.isFinite(amount) || amount <= 0) {
        if (status) {
            status.innerText = '請輸入有效的下注金額';
            status.style.color = '#ff6b6b';
        }
        return;
    }

    var state = getCurrentSicboState();
    if (state.now >= state.bettingClosesAt) {
        if (status) {
            status.innerText = '本局已封盤，請等待下一局';
            status.style.color = '#ff6b6b';
        }
        return;
    }

    if (betValue === '' || betValue === null) betValue = undefined;
    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var headerBalance = document.getElementById('header-balance');
    if (currentBalance < amount) {
        if (status) {
            status.innerText = '餘額不足';
            status.style.color = '#ff6b6b';
        }
        return;
    }

    if (status) {
        status.innerText = '下注送出中...';
        status.style.color = '#ffd36a';
    }

    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = formatDisplayNumber(tempBalance, 2);
    if (headerBalance) headerBalance.innerText = formatDisplayNumber(tempBalance, 2);

    fetch('/api/game?game=sicbo', {
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
        .then(function (data) {
            if (data.serverNowTs) updateServerTime(data.serverNowTs);
            if (!data || data.error) throw new Error((data && data.error) || '下注失敗');

            pendingSicboBets.push({
                amount: amount,
                betType: betType,
                betValue: betValue,
                label: getBetLabel(betType, betValue || ''),
                roundId: data.roundId,
                closesAt: data.closesAt,
                dice: Array.isArray(data.dice) ? data.dice : null
            });
            updatePendingSicboBetsUI();

            if (status) {
                status.innerText = '下注成功，等待本局開獎';
                status.style.color = '#34f59f';
            }

            updateUI({ totalBet: data.totalBet, vipLevel: data.vipLevel, maxBet: data.maxBet });
            document.getElementById('tx-log').innerHTML = txLinkHTML(data.txHash);
        })
        .catch(function (error) {
            document.getElementById('balance-val').innerText = formatDisplayNumber(currentBalance, 2);
            if (headerBalance) headerBalance.innerText = formatDisplayNumber(currentBalance, 2);
            if (status) {
                status.innerText = '錯誤: ' + error.message;
                status.style.color = '#ff6b6b';
            }
        });
}

function initSicboGame() {
    if (window.__sicboGameInitialized) return;
    window.__sicboGameInitialized = true;

    renderBetTypeGrid();
    renderBetValueGrid();
    syncSicboClock(true);
    updateRoundHint();

    sicboTickerId = window.setInterval(function () {
        syncSicboClock(false);
        updateRoundHint();
    }, 1000);
}
