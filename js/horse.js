/* === Horse Racing === */

var HORSE_ROUND_MS = 60000;
var HORSE_LOCK_MS = 4000;
var isRaceRunning = false;
var isSubmitting = false;
var lastHorseRoundId = null;

var pendingHorseBets = []; // [{amount, horseId, roundId}]

function calcDisplayBalance(realBalance) {
    if (pendingHorseBets.length > 0) {
        var currentUI = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
        return currentUI;
    }
    return realBalance;
}

var HORSES = [
    { id: 1, name: "閃電快手", multiplier: 3.5 },
    { id: 2, name: "疾風之影", multiplier: 4.0 },
    { id: 3, name: "黃金猛擊", multiplier: 5.5 },
    { id: 4, name: "烈焰狂奔", multiplier: 8.0 },
    { id: 5, name: "星光奇蹟", multiplier: 12.0 },
    { id: 6, name: "終極榮耀", multiplier: 20.0 }
];

var HORSE_STATS_FIXED = {
    1: { speed: 85, stamina: 70, explosive: 90, consistency: 80 },
    2: { speed: 92, stamina: 65, explosive: 85, consistency: 75 },
    3: { speed: 78, stamina: 88, explosive: 75, consistency: 90 },
    4: { speed: 82, stamina: 75, explosive: 95, consistency: 70 },
    5: { speed: 75, stamina: 92, explosive: 70, consistency: 85 },
    6: { speed: 70, stamina: 80, explosive: 80, consistency: 60 }
};

var TRACK_CONDITIONS = ["良好", "稍重", "重馬", "不良"];

function getHorseList() { return HORSES; }

