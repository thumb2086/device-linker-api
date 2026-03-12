/* === 龍虎遊戲邏輯（樂觀更新優化版） === */

var dragonMode = 'classic';
var classicGateReady = false;
var dragonSideGuess = '';
var isSubmitting = false;

function renderCard(el, card, isDealing) {
    if (!el) return;
    el.classList.remove('red', 'opened', 'deal-in');
    if (isDealing) {
        el.classList.add('deal-in');
    }

    if (!card || card.hidden) {
        el.innerText = '🂠';
        el.classList.add('back');
    } else {
        el.innerText = card.rank + card.suit;
        el.classList.remove('back');
        if (card.suit === "♥" || card.suit === "♦") {
            el.classList.add('red');
        }
    }
}

function resetTable() {
    var left = document.getElementById('card-left');
    var right = document.getElementById('card-right');
    var shot = document.getElementById('card-shot');

    renderCard(left, null);
    renderCard(right, null);
    renderCard(shot, null);
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
    if (isSubmitting) return;
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
    isSubmitting = false;
    resetTable();
    resetDragonSideGuess();

    var shootBtn = document.getElementById('shoot-btn');
    var statusMsg = document.getElementById('status-msg');

    shootBtn.innerText = '發門';
    shootBtn.disabled = false;
    statusMsg.innerText = '傳統模式：先發門，再下注開槍';
    statusMsg.style.color = '#ffcc00';
}

function drawClassicGate() {
    if (classicGateReady || isSubmitting) return;

    var statusMsg = document.getElementById('status-msg');
    var shootBtn = document.getElementById('shoot-btn');
    var txLog = document.getElementById('tx-log');

    // --- Optimistic UI Update ---
    isSubmitting = true;
    shootBtn.disabled = true;
    statusMsg.innerText = '發門中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetDragonSideGuess();

    renderCard(document.getElementById('card-left'), { hidden: true }, true);
    renderCard(document.getElementById('card-right'), { hidden: true }, true);
    renderCard(document.getElementById('card-shot'), null);
    if(window.audioManager) window.audioManager.play('card_deal');

    // --- Background Fetch ---
    fetch('/api/game?game=dragon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.address, sessionId: user.sessionId, mode: 'classic', action: 'gate' })
    })
    .then(function(res) {
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '發門失敗') });
        return res.json();
    })
    .then(function(result) {
        if (result.error) throw new Error(result.error);
        
        // Reveal the cards
        renderCard(document.getElementById('card-left'), result.gate.left);
        renderCard(document.getElementById('card-right'), result.gate.right);
        if(window.audioManager) window.audioManager.play('card_flip');

        applyDragonSideGuessOptions(result);
        classicGateReady = true;
        shootBtn.innerText = '開槍';
        statusMsg.innerText = result.requiresSideGuess
            ? '無門寬：請先選擇猜上或猜下，再下注開槍'
            : ('門已開：倍數 ' + result.multiplier + 'x，請輸入下注後開槍');
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 發門失敗: ' + e.message;
        statusMsg.style.color = 'red';
        resetTable();
    })
    .finally(function() {
        isSubmitting = false;
        shootBtn.disabled = false;
    });
}

function playDragon() {
    if (dragonMode === 'classic' && !classicGateReady) {
        drawClassicGate();
        return;
    }
    if (isSubmitting) return;

    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var shootBtn = document.getElementById('shoot-btn');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額'; return;
    }
    if (!classicGateReady) {
        statusMsg.innerText = '❌ 請先發門'; return;
    }
    var guessContainer = document.getElementById('dragon-side-guess');
    if (guessContainer && !guessContainer.classList.contains('hidden') && !dragonSideGuess) {
        statusMsg.innerText = '❌ 此局沒有門寬，請先選擇猜上或猜下'; return;
    }
    var currentBalance = getCurrentUserBalance();
    if (amount > currentBalance) {
        statusMsg.innerText = '❌ 餘額不足'; return;
    }

    // --- Optimistic UI Update ---
    isSubmitting = true;
    shootBtn.disabled = true;
    statusMsg.innerText = '開槍！';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    setDisplayedBalance(currentBalance - amount);

    var shotCardEl = document.getElementById('card-shot');
    renderCard(shotCardEl, { hidden: true }, true);
    if(window.audioManager) window.audioManager.play('card_deal_short');

    // --- Background Fetch ---
    fetch('/api/game?game=dragon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.address, amount: amount, sessionId: user.sessionId, mode: dragonMode, action: 'shoot', sideGuess: dragonSideGuess || undefined })
    })
    .then(function(res) {
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '開槍失敗') });
        return res.json();
    })
    .then(function(result) {
        if (result.error) throw new Error(result.error);

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

        // Reveal gate cards from server to be safe
        renderCard(document.getElementById('card-left'), result.gate.left);
        renderCard(document.getElementById('card-right'), result.gate.right);

        // Animate the shot card reveal
        setTimeout(function() {
            renderCard(shotCardEl, result.shot);
            shotCardEl.classList.add('opened');
            if(window.audioManager) window.audioManager.play('card_flip');

            if (result.resultType === 'win') {
                statusMsg.innerHTML = '🏆 命中龍門！<span class="result-multiplier" style="display:inline;">' + result.multiplier + 'x</span>';
                statusMsg.style.color = '#00ff88';
                if (window.audioManager) window.audioManager.play('win_small');
            } else if (result.resultType === 'pillar') {
                statusMsg.innerText = '💥 撞柱！雙倍扣注';
                statusMsg.style.color = '#ff4444';
            } else {
                statusMsg.innerText = '💀 沒有進門，下次再來！';
                statusMsg.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            setTimeout(refreshBalance, 3000);

        }, 500); // Delay for effect

    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        setDisplayedBalance(currentBalance); // Rollback
        resetTable();
    })
    .finally(function() {
        classicGateReady = false;
        isSubmitting = false;
        resetDragonSideGuess();
        shootBtn.innerText = '發門';
        shootBtn.disabled = false;
    });
}

window.addEventListener('load', function () {
    setDragonMode();
});
