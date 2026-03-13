var BINGO_ROUND_MS = 30000;
var BINGO_LOCK_MS = 5000;
var serverTimeOffsetMs = 0;
var serverTimeSynced = false;
var isClockSyncing = false;
var lastClockSyncAt = 0;
var lastObservedBingoRoundId = null;
var pendingBingoBets = []; // { amount, numbers, roundId, closesAt, tempId? }
var isBingoDrawing = false;
var isBingoSubmitting = false;
var selectedNumbers = [];

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

function syncBingoClock(force) {
    var now = Date.now();
    if (isClockSyncing) return;
    if (!force && (now - lastClockSyncAt) < 10000) return;
    isClockSyncing = true;
    fetch('/api/user?clock=1&game=bingo&t=' + now)
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
    return { now: now, roundId: roundId, closesAt: closesAt, bettingClosesAt: bettingClosesAt, isBettingOpen: isBettingOpen, secLeft: secLeft };
}

function updateRoundHint() {
    var hint = document.getElementById('round-hint');
    var btn = document.getElementById('place-bingo-bet-btn');
    if (!hint) return;
    var state = getCurrentBingoState();
    hint.innerText = state.isBettingOpen
        ? ('固定開獎：' + state.secLeft + ' 秒後截止下注')
        : '封盤中：等待開獎';
    if(btn) btn.disabled = !state.isBettingOpen || isBingoSubmitting;

    if (lastObservedBingoRoundId !== null && lastObservedBingoRoundId !== state.roundId) {
        var drawRoundId = lastObservedBingoRoundId;
        lastObservedBingoRoundId = state.roundId;
        startBingoDraw(drawRoundId);
    } else if (lastObservedBingoRoundId === null) {
        lastObservedBingoRoundId = state.roundId;
    }

    maybeDrawBingo();
}

function parseNumbers(input) {
    return String(input || '')
        .split(/[,\s]+/)
        .map(function (v) { return Number(v); })
        .filter(function (n) { return Number.isInteger(n) && n >= 1 && n <= 75; });
}

function renderPickSummary() {
    var summary = document.getElementById('pick-summary');
    if (!summary) return;
    if (selectedNumbers.length === 0) {
        summary.innerText = '尚未選號 (請選 8 個)';
        return;
    }
    summary.innerText = '已選: ' + selectedNumbers.join(', ');
}

function renderNumberPad() {
    var pad = document.getElementById('number-pad');
    if (!pad) return;
    var html = '';
    for (var i = 1; i <= 75; i += 1) {
        var selected = selectedNumbers.indexOf(i) >= 0;
        html += '<button class="number-btn' + (selected ? ' is-selected' : '') + '" onclick="toggleNumber(' + i + ')">' + i + '</button>';
    }
    pad.innerHTML = html;
    renderPickSummary();
}

function setSelectedNumbers(numbers) {
    selectedNumbers = numbers.slice(0, 8).sort(function (a, b) { return a - b; });
    renderNumberPad();
}

function toggleNumber(number) {
    if (isBingoSubmitting) return;
    var index = selectedNumbers.indexOf(number);
    if (index >= 0) {
        selectedNumbers.splice(index, 1);
    } else {
        if (selectedNumbers.length >= 8) {
            showUserToast('最多只能選擇 8 個號碼。', true);
            return;
        }
        selectedNumbers.push(number);
    }
    selectedNumbers.sort(function (a, b) { return a - b; });
    renderNumberPad();
}

function randomPick() {
    if (isBingoSubmitting) return;
    var pool = [];
    for (var i = 1; i <= 75; i += 1) pool.push(i);
    for (var j = pool.length - 1; j > 0; j -= 1) {
        var k = Math.floor(Math.random() * (j + 1));
        var tmp = pool[j];
        pool[j] = pool[k];
        pool[k] = tmp;
    }
    setSelectedNumbers(pool.slice(0, 8));
}

function clearPick() {
    if (isBingoSubmitting) return;
    selectedNumbers = [];
    renderNumberPad();
}

function drawNumbers(roundId) {
    var pool = [];
    for (var i = 1; i <= 75; i += 1) pool.push(i);
    for (var j = pool.length - 1; j > 0; j -= 1) {
        var k = hash32('bingo:' + roundId + ':' + j) % (j + 1);
        var tmp = pool[j];
        pool[j] = pool[k];
        pool[k] = tmp;
    }
    return pool.slice(0, 20).sort(function (a, b) { return a - b; });
}

function payoutForHits(hitCount) {
    if (hitCount === 8) return 50;
    if (hitCount === 7) return 10;
    if (hitCount === 6) return 3;
    if (hitCount === 5) return 1.5;
    if (hitCount === 4) return 1;
    return 0;
}

function renderDrawn(numbers) {
    var grid = document.getElementById('drawn-grid');
    if (!grid) return;
    if (!numbers || numbers.length === 0) {
        grid.innerHTML = '';
        return;
    }
    grid.innerHTML = numbers.map(function (n, i) {
        return '<span class="bingo-ball" style="animation-delay: ' + (i * 50) + 'ms;">' + n + '</span>';
    }).join('');
}

function updatePendingBingoBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;
    if (pendingBingoBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }
    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">待開獎下注：<br/>';
    pendingBingoBets.forEach(function (b) {
        html += '<span class="pending-bet-card">' + b.numbers.join(',') + ' (' + formatDisplayNumber(b.amount, 2) + ' 子熙幣)</span><br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function findDueBingoRoundId() {
    var now = getServerNowMs();
    var minRoundId = null;
    pendingBingoBets.forEach(function (b) {
        if (!Number.isFinite(b.closesAt) || b.closesAt > now) return;
        if (minRoundId === null || b.roundId < minRoundId) minRoundId = b.roundId;
    });
    return minRoundId;
}

function maybeDrawBingo() {
    if (isBingoDrawing) return;
    var roundId = findDueBingoRoundId();
    if (roundId === null) return;
    startBingoDraw(roundId);
}

function startBingoDraw(roundId) {
    if (isBingoDrawing) return;
    isBingoDrawing = true;
    var status = document.getElementById('status-msg');
    if (status) {
        status.innerText = '開獎中...';
        status.style.color = '#ffd36a';
    }
    if(window.audioManager) window.audioManager.play('bingo_draw');

    var drawn = drawNumbers(roundId);
    setTimeout(function () {
        renderDrawn(drawn);
        var drawnSet = new Set(drawn);

        var roundBets = pendingBingoBets.filter(function (b) { return b.roundId === roundId; });
        pendingBingoBets = pendingBingoBets.filter(function (b) { return b.roundId !== roundId; });
        updatePendingBingoBetsUI();

        var totalWinnings = 0;
        var hasBetsInRound = roundBets.length > 0;

        if (hasBetsInRound) {
            roundBets.forEach(function (b) {
                var hits = b.numbers.filter(function (n) { return drawnSet.has(n); }).length;
                var mult = payoutForHits(hits);
                if (mult > 0) totalWinnings += b.amount * mult;
            });
        }

        if (status) {
            if (hasBetsInRound) {
                if (totalWinnings > 0) {
                    status.innerText = '開獎完成，本輪共贏得 ' + formatDisplayNumber(totalWinnings, 2) + ' 子熙幣';
                    status.style.color = '#00ff88';
                    if(window.audioManager) window.audioManager.play('win_small');
                } else {
                    status.innerText = '開獎完成，本輪未中獎';
                    status.style.color = '#ff6666';
                }
            } else {
                status.innerText = '開獎完成';
                status.style.color = '#d9b75f';
            }
        }
        if(hasBetsInRound) refreshBalance();
        isBingoDrawing = false;
        maybeDrawBingo();
    }, 2000);
}

function placeBingoBet() {
    if (isBingoSubmitting) return;
    var amount = Number(document.getElementById('bet-amount').value || 0);
    var numbers = selectedNumbers.slice();
    var status = document.getElementById('status-msg');

    if (!amount || amount <= 0) {
        if (status) { status.innerText = '請輸入有效押注金額'; status.style.color = '#ff6666'; }
        return;
    }
    if (numbers.length !== 8) {
        if (status) { status.innerText = '請選擇 8 個號碼 (1-75)'; status.style.color = '#ff6666'; }
        return;
    }

    var state = getCurrentBingoState();
    if (!state.isBettingOpen) {
        if (status) { status.innerText = '已封盤，請等下一輪'; status.style.color = '#ff6666'; }
        return;
    }

    var currentBalance = getCurrentUserBalance();
    if (currentBalance < amount) {
        if (status) { status.innerText = '餘額不足'; status.style.color = '#ff6666'; }
        return;
    }

    // --- Optimistic Update ---
    isBingoSubmitting = true;
    setDisplayedBalance(currentBalance - amount);
    if(window.audioManager) window.audioManager.play('bet');

    var tempId = 'temp_' + Date.now() + Math.random();
    var optimisticBet = {
        amount: amount,
        numbers: numbers,
        roundId: state.roundId,
        closesAt: state.closesAt,
        tempId: tempId
    };
    pendingBingoBets.push(optimisticBet);
    updatePendingBingoBetsUI();

    if (status) {
        status.innerText = '下注成功，等待開獎';
        status.style.color = '#00ff88';
    }
    document.getElementById('place-bingo-bet-btn').disabled = true;

    // --- Background Fetch ---
    fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'bingo', address: user.address, amount: amount, sessionId: user.sessionId, numbers: numbers })
    })
    .then(function (res) { 
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '下注失敗') });
        return res.json();
     })
    .then(function (data) {
        if (data.serverNowTs) updateServerTime(data.serverNowTs);
        if (data.error) throw new Error(data.error);

        var confirmedBet = pendingBingoBets.find(function(b) { return b.tempId === tempId; });
        if (confirmedBet) {
            confirmedBet.roundId = data.roundId;
            confirmedBet.closesAt = data.closesAt;
            confirmedBet.numbers = data.userNumbers || confirmedBet.numbers;
            delete confirmedBet.tempId;
        }
        updateUI({ totalBet: data.totalBet, level: data.level, betLimit: data.betLimit });
    })
    .catch(function (err) {
        setDisplayedBalance(currentBalance);
        if (status) {
            status.innerText = '錯誤: ' + err.message;
            status.style.color = '#ff6666';
        }
        pendingBingoBets = pendingBingoBets.filter(function(b) { return b.tempId !== tempId; });
        updatePendingBingoBetsUI();
    })
    .finally(function() {
        isBingoSubmitting = false;
        var btn = document.getElementById('place-bingo-bet-btn');
        if(btn) btn.disabled = !getCurrentBingoState().isBettingOpen;
    });
}

function initBingoPage() {
    renderNumberPad();
    randomPick();
    var ticker = setInterval(function () {
        syncBingoClock(false);
        updateRoundHint();
    }, 1000);
    syncBingoClock(true);
    updateRoundHint();
    window.addEventListener('beforeunload', () => clearInterval(ticker));
}