function hash32(input) {
    var str = String(input);
    var hash = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function simulateRaceDeterministic(roundId) {
    var seedStr = 'horse_race:' + roundId;
    var seed = hash32(seedStr);
    var conditionIdx = seed % TRACK_CONDITIONS.length;
    var trackCondition = TRACK_CONDITIONS[conditionIdx];

    var horseScores = HORSES.map(function(h) {
        var horseSeed = hash32(seedStr + ':' + h.id);
        var stats = HORSE_STATS_FIXED[h.id];
        var baseScore = stats.speed * 0.4 + stats.stamina * 0.2 + stats.explosive * 0.3 + stats.consistency * 0.1;
        var luck = (horseSeed % 20);
        return { id: h.id, score: baseScore + luck };
    });

    horseScores.sort(function(a, b) { return b.score - a.score; });
    var winnerId = horseScores[0].id;
    var winner = HORSES.find(function(h) { return h.id === winnerId; });

    var metrics = HORSES.map(function(h) {
        var hSeed = hash32(seedStr + ':metric:' + h.id);
        var score = horseScores.find(function(hs) { return hs.id === h.id; }).score;
        var finishTime = (100 - score / 2).toFixed(2);
        var topSpeed = (50 + HORSE_STATS_FIXED[h.id].speed / 4 + (hSeed % 10)).toFixed(1);
        return { horseId: h.id, finishTime: finishTime, topSpeed: topSpeed };
    });

    return { winner: winner, trackCondition: trackCondition, metrics: metrics };
}

function selectHorse(id) {
    var list = document.getElementById('horse-list');
    if (!list) return;
    var items = list.getElementsByClassName('horse-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('selected');
        if (items[i].getAttribute('data-id') == id) {
            items[i].classList.add('selected');
        }
    }
    window.selectedHorseId = id;
}

function renderHorseDataTable(horses, stats) {
    var table = document.getElementById('horse-data-table');
    if (!table) return;
    var html = '<thead><tr><th>馬匹</th><th>速度</th><th>耐力</th><th>爆發</th><th>穩定</th></tr></thead><tbody>';
    horses.forEach(function (h) {
        var s = stats[h.id];
        html += '<tr>' +
            '<td>' + h.name + ' (' + h.multiplier + 'x)</td>' +
            '<td>' + s.speed + '</td>' +
            '<td>' + s.stamina + '</td>' +
            '<td>' + s.explosive + '</td>' +
            '<td>' + s.consistency + '</td>' +
            '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
}

function renderRaceRank(metrics) {
    var rankList = document.getElementById('race-rank');
    if (!rankList) return;
    if (metrics.length === 0) {
        rankList.innerHTML = '<p style="color:#888;">等待開跑...</p>';
        return;
    }
    var sorted = metrics.slice().sort(function (a, b) { return parseFloat(a.finishTime) - parseFloat(b.finishTime); });
    var html = '<h3>本局排名</h3>';
    sorted.forEach(function (m, idx) {
        var horse = HORSES.find(function (h) { return h.id === m.horseId; });
        html += '<div class="rank-item">' + (idx + 1) + '. ' + horse.name + ' - ' + m.finishTime + 's (' + m.topSpeed + ' km/h)</div>';
    });
    rankList.innerHTML = html;
}

function resetRaceTrack() {
    for (var i = 1; i <= 6; i++) {
        var horse = document.getElementById('horse-' + i);
        if (horse) horse.style.left = '0%';
    }
}

function startRaceAnimation(winnerId, onComplete) {
    var duration = 4000;
    var start = Date.now();

    function animate() {
        var elapsed = Date.now() - start;
        var progress = Math.min(elapsed / duration, 1);

        for (var i = 1; i <= 6; i++) {
            var horse = document.getElementById('horse-' + i);
            if (!horse) continue;
            var isWinner = (i === winnerId);
            var speedVar = Math.sin(progress * Math.PI * 1.5 + i) * 5;
            var pos = progress * 90;
            if (!isWinner) pos *= (0.8 + (i * 0.02));
            pos += speedVar * (1 - progress);
            horse.style.left = Math.min(pos, 92) + '%';
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            if (onComplete) onComplete();
        }
    }
    animate();
}

function updatePendingHorseBetsUI() {
    var txLog = document.getElementById('tx-log');
    if (!txLog) return;
    if (pendingHorseBets.length === 0) {
        txLog.innerHTML = '';
        return;
    }
    var html = '<div style="font-size: 0.9em; color: #aaa; margin-top: 10px;">目前待開獎下注：<br/>';
    pendingHorseBets.forEach(function(b) {
        var horse = HORSES.find(function(h) { return h.id === b.horseId; });
        html += '第 ' + b.roundId + ' 局: ' + horse.name + ' (' + b.amount + ' ZXC)<br/>';
    });
    html += '</div>';
    txLog.innerHTML = html;
}

function startHorseDraw(roundId) {
    if (isRaceRunning) {
        setTimeout(function() { startHorseDraw(roundId); }, 2000);
        return;
    }
    isRaceRunning = true;

    var status = document.getElementById('status-msg');
    var result = simulateRaceDeterministic(roundId);

    if (status) {
        status.innerText = '🎬 第 ' + roundId + ' 局開跑中！';
        status.style.color = '#ffd36a';
    }

    resetRaceTrack();
    startRaceAnimation(result.winner.id, function () {
        var lastResult = document.getElementById('last-result');
        if (lastResult) {
            lastResult.innerText = '第 ' + roundId + ' 局冠軍：' + result.winner.name + ' (' + result.trackCondition + ')';
        }
        renderRaceRank(result.metrics);

        // 結算下注
        var roundBets = pendingHorseBets.filter(function(b) { return b.roundId === roundId; });
        pendingHorseBets = pendingHorseBets.filter(function(b) { return b.roundId !== roundId; });
        updatePendingHorseBetsUI();

        if (roundBets.length > 0) {
            var totalWon = 0;
            roundBets.forEach(function(b) {
                if (b.horseId === result.winner.id) {
                    totalWon += b.amount * result.winner.multiplier;
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
                status.innerText = '📣 第 ' + roundId + ' 局比賽結束';
                status.style.color = '#ffd36a';
            }
        }
        isRaceRunning = false;
    });
}

function updateHorseRoundHint() {
    var hint = document.getElementById('round-hint');
    var raceBtn = document.getElementById('race-btn');

    var now = Date.now();
    var roundId = Math.floor(now / HORSE_ROUND_MS);
    var closesAt = (roundId + 1) * HORSE_ROUND_MS;
    var bettingClosesAt = closesAt - HORSE_LOCK_MS;
    var isBettingOpen = now < bettingClosesAt;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));

    if (hint) {
        if (isBettingOpen) {
            hint.innerText = '固定開獎：第 ' + roundId + ' 局，' + secLeft + ' 秒後截止下注';
        } else {
            hint.innerText = '第 ' + roundId + ' 局截止下注，即將開跑（' + secLeft + ' 秒後下一局）';
        }
    }

    if (raceBtn) raceBtn.disabled = !isBettingOpen || isSubmitting;

    if (lastHorseRoundId !== null && lastHorseRoundId !== roundId) {
        var drawRoundId = lastHorseRoundId;
        lastHorseRoundId = roundId;
        startHorseDraw(drawRoundId);
    } else if (lastHorseRoundId === null) {
        lastHorseRoundId = roundId;
    }
}

function runRace() {
    if (isSubmitting) return;

    var amount = parseFloat(document.getElementById('bet-amount').value);
    var status = document.getElementById('status-msg');
    var raceBtn = document.getElementById('race-btn');
    var hBal = document.getElementById('header-balance');

    if (!window.selectedHorseId) {
        status.innerText = '請先選擇一匹馬';
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        status.innerText = '請輸入有效金額';
        return;
    }

    var now = Date.now();
    var roundId = Math.floor(now / HORSE_ROUND_MS);
    var closesAt = (roundId + 1) * HORSE_ROUND_MS;
    if (now >= closesAt - HORSE_LOCK_MS) {
        status.innerText = '⏳ 本局已停止下注，請等下一局';
        status.style.color = '#ffd36a';
        return;
    }

    isSubmitting = true;
    raceBtn.disabled = true;
    status.innerHTML = '<span class="loader"></span> 下注交易中...';
    status.style.color = '#ffcc00';

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/horse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            horseId: window.selectedHorseId,
            sessionId: user.sessionId
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.error) throw new Error(result.error);

        status.innerText = '✅ 下注成功！等待第 ' + result.roundId + ' 局開獎';
        status.style.color = '#00ff88';

        pendingHorseBets.push({
            amount: amount,
            horseId: window.selectedHorseId,
            roundId: result.roundId
        });
        updatePendingHorseBetsUI();

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });
    })
    .catch(function(e) {
        status.innerText = '❌ 錯誤: ' + e.message;
        status.style.color = 'red';
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
