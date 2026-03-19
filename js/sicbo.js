var SICBO_ROUND_MS = 20000;
var SICBO_LOCK_MS = 4000;
var serverTimeOffsetMs = 0;
var serverTimeSynced = false;
var isClockSyncing = false;
var lastClockSyncAt = 0;
var lastObservedSicboRoundId = null;
var pendingSicboBets = []; // { amount, betType, betValue, label, roundId, closesAt, tempId? }
var isSicboDrawing = false;
var isSicboSubmitting = false;
var selectedBetType = 'player';
var selectedBetValue = '';
var sicboTickerId = null;

var BET_TYPE_OPTIONS = [
    { value: 'player', label: '閒贏', needsValue: false },
    { value: 'banker', label: '莊贏', needsValue: false },
    { value: 'tie', label: '和局', needsValue: false }
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

    document.getElementById('place-bet-btn').disabled = !state.isBettingOpen || isSicboSubmitting;

    if (lastObservedSicboRoundId !== null && lastObservedSicboRoundId !== state.roundId) {
        var drawRoundId = lastObservedSicboRoundId;
        lastObservedSicboRoundId = state.roundId;
        startSicboDraw(drawRoundId);
    } else if (lastObservedSicboRoundId === null) {
        lastObservedSicboRoundId = state.roundId;
    }

    maybeDrawSicbo();
}

