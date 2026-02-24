/* === 二十一點遊戲邏輯 === */

function renderCardList(containerId, cards) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    cards.forEach(function (card) {
        var div = document.createElement('div');
        div.className = 'card';
        if (card.suit === '♥' || card.suit === '♦') {
            div.classList.add('red');
        }
        div.innerText = card.rank + card.suit;
        container.appendChild(div);
    });
}

function resetBoard() {
    document.getElementById('dealer-cards').innerHTML = '';
    document.getElementById('player-cards').innerHTML = '';
    document.getElementById('dealer-total').innerText = '0';
    document.getElementById('player-total').innerText = '0';
}

function playBlackjack() {
    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var dealBtn = document.getElementById('deal-btn');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }

    dealBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 交易確認中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetBoard();

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/blackjack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            sessionId: user.sessionId
        })
    })
    .then(function (res) { return res.json(); })
    .then(function (result) {
        if (result.error) throw new Error(result.error);
        statusMsg.innerHTML = '<span class="loader"></span> 開獎中...';
        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

        setTimeout(function () {
            renderCardList('dealer-cards', result.dealerCards);
            renderCardList('player-cards', result.playerCards);
            document.getElementById('dealer-total').innerText = result.dealerTotal;
            document.getElementById('player-total').innerText = result.playerTotal;

            if (result.isWin) {
                var profit = amount * result.multiplier;
                var newBalance = tempBalance + amount + profit;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

                statusMsg.innerHTML = '🏆 你贏了！<span class="result-multiplier" style="display:inline;">' + result.multiplier + 'x</span>（' + result.reason + '）';
                statusMsg.style.color = '#00ff88';
            } else {
                statusMsg.innerText = '💀 你輸了：' + result.reason;
                statusMsg.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            dealBtn.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 900);
    })
    .catch(function (e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        dealBtn.disabled = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}
