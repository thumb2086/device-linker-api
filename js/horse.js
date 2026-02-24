/* === 賽馬遊戲邏輯 === */

var selectedHorseId = 1;
var horseMultipliers = {
    1: 1.6,
    2: 2.0,
    3: 2.5,
    4: 3.5
};
var horseProfiles = {
    1: { name: '赤焰', speed: 92, stamina: 88, burst: 86 },
    2: { name: '雷霆', speed: 89, stamina: 90, burst: 84 },
    3: { name: '幻影', speed: 86, stamina: 84, burst: 91 },
    4: { name: '夜刃', speed: 82, stamina: 80, burst: 94 }
};

function selectHorse(horseId) {
    selectedHorseId = horseId;
    document.querySelectorAll('.horse-choice').forEach(function (el) {
        el.classList.toggle('active', Number(el.dataset.horseId) === horseId);
    });
}

function resetRaceTrack() {
    for (var i = 1; i <= 4; i++) {
        var horse = document.getElementById('horse-' + i);
        horse.style.left = '34px';
        horse.classList.remove('winner');
    }
}

function animateRace(raceMetrics) {
    for (var i = 1; i <= 4; i++) {
        var horse = document.getElementById('horse-' + i);
        var metric = raceMetrics.find(function (m) { return m.id === i; });
        var base = 60 + Math.floor(Math.random() * 16);
        if (metric && metric.rank === 1) base = 89;
        else if (metric && metric.rank === 2) base = 84;
        else if (metric && metric.rank === 3) base = 78;
        else if (metric && metric.rank === 4) base = 72;
        horse.style.left = base + '%';
    }
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

function runRace() {
    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var raceBtn = document.getElementById('race-btn');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }

    raceBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 交易確認中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetRaceTrack();

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/horse', {
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
        statusMsg.innerHTML = '<span class="loader"></span> 開獎中...';
        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });
        document.getElementById('track-cond').innerText = '場地：' + (result.trackCondition || '-');
        renderHorseDataTable(result.horses, result.horseStats);
        renderRaceRank(result.raceMetrics);

        animateRace(result.raceMetrics || []);

        setTimeout(function () {
            var winner = document.getElementById('horse-' + result.winnerId);
            winner.classList.add('winner');

            if (result.isWin) {
                var mult = horseMultipliers[result.selectedHorseId] || result.multiplier;
                var profit = amount * mult;
                var newBalance = tempBalance + amount + profit;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                statusMsg.innerHTML = '🏆 你的 ' + result.selectedHorseName + ' 奪冠！<span class="result-multiplier" style="display:inline;">' + mult + 'x</span>';
                statusMsg.style.color = '#00ff88';
            } else {
                statusMsg.innerText = '💀 冠軍是 ' + result.winnerName + '，下次再來！';
                statusMsg.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            raceBtn.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 1900);
    })
    .catch(function (e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        raceBtn.disabled = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}

window.addEventListener('load', function () {
    selectHorse(1);
    var initialHorses = [
        { id: 1, name: horseProfiles[1].name, multiplier: horseMultipliers[1], speed: horseProfiles[1].speed, stamina: horseProfiles[1].stamina, burst: horseProfiles[1].burst },
        { id: 2, name: horseProfiles[2].name, multiplier: horseMultipliers[2], speed: horseProfiles[2].speed, stamina: horseProfiles[2].stamina, burst: horseProfiles[2].burst },
        { id: 3, name: horseProfiles[3].name, multiplier: horseMultipliers[3], speed: horseProfiles[3].speed, stamina: horseProfiles[3].stamina, burst: horseProfiles[3].burst },
        { id: 4, name: horseProfiles[4].name, multiplier: horseMultipliers[4], speed: horseProfiles[4].speed, stamina: horseProfiles[4].stamina, burst: horseProfiles[4].burst }
    ];
    renderHorseDataTable(initialHorses, []);
    renderRaceRank([]);
});