function getValueOptions(type) {
    void type;
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
            if (isSicboSubmitting) return;
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
            if (isSicboSubmitting) return;
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

function rollBankerDice(roundId) {
    return [
        (hash32('sicbo:banker:' + roundId + ':1') % 6) + 1,
        (hash32('sicbo:banker:' + roundId + ':2') % 6) + 1,
        (hash32('sicbo:banker:' + roundId + ':3') % 6) + 1
    ];
}

function compareDiceTotals(playerDice, bankerDice) {
    var playerTotal = playerDice[0] + playerDice[1] + playerDice[2];
    var bankerTotal = bankerDice[0] + bankerDice[1] + bankerDice[2];
    if (playerTotal > bankerTotal) return 'player';
    if (playerTotal < bankerTotal) return 'banker';
    return 'tie';
}

function evaluateBet(playerDice, bankerDice, betType) {
    var winner = compareDiceTotals(playerDice, bankerDice);
    if (betType === 'player') return winner === 'player' ? 1.1 : 0;
    if (betType === 'banker') return winner === 'banker' ? 1.1 : 0;
    if (betType === 'tie') return winner === 'tie' ? 8 : 0;
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
    var shaker = document.querySelector('.dice-shaker');
    if (shaker) shaker.classList.add('shake');
    if(window.audioManager) window.audioManager.play('dice_shake');

    var roundBets = pendingSicboBets.filter(function (bet) { return bet.roundId === roundId; });
    var resolvedPlayerDice = rollDice(roundId);
    var resolvedBankerDice = rollBankerDice(roundId);

    window.setTimeout(function () {
        if(shaker) shaker.classList.remove('shake');
        setDice(resolvedPlayerDice);
        pendingSicboBets = pendingSicboBets.filter(function (bet) { return bet.roundId !== roundId; });
        updatePendingSicboBetsUI();

        var totalWinAmount = 0;
        var hasBetsInRound = roundBets.length > 0;

        if (hasBetsInRound) {
            roundBets.forEach(function (bet) {
                var multiplier = evaluateBet(resolvedPlayerDice, resolvedBankerDice, bet.betType);
                if (multiplier > 0) totalWinAmount += bet.amount * multiplier;
            });
        }

        if (status) {
            var playerTotal = resolvedPlayerDice[0] + resolvedPlayerDice[1] + resolvedPlayerDice[2];
            var bankerTotal = resolvedBankerDice[0] + resolvedBankerDice[1] + resolvedBankerDice[2];
            var winner = compareDiceTotals(resolvedPlayerDice, resolvedBankerDice);
            var winnerText = winner === 'player' ? '閒家勝' : (winner === 'banker' ? '莊家勝' : '和局');
            var resultText = '閒家 ' + resolvedPlayerDice.join('-') + '（' + playerTotal + '） vs 莊家 ' + resolvedBankerDice.join('-') + '（' + bankerTotal + '）→ ' + winnerText;
            if (hasBetsInRound) {
                 if (totalWinAmount > 0) {
                    status.innerText = resultText + '，本輪贏得 ' + formatDisplayNumber(totalWinAmount, 2) + ' 子熙幣';
                    status.style.color = '#34f59f';
                } else {
                    status.innerText = resultText + '，本輪未中獎';
                    status.style.color = '#ff6b6b';
                }
            } else {
                status.innerText = resultText;
                status.style.color = '#d9b75f';
            }
        }

        if(hasBetsInRound) refreshBalance();
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
    if (isSicboSubmitting) return;

    var amount = Number(document.getElementById('bet-amount').value || 0);
    var betType = selectedBetType;
    var betValue = selectedBetValue;
    var status = document.getElementById('status-msg');

    if (!Number.isFinite(amount) || amount <= 0) {
        if (status) { status.innerText = '請輸入有效的下注金額'; status.style.color = '#ff6b6b'; }
        return;
    }

    var state = getCurrentSicboState();
    if (!state.isBettingOpen) {
        if (status) { status.innerText = '本局已封盤，請等待下一局'; status.style.color = '#ff6b6b'; }
        return;
    }
    
    var option = BET_TYPE_OPTIONS.find(function(o) { return o.value === betType; });
    if (option && option.needsValue && (betValue === '' || betValue === null)) {
        if (status) { status.innerText = '請選擇一個下注細項'; status.style.color = '#ff6b6b'; }
        return;
    }

    var currentBalance = getCurrentUserBalance();
    if (currentBalance < amount) {
        if (status) { status.innerText = '餘額不足'; status.style.color = '#ff6b6b'; }
        return;
    }

    // --- Optimistic Update ---
    isSicboSubmitting = true;
    setDisplayedBalance(currentBalance - amount);
    if (status) {
        status.innerText = '下注成功，等待本局開獎';
        status.style.color = '#34f59f';
    }
    if(window.audioManager) window.audioManager.play('bet');

    var tempId = 'temp_' + Date.now() + Math.random();
    var optimisticBet = {
        amount: amount,
        betType: betType,
        betValue: betValue || undefined,
        label: getBetLabel(betType, betValue || ''),
        roundId: state.roundId,
        closesAt: state.closesAt,
        tempId: tempId
    };
    pendingSicboBets.push(optimisticBet);
    updatePendingSicboBetsUI();
    document.getElementById('place-bet-btn').disabled = true;

    // --- Background Fetch ---
    fetch('/api/game?game=sicbo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.address, amount: amount, sessionId: user.sessionId, betType: betType, betValue: betValue || undefined })
    })
    .then(function (res) {
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '下注失敗') });
        return res.json();
    })
    .then(function (data) {
        if (data.serverNowTs) updateServerTime(data.serverNowTs);
        if (data.error) throw new Error(data.error);

        var confirmedBet = pendingSicboBets.find(function(b) { return b.tempId === tempId; });
        if (confirmedBet) {
            confirmedBet.roundId = data.roundId;
            confirmedBet.closesAt = data.closesAt;
            delete confirmedBet.tempId; // Officially confirmed
        }
        updateUI({ totalBet: data.totalBet, level: data.level, betLimit: data.betLimit });
    })
    .catch(function (error) {
        setDisplayedBalance(currentBalance); // Rollback
        if (status) {
            status.innerText = '錯誤: ' + error.message;
            status.style.color = '#ff6b6b';
        }
        // Remove optimistic bet
        pendingSicboBets = pendingSicboBets.filter(function(b) { return b.tempId !== tempId; });
        updatePendingSicboBetsUI();
    })
    .finally(function() {
        isSicboSubmitting = false;
        document.getElementById('place-bet-btn').disabled = !getCurrentSicboState().isBettingOpen;
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
        updateRoundHint();
    }, 1000);

    window.addEventListener('beforeunload', function() {
        if(sicboTickerId) clearInterval(sicboTickerId);
    });
}
