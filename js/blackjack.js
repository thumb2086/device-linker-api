/* === 二十一點遊戲邏輯（樂觀更新優化版） === */

var blackjackInProgress = false;
var blackjackBetAmount = 0;
var blackjackIsSubmitting = false;

// 用於樂觀更新的前端牌組狀態
var optimisticPlayerCards = [];
var optimisticDealerCards = [];

function renderCardList(containerId, cards, isDealing) {
    var container = document.getElementById(containerId);
    if (!container) return;
    
    var existingCards = Array.from(container.querySelectorAll('.card'));
    var newCardElements = [];

    // 更新或新增卡牌
    cards.forEach(function(card, index) {
        var cardEl = existingCards[index];
        if (!cardEl) {
            cardEl = document.createElement('div');
            cardEl.className = 'card';
            container.appendChild(cardEl);
            if (isDealing) {
                cardEl.classList.add('deal-in');
                cardEl.style.animationDelay = (index * 100) + 'ms';
            }
        }
        newCardElements.push(cardEl);

        if (card.hidden) {
            cardEl.classList.add('back');
            cardEl.classList.remove('red');
            cardEl.innerText = '🂠';
        } else {
            cardEl.classList.remove('back');
            cardEl.classList.toggle('red', card.suit === '♥' || card.suit === '♦');
            cardEl.innerText = card.rank + card.suit;
        }
    });

    // 移除多餘的卡牌
    existingCards.slice(cards.length).forEach(c => c.remove());
}

function resetBoard() {
    blackjackInProgress = false;
    blackjackIsSubmitting = false;
    optimisticPlayerCards = [];
    optimisticDealerCards = [];
    document.getElementById('dealer-cards').innerHTML = '';
    document.getElementById('player-cards').innerHTML = '';
    document.getElementById('dealer-total').innerText = '0';
    document.getElementById('player-total').innerText = '0';
    setActionButtonsState(false);
}

function setActionButtonsState(inProgress) {
    var dealBtn = document.getElementById('deal-btn');
    var hitBtn = document.getElementById('hit-btn');
    var standBtn = document.getElementById('stand-btn');

    if(dealBtn) dealBtn.disabled = inProgress || blackjackIsSubmitting;
    if(hitBtn) hitBtn.disabled = !inProgress || blackjackIsSubmitting;
    if(standBtn) standBtn.disabled = !inProgress || blackjackIsSubmitting;
}

function applyActionAvailability(data) {
    if (!blackjackInProgress) return;
    var hitBtn = document.getElementById('hit-btn');
    var standBtn = document.getElementById('stand-btn');
    if (!hitBtn || !standBtn) return;

    hitBtn.disabled = blackjackIsSubmitting || (data && data.canHit === false);
    standBtn.disabled = blackjackIsSubmitting || (data && data.mustStand === true);
}

function updateBoard(data, isInitialDeal) {
    optimisticDealerCards = data.dealerCards || [];
    optimisticPlayerCards = data.playerCards || [];
    renderCardList('dealer-cards', optimisticDealerCards, isInitialDeal);
    renderCardList('player-cards', optimisticPlayerCards, isInitialDeal);
    document.getElementById('dealer-total').innerText = data.dealerTotal || 0;
    document.getElementById('player-total').innerText = data.playerTotal || 0;
    if(data.totalBet) {
        updateUI({ totalBet: data.totalBet, level: data.level });
    }
}

function startBlackjack() {
    if (blackjackIsSubmitting || blackjackInProgress) return;

    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }
    
    var currentBalance = getCurrentUserBalance();
    if (amount > currentBalance) {
        statusMsg.innerText = '❌ 餘額不足';
        return;
    }

    // --- Audio --- 
    if (window.audioManager) window.audioManager.play('bet');

    // --- Optimistic UI Update ---
    blackjackIsSubmitting = true;
    blackjackBetAmount = amount;
    setDisplayedBalance(currentBalance - amount);

    statusMsg.innerText = '發牌中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    
    optimisticPlayerCards = [{hidden: true}, {hidden: true}];
    optimisticDealerCards = [{hidden: true}, {hidden: true}];
    renderCardList('player-cards', optimisticPlayerCards, true);
    renderCardList('dealer-cards', optimisticDealerCards, true);
    
    blackjackInProgress = true;
    setActionButtonsState(true);
    if (window.audioManager) window.audioManager.play('deal_card');

    // --- Background Fetch ---
    fetch('/api/game?game=blackjack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', address: user.address, amount: amount, sessionId: user.sessionId })
    })
    .then(function(res) {
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '發牌失敗')});
        return res.json();
    })
    .then(function(result) {
        blackjackIsSubmitting = false;
        if (result.error) throw new Error(result.error);

        updateBoard(result, false); // Update with real cards

        if (result.status === 'in_progress') {
            setActionButtonsState(true);
            applyActionAvailability(result);
            statusMsg.innerText = result.mustStand ? '你已拿到 21 點，請按停牌結算' : '輪到你：選擇加牌或停牌';
            statusMsg.style.color = '#ffcc00';
        } else {
            finalizeBlackjack(result);
        }
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        resetBoard();
        setDisplayedBalance(currentBalance); // Rollback balance
    });
}

