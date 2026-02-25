/* === 二十一點遊戲邏輯 === */

var blackjackInProgress = false;
var blackjackBetAmount = 0;
var blackjackTempBalance = 0;
var blackjackCurrentBalance = 0;

function renderCardList(containerId, cards) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    cards.forEach(function (card) {
        var div = document.createElement('div');
        div.className = 'card';
        if (card.hidden) {
            div.classList.add('back');
            div.innerText = '🂠';
        } else {
            if (card.suit === '♥' || card.suit === '♦') {
                div.classList.add('red');
            }
            div.innerText = card.rank + card.suit;
        }
        container.appendChild(div);
    });
}

function resetBoard() {
    document.getElementById('dealer-cards').innerHTML = '';
    document.getElementById('player-cards').innerHTML = '';
    document.getElementById('dealer-total').innerText = '0';
    document.getElementById('player-total').innerText = '0';
}

function setActionButtonsState(inProgress) {
    var dealBtn = document.getElementById('deal-btn');
    var hitBtn = document.getElementById('hit-btn');
    var standBtn = document.getElementById('stand-btn');

    dealBtn.disabled = inProgress;
    hitBtn.disabled = !inProgress;
    standBtn.disabled = !inProgress;
}

function updateBoard(data) {
    renderCardList('dealer-cards', data.dealerCards || []);
    renderCardList('player-cards', data.playerCards || []);
    document.getElementById('dealer-total').innerText = data.dealerTotal || 0;
    document.getElementById('player-total').innerText = data.playerTotal || 0;
    updateUI({ totalBet: data.totalBet, vipLevel: data.vipLevel });
}

function startBlackjack() {
    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }

    statusMsg.innerHTML = '<span class="loader"></span> 發牌中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetBoard();

    blackjackCurrentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    blackjackBetAmount = amount;
    blackjackTempBalance = blackjackCurrentBalance - amount;

    document.getElementById('balance-val').innerText = blackjackTempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = blackjackTempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/blackjack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'start',
            address: user.address,
            amount: amount,
            sessionId: user.sessionId
        })
    })
    .then(function (res) { return res.json(); })
    .then(function (result) {
        if (result.error) throw new Error(result.error);

        updateBoard(result);

        if (result.status === 'in_progress') {
            blackjackInProgress = true;
            setActionButtonsState(true);
            statusMsg.innerText = '你的回合：選擇要牌或停牌';
            statusMsg.style.color = '#ffcc00';
            return;
        }

        finalizeBlackjack(result);
    })
    .catch(function (e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        setActionButtonsState(false);
        restoreOptimisticBalance();
    });
}

function playerHit() {
    if (!blackjackInProgress) return;
    var statusMsg = document.getElementById('status-msg');
    statusMsg.innerHTML = '<span class="loader"></span> 要牌中...';
    statusMsg.style.color = '#ffcc00';

    fetch('/api/blackjack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'hit',
            address: user.address,
            sessionId: user.sessionId
        })
    })
    .then(function (res) { return res.json(); })
    .then(function (result) {
        if (result.error) throw new Error(result.error);
        updateBoard(result);

        if (result.status === 'in_progress') {
            statusMsg.innerText = '你的回合：選擇要牌或停牌';
            statusMsg.style.color = '#ffcc00';
            return;
        }

        finalizeBlackjack(result);
    })
    .catch(function (e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        blackjackInProgress = false;
        setActionButtonsState(false);
        setTimeout(refreshBalance, 1000);
    });
}

function playerStand() {
    if (!blackjackInProgress) return;
    var statusMsg = document.getElementById('status-msg');
    statusMsg.innerHTML = '<span class="loader"></span> 莊家補牌中...';
    statusMsg.style.color = '#ffcc00';

    fetch('/api/blackjack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'stand',
            address: user.address,
            sessionId: user.sessionId
        })
    })
    .then(function (res) { return res.json(); })
    .then(function (result) {
        if (result.error) throw new Error(result.error);
        updateBoard(result);
        finalizeBlackjack(result);
    })
    .catch(function (e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        blackjackInProgress = false;
        setActionButtonsState(false);
        setTimeout(refreshBalance, 1000);
    });
}

function finalizeBlackjack(result) {
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var hBal = document.getElementById('header-balance');

    blackjackInProgress = false;
    setActionButtonsState(false);

    if (result.isPush) {
        var pushBalance = blackjackTempBalance + blackjackBetAmount;
        document.getElementById('balance-val').innerText = pushBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = pushBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        statusMsg.innerText = '🤝 平手：退回本金';
        statusMsg.style.color = '#ffcc00';
    } else if (result.isWin) {
        var profit = blackjackBetAmount * result.multiplier;
        var newBalance = blackjackTempBalance + blackjackBetAmount + profit;
        document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        statusMsg.innerHTML = '🏆 你贏了！<span class="result-multiplier" style="display:inline;">' + result.multiplier + 'x</span>（' + result.reason + '）';
        statusMsg.style.color = '#00ff88';
    } else {
        statusMsg.innerText = '💀 你輸了：' + result.reason;
        statusMsg.style.color = '#ff4444';
    }

    txLog.innerHTML = txLinkHTML(result.txHash);
    setTimeout(refreshBalance, 6000);
}

function restoreOptimisticBalance() {
    document.getElementById('balance-val').innerText = blackjackCurrentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = blackjackCurrentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
}
