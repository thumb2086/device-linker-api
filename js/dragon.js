/* === 射龍門遊戲邏輯 === */

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

function playDragon() {
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

    shootBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 交易確認中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    resetTable();

    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/dragon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            sessionId: user.sessionId
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

            if (result.isWin) {
                var profit = amount * result.multiplier;
                var newBalance = tempBalance + amount + profit;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                statusMsg.innerHTML = '🏆 命中龍門！<span class="result-multiplier" style="display:inline;">' + result.multiplier + 'x</span>';
                statusMsg.style.color = '#00ff88';
            } else {
                statusMsg.innerText = '💀 沒有進門，下次再來！';
                statusMsg.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            shootBtn.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 900);
    })
    .catch(function(e) {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        shootBtn.disabled = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}