function playerHit() {
    if (!blackjackInProgress || blackjackIsSubmitting) return;

    // --- Audio ---
    if (window.audioManager) window.audioManager.play('deal_card');

    // --- Optimistic UI Update ---
    blackjackIsSubmitting = true;
    setActionButtonsState(true);
    var statusMsg = document.getElementById('status-msg');
    statusMsg.innerText = '要牌中...';
    statusMsg.style.color = '#ffcc00';

    optimisticPlayerCards.push({ hidden: true });
    renderCardList('player-cards', optimisticPlayerCards, true);

    // --- Background Fetch ---
    fetch('/api/game?game=blackjack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hit', address: user.address, sessionId: user.sessionId })
    })
    .then(function(res) { 
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '要牌失敗')});
        return res.json(); 
    })
    .then(function(result) {
        blackjackIsSubmitting = false;
        if (result.error) throw new Error(result.error);
        
        updateBoard(result, false);

        if (result.status === 'in_progress') {
            setActionButtonsState(true);
            applyActionAvailability(result);
            statusMsg.innerText = result.mustStand ? '你已拿到 21 點，請按停牌結算' : '輪到你：選擇加牌或停牌';
        } else {
            finalizeBlackjack(result);
        }
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        blackjackIsSubmitting = false;
        // Rollback optimistic hit
        optimisticPlayerCards.pop();
        renderCardList('player-cards', optimisticPlayerCards, false);
        setActionButtonsState(true); // Re-enable buttons
    });
}

function playerStand() {
    if (!blackjackInProgress || blackjackIsSubmitting) return;

    // --- Optimistic UI Update ---
    blackjackIsSubmitting = true;
    setActionButtonsState(true);
    var statusMsg = document.getElementById('status-msg');
    statusMsg.innerText = '莊家回合...';
    statusMsg.style.color = '#ffcc00';

    // Optimistically reveal dealer's hole card if it exists
    if (optimisticDealerCards[1] && optimisticDealerCards[1].hidden) {
         if (window.audioManager) window.audioManager.play('deal_card');
    }

    // --- Background Fetch ---
    fetch('/api/game?game=blackjack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stand', address: user.address, sessionId: user.sessionId })
    })
    .then(function(res) { 
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '結算失敗')});
        return res.json();
    })
    .then(function(result) {
        blackjackIsSubmitting = false;
        if (result.error) throw new Error(result.error);
        
        // The result contains the final state, so we just show it.
        // A further enhancement could be to animate the dealer's draws.
        updateBoard(result, false);
        finalizeBlackjack(result);
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        blackjackIsSubmitting = false;
        setActionButtonsState(true); // Re-enable buttons for player to decide again
    });
}

function finalizeBlackjack(result) {
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');

    blackjackInProgress = false;
    blackjackIsSubmitting = false;
    setActionButtonsState(false);

    var finalBalance = getCurrentUserBalance();
    var winAmount = 0;

    if (result.isPush) {
        winAmount = blackjackBetAmount;
        statusMsg.innerText = '🤝 平手：退回本金';
        statusMsg.style.color = '#ffcc00';
        if (window.audioManager) window.audioManager.play('chip'); // Play a neutral chip sound for push
    } else if (result.isWin) {
        winAmount = blackjackBetAmount * (1 + result.multiplier);
        statusMsg.innerHTML = '🏆 你贏了！<span class="result-multiplier" style="display:inline;">' + result.multiplier + 'x</span>（' + result.shot + '）';
        statusMsg.style.color = '#00ff88';
        if (window.audioManager) window.audioManager.play(result.multiplier > 1 ? 'win_big' : 'win_small');
    } else {
        winAmount = 0;
        statusMsg.innerText = '💀 你輸了：' + result.reason;
        statusMsg.style.color = '#ff4444';
        // Optionally, play a losing sound
        // if (window.audioManager) window.audioManager.play('lose');
    }

    // We don't set the balance here optimistically, we wait for the server authoritative one.
    txLog.innerHTML = txLinkHTML(result.txHash);
    setTimeout(refreshBalance, 3000); // Sync balance from server
}
