/* === 射龍門遊戲邏輯 === */

var dragonMode = 'classic';
var classicGateReady = false;
var dragonSideGuess = '';

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

function resetDragonSideGuess() {
    dragonSideGuess = '';
    var container = document.getElementById('dragon-side-guess');
    var lowerBtn = document.getElementById('guess-lower-btn');
    var higherBtn = document.getElementById('guess-higher-btn');
    if (container) container.classList.add('hidden');
    if (lowerBtn) {
        lowerBtn.classList.remove('active');
        lowerBtn.disabled = false;
        lowerBtn.innerText = '猜下';
    }
    if (higherBtn) {
        higherBtn.classList.remove('active');
        higherBtn.disabled = false;
        higherBtn.innerText = '猜上';
    }
}

function setDragonSideGuess(direction) {
    dragonSideGuess = direction === 'higher' ? 'higher' : 'lower';
    var lowerBtn = document.getElementById('guess-lower-btn');
    var higherBtn = document.getElementById('guess-higher-btn');
    if (lowerBtn) lowerBtn.classList.toggle('active', dragonSideGuess === 'lower');
    if (higherBtn) higherBtn.classList.toggle('active', dragonSideGuess === 'higher');
}

function applyDragonSideGuessOptions(result) {
    resetDragonSideGuess();
    if (!result || !result.requiresSideGuess) return;

    var container = document.getElementById('dragon-side-guess');
    var lowerBtn = document.getElementById('guess-lower-btn');
    var higherBtn = document.getElementById('guess-higher-btn');
    var lower = result.sideOptions && result.sideOptions.lower ? result.sideOptions.lower : null;
    var higher = result.sideOptions && result.sideOptions.higher ? result.sideOptions.higher : null;

    if (container) container.classList.remove('hidden');
    if (lowerBtn && lower) {
        lowerBtn.disabled = !lower.enabled;
        lowerBtn.innerText = lower.enabled ? ('猜下 ' + lower.multiplier + 'x') : '猜下不可選';
    }
    if (higherBtn && higher) {
        higherBtn.disabled = !higher.enabled;
        higherBtn.innerText = higher.enabled ? ('猜上 ' + higher.multiplier + 'x') : '猜上不可選';
    }

    if (lower && lower.enabled && !(higher && higher.enabled)) {
        setDragonSideGuess('lower');
    } else if (higher && higher.enabled && !(lower && lower.enabled)) {
        setDragonSideGuess('higher');
    }
}

function setDragonMode() {
    dragonMode = 'classic';
    classicGateReady = false;
    resetTable();
    resetDragonSideGuess();

    var classicBtn = document.getElementById('mode-classic');
    var shootBtn = document.getElementById('shoot-btn');
    var statusMsg = document.getElementById('status-msg');

    if (classicBtn) classicBtn.classList.add('active');
    shootBtn.innerText = '發門';
    statusMsg.innerText = '傳統模式：先發門，再下注開槍（未結算前不可重發）';
    statusMsg.style.color = '#ffcc00';
}

function drawClassicGate() {
    if (classicGateReady) return;

    var statusMsg = document.getElementById('status-msg');
    var shootBtn = document.getElementById('shoot-btn');
    var txLog = document.getElementById('tx-log');

    shootBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 發門中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetTable();

    fetch('/api/game?game=dragon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
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
        applyDragonSideGuessOptions(result);
        classicGateReady = true;
        shootBtn.innerText = '開槍';
        statusMsg.innerText = result.requiresSideGuess
            ? '無門寬：請先選擇猜上或猜下，再下注開槍'
            : ('門已開：倍數 ' + result.multiplier + 'x，請輸入下注後開槍');
        statusMsg.style.color = '#ffcc00';
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 發門失敗: ' + e.message;
        statusMsg.style.color = 'red';
    })
    .finally(function() {
        shootBtn.disabled = false;
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
    var shotCard = document.getElementById('card-shot');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }
    if (!classicGateReady) {
        statusMsg.innerText = '❌ 請先發門';
        return;
    }
    var guessContainer = document.getElementById('dragon-side-guess');
    if (guessContainer && !guessContainer.classList.contains('hidden') && !dragonSideGuess) {
        statusMsg.innerText = '❌ 此局沒有門寬，請先選擇猜上或猜下';
        return;
    }

    shootBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 交易確認中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetTable();

    var currentBalance = getCurrentUserBalance();
    var tempBalance = currentBalance - amount;
    setDisplayedBalance(tempBalance);

    fetch('/api/game?game=dragon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            sessionId: user.sessionId,
            mode: dragonMode,
            action: 'shoot',
            sideGuess: dragonSideGuess || undefined
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
                var newBalance = tempBalance + (amount * result.multiplier);
                setDisplayedBalance(newBalance);
                statusMsg.innerHTML = '🏆 命中龍門！<span class="result-multiplier" style="display:inline;">' + result.multiplier + 'x</span>';
                statusMsg.style.color = '#00ff88';
            } else if (result.resultType === 'pillar') {
                var pillarBalance = tempBalance - amount; // 再扣一注，總共雙倍
                setDisplayedBalance(pillarBalance);
                statusMsg.innerText = '💥 撞柱！雙倍扣注';
                statusMsg.style.color = '#ff4444';
            } else {
                statusMsg.innerText = '💀 沒有進門，下次再來！';
                statusMsg.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            classicGateReady = false;
            resetDragonSideGuess();
            shootBtn.innerText = '發門';
            shootBtn.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 900);
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        classicGateReady = false;
        resetDragonSideGuess();
        shootBtn.innerText = '發門';
        shootBtn.disabled = false;
        setDisplayedBalance(currentBalance);
    });
}

window.addEventListener('load', function () {
    setDragonMode();
});
