/* === 賽馬遊戲邏輯 === */

var selectedHorseId = 1;
var raceInProgress = false; // 動畫是否進行中
var isSubmitting = false; // 是否正在通訊中
var raceAnimationToken = 0;
var lastObservedRoundId = null;

var pendingBets = []; // [{amount, horseId, roundId}]
var lastRoundResults = null; // { roundId, metrics, winnerId, ... }

function calcDisplayBalance(realBalance) {
    // 賽馬不需要特殊處理，因為 API 會扣掉餘額，我們手動更新 UI
    // 但為了防止 refreshBalance 把我們「樂觀更新」的餘額蓋掉，我們在有 pendingBets 時不更新 UI
    if (pendingBets.length > 0) {
        var currentUI = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
        return currentUI;
    }
    return realBalance;
}

var HORSE_ROUND_MS = 20000;
var HORSE_LOCK_MS = 3000;
var TRACKS = ['乾地', '濕地', '夜賽'];

var HORSE_CONFIG = {
    1: { id: 1, name: '赤焰', multiplier: 1.8, weight: 25, speed: 92, stamina: 88, burst: 86 },
    2: { id: 2, name: '雷霆', multiplier: 2.2, weight: 23, speed: 89, stamina: 90, burst: 84 },
    3: { id: 3, name: '幻影', multiplier: 2.9, weight: 19, speed: 86, stamina: 84, burst: 91 },
    4: { id: 4, name: '夜刃', multiplier: 4.0, weight: 15, speed: 82, stamina: 80, burst: 94 },
    5: { id: 5, name: '霜牙', multiplier: 5.8, weight: 11, speed: 80, stamina: 93, burst: 78 },
    6: { id: 6, name: '流星', multiplier: 8.5, weight: 7, speed: 95, stamina: 72, burst: 97 }
};

var HORSE_STATS_FIXED = [
    { id: 1, name: '赤焰', races: 1800, wins: 450, podium: 1130, last5: [1, 2, 1, 3, 2], winRate: 25.0 },
    { id: 2, name: '雷霆', races: 1800, wins: 414, podium: 1068, last5: [2, 1, 3, 2, 2], winRate: 23.0 },
    { id: 3, name: '幻影', races: 1800, wins: 342, podium: 930, last5: [3, 4, 1, 2, 3], winRate: 19.0 },
    { id: 4, name: '夜刃', races: 1800, wins: 270, podium: 792, last5: [4, 3, 2, 4, 1], winRate: 15.0 },
    { id: 5, name: '霜牙', races: 1800, wins: 198, podium: 625, last5: [5, 2, 6, 3, 4], winRate: 11.0 },
    { id: 6, name: '流星', races: 1800, wins: 126, podium: 435, last5: [6, 5, 4, 2, 1], winRate: 7.0 }
];

