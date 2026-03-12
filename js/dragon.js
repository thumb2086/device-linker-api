/* === 射龍門遊戲邏輯 === */

var dragonMode = 'quick'; // quick | classic
var classicGateReady = false;

function renderCard(el, card) {
    if (!el || !card) return;
    el.innerText = card.rank + card.suit;
    if (card.suit === "♥" || card.suit === "♦") {
        el.classList.add('red');
    } else {
        el.classList.remove('red');
    }
}

function resetTable() {
    var left = document.getElementById('card-left');
    var right = document.getElementById('card-right');
    var shot = document.getElementById('card-shot');

    left.innerText = '?';
    right.innerText = '?';
    shot.innerText = '?';
    left.classList.remove('red');
    right.classList.remove('red');
    shot.classList.remove('red');
    shot.classList.remove('opened');
}

function setDragonMode(mode) {
    dragonMode = mode === 'classic' ? 'classic' : 'quick';
    classicGateReady = false;
    resetTable();

    var quickBtn = document.getElementById('mode-quick');
    var classicBtn = document.getElementById('mode-classic');
    var shootBtn = document.getElementById('shoot-btn');
    var redrawBtn = document.getElementById('redraw-btn');
    var statusMsg = document.getElementById('status-msg');

    quickBtn.classList.toggle('active', dragonMode === 'quick');
    classicBtn.classList.toggle('active', dragonMode === 'classic');

    if (dragonMode === 'classic') {
        shootBtn.innerText = '發門';
        redrawBtn.classList.add('hidden');
        statusMsg.innerText = '傳統模式：先發門，再決定下注開槍';
        statusMsg.style.color = '#ffcc00';
    } else {
        shootBtn.innerText = '開槍';
        redrawBtn.classList.add('hidden');
        statusMsg.innerText = '快節奏模式：下注後直接開獎';
        statusMsg.style.color = '#ffcc00';
    }
}

function drawClassicGate() {
    var statusMsg = document.getElementById('status-msg');
    var shootBtn = document.getElementById('shoot-btn');
    var redrawBtn = document.getElementById('redraw-btn');
    var txLog = document.getElementById('tx-log');

    shootBtn.disabled = true;
    redrawBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 發門中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetTable();

    fetch('/api/game?game=dragon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: user.sessionId,
            mode: 'classic',
            action: 'gate'
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.error) throw new Error(result.error);
        renderCard(document.getElementById('card-left'), result.gate.left);
        renderCard(document.getElementById('card-right'), result.gate.right);
        classicGateReady = true;
        shootBtn.innerText = '開槍';
        redrawBtn.classList.remove('hidden');
        statusMsg.innerText = '門已開：倍數 ' + result.multiplier + 'x，請下注後開槍';
        statusMsg.style.color = '#ffcc00';
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 發門失敗: ' + e.message;
        statusMsg.style.color = 'red';
    })
    .finally(function() {
        shootBtn.disabled = false;
        redrawBtn.disabled = false;
    });
}

function playDragon() {
    if (dragonMode === 'classic' && !classicGateReady) {
        drawClassicGate();
        return;
    }

    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var shootBtn = document.getElementById('shoot-btn');
    var redrawBtn = document.getElementById('redraw-btn');
    var shotCard = document.getElementById('card-shot');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }

    shootBtn.disabled = true;
    redrawBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 交易確認中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    if (dragonMode === 'quick') resetTable();

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/game?game=dragon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            sessionId: user.sessionId,
            mode: dragonMode,
            action: dragonMode === 'classic' ? 'shoot' : 'play'
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.error) throw new Error(result.error);

        statusMsg.innerHTML = '<span class="loader"></span> 開獎中...';
        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

        renderCard(document.getElementById('card-left'), result.gate.left);
        renderCard(document.getElementById('card-right'), result.gate.right);

        setTimeout(function() {
            renderCard(shotCard, result.shot);
            shotCard.classList.add('opened');

            if (result.resultType === 'win') {
                var profit = amount * result.multiplier;
                var newBalance = tempBalance + amount + profit;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                statusMsg.innerHTML = '🏆 命中龍門！<span class="result-multiplier" style="display:inline;">' + result.multiplier + 'x</span>';
                statusMsg.style.color = '#00ff88';
                emitWinBarrage({ game: '射龍門', amount: amount, payout: amount + profit, multiplier: result.multiplier });
            } else if (result.resultType === 'pillar') {
                var pillarBalance = tempBalance - amount; // 再扣一注，總共雙倍
                document.getElementById('balance-val').innerText = pillarBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = pillarBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                statusMsg.innerText = '💥 撞柱！雙倍扣注';
                statusMsg.style.color = '#ff4444';
            } else {
                statusMsg.innerText = '💀 沒有進門，下次再來！';
                statusMsg.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            if (dragonMode === 'classic') {
                classicGateReady = false;
                shootBtn.innerText = '發門';
                redrawBtn.classList.add('hidden');
            }
            shootBtn.disabled = false;
            redrawBtn.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 900);
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        if (dragonMode === 'classic') {
            classicGateReady = false;
            shootBtn.innerText = '發門';
            redrawBtn.classList.add('hidden');
        }
        shootBtn.disabled = false;
        redrawBtn.disabled = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}

window.addEventListener('load', function () {
    setDragonMode('quick');
});
