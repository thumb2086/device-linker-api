/* === 猜硬幣遊戲邏輯 === */

function play(choice) {
    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var status = document.getElementById('status-msg');
    var coin = document.getElementById('main-coin');
    var txLog = document.getElementById('tx-log');
    var btn1 = document.getElementById('play-btn');
    var btn2 = document.getElementById('play-btn-2');

    if (isNaN(amount) || amount <= 0) {
        status.innerText = '❌ 請輸入有效的金額';
        return;
    }

    btn1.disabled = true;
    btn2.disabled = true;
    status.innerHTML = '<span class="loader"></span> 區塊鏈交易中...';
    status.style.color = '#ffcc00';
    txLog.innerHTML = '';

    // 樂觀更新
    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    fetch('/api/coinflip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            choice: choice,
            sessionId: user.sessionId
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.error) throw new Error(result.error);

        var baseRotation = 1800;
        var targetRotation = result.resultSide === 'heads' ? baseRotation : baseRotation + 180;

        coin.style.transition = 'transform 3s cubic-bezier(0.1, 0.8, 0.2, 1)';
        coin.style.transform = 'rotateY(' + targetRotation + 'deg)';

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

        setTimeout(function() {
            coin.style.transition = 'none';
            coin.style.transform = result.resultSide === 'heads' ? 'rotateY(0deg)' : 'rotateY(180deg)';

            if (result.isWin) {
                status.innerText = '🏆 恭喜！你贏了！';
                status.style.color = '#00ff88';
                var winAmount = amount * 1.8;
                var newBalance = tempBalance + winAmount;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
            } else {
                status.innerText = '💀 可惜，下次好運！';
                status.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);

            btn1.disabled = false;
            btn2.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 3000);
    })
    .catch(function(e) {
        console.error(e);
        status.innerText = '❌ 錯誤: ' + e.message;
        status.style.color = 'red';
        btn1.disabled = false;
        btn2.disabled = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}