function getHorseList() {
    return [HORSE_CONFIG[1], HORSE_CONFIG[2], HORSE_CONFIG[3], HORSE_CONFIG[4], HORSE_CONFIG[5], HORSE_CONFIG[6]];
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

function hashFloat(input) {
    return (hash32(input) % 1000000) / 1000000;
}

function nextRaceAnimationToken() {
    raceAnimationToken += 1;
    return raceAnimationToken;
}

function selectHorse(horseId) {
    selectedHorseId = horseId;
    document.querySelectorAll('.horse-choice').forEach(function (el) {
        el.classList.toggle('active', Number(el.dataset.horseId) === horseId);
    });
}

function updateHorseRoundHint() {
    var hint = document.getElementById('round-hint');
    if (!hint) return;
    var raceBtn = document.getElementById('race-btn');

    var now = Date.now();
    var roundId = Math.floor(now / HORSE_ROUND_MS);
    var closesAt = (roundId + 1) * HORSE_ROUND_MS;
    var bettingClosesAt = closesAt - HORSE_LOCK_MS;
    var isBettingOpen = now < bettingClosesAt;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

    if (isBettingOpen) {
        hint.innerText = '固定開獎：第 ' + roundId + ' 局，' + secLeft + ' 秒後截止下注';
    } else {
        hint.innerText = '第 ' + roundId + ' 局截止下注，即將開跑（' + secLeft + ' 秒後下一局）';
    }

    if (raceBtn) {
        raceBtn.disabled = !isBettingOpen || isSubmitting;
    }

    if (lastObservedRoundId !== null && lastObservedRoundId !== roundId) {
        // 局數切換，觸發上一局的開獎動畫
        var drawRoundId = lastObservedRoundId;
        lastObservedRoundId = roundId;
        startRaceDraw(drawRoundId);
    } else if (lastObservedRoundId === null) {
        lastObservedRoundId = roundId;
    }
}

function startRaceDraw(roundId) {
    if (raceInProgress) {
        // 如果正在開獎中，延遲一點點再試
        setTimeout(function() { startRaceDraw(roundId); }, 2000);
        return;
    }
    raceInProgress = true;

    var statusMsg = document.getElementById('status-msg');
    var simulation = simulateRaceDeterministic(roundId);

    document.getElementById('track-cond').innerText = '場地：' + simulation.trackCondition;
    renderRaceRank([]);
    resetRaceTrack();

    var token = nextRaceAnimationToken();
    if (statusMsg) {
        statusMsg.innerText = '🎬 第 ' + roundId + ' 局比賽開始！';
        statusMsg.style.color = '#ffd36a';
    }

    animateCountdown(token, function () {
        if (token !== raceAnimationToken) return;

        animateRaceLive(simulation.metrics, roundId, token, function () {
            if (token !== raceAnimationToken) return;

            renderRaceRank(simulation.metrics);
            var winner = document.getElementById('horse-' + simulation.winnerId);
            if (winner) winner.classList.add('winner');
            setRaceCall('第 ' + roundId + ' 局結果：' + simulation.winnerName + ' 奪冠');

            // 結算本用戶在該局的所有下注
            var roundBets = pendingBets.filter(function(b) { return b.roundId === roundId; });
            pendingBets = pendingBets.filter(function(b) { return b.roundId !== roundId; });
            updatePendingBetsUI();

            if (roundBets.length > 0) {
                var totalWon = 0;
                var totalBetAmount = 0;
                roundBets.forEach(function(b) {
                    totalBetAmount += b.amount;
                    if (b.horseId === simulation.winnerId) {
                        totalWon += b.amount * HORSE_CONFIG[b.horseId].multiplier;
                    }
                });

                if (totalWon > 0) {
                    statusMsg.innerHTML = '🏆 第 ' + roundId + ' 局結算：贏得 ' + totalWon.toFixed(2) + ' 子熙幣！';
                    statusMsg.style.color = '#00ff88';
                } else {
                    statusMsg.innerText = '💀 第 ' + roundId + ' 局結算：未中獎，再接再厲';
                    statusMsg.style.color = '#ff4444';
                }
                refreshBalance();
            } else {
                if (statusMsg) {
                    statusMsg.innerText = '📣 第 ' + roundId + ' 局自動開獎完成：' + simulation.winnerName + ' 奪冠';
                    statusMsg.style.color = '#ffd36a';
                }
            }
            raceInProgress = false;
        });
    });
}

function setRaceCall(message) {
    var callEl = document.getElementById('race-call');
    if (callEl) callEl.innerText = message;
}

function setPace(percent) {
    var fill = document.getElementById('pace-fill');
    if (!fill) return;
    fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
}

function resetLights() {
    for (var i = 1; i <= 3; i++) {
        var light = document.getElementById('light-' + i);
        if (!light) continue;
        light.classList.remove('on');
        light.classList.remove('go');
    }
}

function setLights(count) {
    resetLights();
    if (count === 0) return;

    if (count === 99) {
        for (var i = 1; i <= 3; i++) {
            var goLight = document.getElementById('light-' + i);
            if (goLight) goLight.classList.add('go');
        }
        return;
    }

    for (var j = 1; j <= count; j++) {
        var light = document.getElementById('light-' + j);
        if (light) light.classList.add('on');
    }
}

function resetRaceTrack() {
    for (var i = 1; i <= getHorseList().length; i++) {
        var horse = document.getElementById('horse-' + i);
        if (!horse) continue;
        horse.innerText = '🏇';
        horse.style.left = '6%';
        horse.classList.remove('winner');
        horse.classList.remove('running');
    }
    setRaceCall('等待發令中...');
    setPace(0);
    resetLights();
}

function animateCountdown(token, onDone) {
    if (token !== raceAnimationToken) return;

    setRaceCall('比賽即將開始...');
    setLights(1);

    setTimeout(function () {
        if (token !== raceAnimationToken) return;
        setRaceCall('3...');
        setLights(1);

        setTimeout(function () {
            if (token !== raceAnimationToken) return;
            setRaceCall('2...');
            setLights(2);

            setTimeout(function () {
                if (token !== raceAnimationToken) return;
                setRaceCall('1...');
                setLights(3);

                setTimeout(function () {
                    if (token !== raceAnimationToken) return;
                    setRaceCall('出閘！衝啊！');
                    setLights(99);
                    if (onDone) onDone();
                }, 520);
            }, 520);
        }, 520);
    }, 360);
}

function buildTargetPositions(raceMetrics) {
    var map = {};
    raceMetrics.forEach(function (m) {
        var target;
        if (m.rank === 1) target = 92;
        else if (m.rank === 2) target = 87;
        else if (m.rank === 3) target = 82;
        else target = 77;

        var reactionBias = Math.max(-1.2, Math.min(1.2, (230 - m.reactionMs) / 60));
        var speedBias = Math.max(-1.2, Math.min(1.2, (m.topSpeed - 59) / 2.2));
        map[m.id] = target + reactionBias + speedBias;
    });
    return map;
}

function animateRaceLive(raceMetrics, roundId, token, onFinish) {
    if (token !== raceAnimationToken) return;

    var totalTicks = 34;
    var tick = 0;
    var targets = buildTargetPositions(raceMetrics);
    var positions = {};
    getHorseList().forEach(function (horse) {
        positions[horse.id] = 6;
    });
    var leaderId = null;

    for (var i = 1; i <= getHorseList().length; i++) {
        var h = document.getElementById('horse-' + i);
        if (h) h.classList.add('running');
    }

    var timer = setInterval(function () {
        if (token !== raceAnimationToken) {
            clearInterval(timer);
            return;
        }

        tick += 1;
        var p = tick / totalTicks;
        setPace(p * 100);

        raceMetrics.forEach(function (m) {
            var id = m.id;
            var rankPower = (5 - m.rank) * 0.075;
            var baseStep = 1.35 + rankPower;
            var surge = 0;

            var seedMid = 'horse:mid:' + roundId + ':' + id + ':' + tick;
            var seedLate = 'horse:late:' + roundId + ':' + id + ':' + tick;
            if (p > 0.42 && p < 0.72 && hashFloat(seedMid) > 0.75) surge += 0.55;
            if (p > 0.72 && m.rank === 1 && hashFloat(seedLate) > 0.25) surge += 0.42;

            positions[id] += baseStep + surge;

            var maxAllowed = 6 + (targets[id] - 6) * p + 0.9;
            if (positions[id] > maxAllowed) positions[id] = maxAllowed;

            var horse = document.getElementById('horse-' + id);
            if (horse) horse.style.left = positions[id] + '%';
        });

        var sorted = raceMetrics.slice().sort(function (a, b) {
            return positions[b.id] - positions[a.id];
        });

        if (sorted[0] && sorted[0].id !== leaderId && p > 0.2 && p < 0.9) {
            leaderId = sorted[0].id;
            setRaceCall('領先換手！' + sorted[0].name + ' 衝到最前！');
        } else if (p > 0.85) {
            setRaceCall('最後直線！全場沸騰！');
        }

        if (tick >= totalTicks) {
            clearInterval(timer);

            raceMetrics.forEach(function (m) {
                var horseEl = document.getElementById('horse-' + m.id);
                if (!horseEl) return;
                horseEl.classList.remove('running');
                horseEl.style.left = targets[m.id] + '%';
            });

            setPace(100);
            setTimeout(function () {
                if (token !== raceAnimationToken) return;
                resetLights();
                if (onFinish) onFinish();
            }, 450);
        }
    }, 170);
}

function simulateRaceDeterministic(roundId) {
    var trackIdx = Math.floor(hashFloat('horse:track:' + roundId) * TRACKS.length) % TRACKS.length;
    var trackCondition = TRACKS[trackIdx];

    var metrics = getHorseList().map(function (horse) {
        var baseScore = horse.weight * 2 + horse.speed * 0.6 + horse.stamina * 0.5 + horse.burst * 0.7;
        var volatility = (hashFloat('horse:vol:' + roundId + ':' + horse.id) * 40) - 20;

        var trackBias = trackCondition === '濕地'
            ? horse.stamina * 0.06
            : trackCondition === '夜賽'
                ? horse.burst * 0.07
                : horse.speed * 0.05;

        var raceScore = baseScore + trackBias + volatility;

        return {
            id: horse.id,
            name: horse.name,
            multiplier: horse.multiplier,
            finishTime: parseFloat((66 - raceScore / 18).toFixed(2)),
            topSpeed: parseFloat((54 + raceScore / 12).toFixed(1)),
            reactionMs: Math.round(180 + ((hashFloat('horse:react:' + roundId + ':' + horse.id) * 100) - 40) - horse.burst * 0.35)
        };
    });

    metrics.sort(function (a, b) { return a.finishTime - b.finishTime; });
    metrics.forEach(function (m, idx) { m.rank = idx + 1; });

    return {
        roundId: roundId,
        trackCondition: trackCondition,
        metrics: metrics,
        winnerId: metrics[0].id,
        winnerName: metrics[0].name
    };
}

function renderHorseDataTable(horses, horseStats) {
    var table = document.getElementById('horse-data-table');
    if (!table) return;

    var statsMap = {};
    (horseStats || []).forEach(function (s) { statsMap[s.id] = s; });

    var html = '';
    html += '<div class="horse-row head">' +
        '<div>馬匹</div><div>能力</div><div>戰績</div><div class="optional-col">勝率</div><div class="optional-col">近五場</div>' +
        '</div>';

    (horses || []).forEach(function (h) {
        var st = statsMap[h.id] || { races: 0, wins: 0, winRate: 0, last5: [] };
        var recent = (st.last5 || []).map(function (r) { return '#' + r; }).join(' ');
        if (!recent) recent = '-';
        html += '<div class="horse-row">' +
            '<div>' + h.id + '號 ' + h.name + '</div>' +
            '<div>S' + h.speed + '/E' + h.stamina + '/B' + h.burst + '</div>' +
            '<div>' + st.wins + '勝/' + st.races + '場</div>' +
            '<div class="optional-col">' + (st.winRate || 0) + '%</div>' +
            '<div class="optional-col">' + recent + '</div>' +
            '</div>';
    });

    table.innerHTML = html;
}

function renderRaceRank(raceMetrics) {
    var rankWrap = document.getElementById('race-rank');
    if (!rankWrap) return;
    if (!raceMetrics || raceMetrics.length === 0) {
        rankWrap.innerHTML = '尚未開跑';
        return;
    }

    var sorted = raceMetrics.slice().sort(function (a, b) { return a.rank - b.rank; });
    var html = '';
    sorted.forEach(function (m) {
        html += '<div class="rank-item ' + (m.rank === 1 ? 'winner' : '') + '">' +
            '<div>' + m.rank + '</div>' +
            '<div>' + m.name + '</div>' +
            '<div>' + m.finishTime + 's</div>' +
            '<div class="optional-col">' + m.topSpeed + 'km/h</div>' +
            '<div class="optional-col">' + m.reactionMs + 'ms</div>' +
            '</div>';
    });
    rankWrap.innerHTML = html;
}

function updatePendingBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;
    if (pendingBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }
    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">目前待開獎下注：<br/>';
    pendingBets.forEach(function(b) {
        html += '第 ' + b.roundId + ' 局: ' + HORSE_CONFIG[b.horseId].name + ' (' + b.amount + ' 子熙幣)<br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function runRace() {
    if (isSubmitting) return;

    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var raceBtn = document.getElementById('race-btn');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }

    var now = Date.now();
    var roundId = Math.floor(now / HORSE_ROUND_MS);
    var closesAt = (roundId + 1) * HORSE_ROUND_MS;
    if (now >= closesAt - HORSE_LOCK_MS) {
        statusMsg.innerText = '⏳ 本局已停止下注，請等下一局';
        statusMsg.style.color = '#ffd36a';
        return;
    }

    isSubmitting = true;
    raceBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 下注交易中...';
    statusMsg.style.color = '#ffcc00';

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/game?game=horse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            horseId: selectedHorseId,
            sessionId: user.sessionId
        })
    })
    .then(function (res) { return res.json(); })
    .then(function (result) {
        if (result.error) throw new Error(result.error);

        statusMsg.innerText = '✅ 下注成功！等待第 ' + result.roundId + ' 局開獎';
        statusMsg.style.color = '#00ff88';

        pendingBets.push({
            amount: amount,
            horseId: selectedHorseId,
            roundId: result.roundId
        });
        updatePendingBetsUI();

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });
        renderHorseDataTable(result.horses || getHorseList(), result.horseStats || HORSE_STATS_FIXED);
    })
    .catch(function (e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    })
    .finally(function() {
        isSubmitting = false;
        raceBtn.disabled = false;
    });
}

window.addEventListener('load', function () {
    selectHorse(1);
    renderHorseDataTable(getHorseList(), HORSE_STATS_FIXED);
    renderRaceRank([]);
    resetRaceTrack();

    updateHorseRoundHint();
    setInterval(updateHorseRoundHint, 1000);
});
