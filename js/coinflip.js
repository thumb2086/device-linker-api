/* === 猜硬幣遊戲邏輯 === */

var COINFLIP_ROUND_MS = 20000;

function updateCoinflipRoundHint() {
    var hint = document.getElementById('round-hint');
    if (!hint) return;

    var now = Date.now();
    var roundId = Math.floor(now / COINFLIP_ROUND_MS);
    var closesAt = (roundId + 1) * COINFLIP_ROUND_MS;
    var secLeft = Math.max(0, Math.ceil((closesAt - now) / 1000));
    hint.innerText = '固定開獎：第 ' + roundId + ' 局，' + secLeft + ' 秒後切下一局';
}

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
    status.innerHTML = '<span class="loader"></span> 交易確認中...';
    status.style.color = '#ffcc00';
    txLog.innerHTML = '';

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
        status.innerHTML = '<span class="loader"></span> 第 ' + result.roundId + ' 局開獎中...';

        var baseRotation = 1800;
        var targetRotation = result.resultSide === 'heads' ? baseRotation : baseRotation + 180;

        coin.style.transition = 'transform 3s cubic-bezier(0.1, 0.8, 0.2, 1)';
        coin.style.transform = 'rotateY(' + targetRotation + 'deg)';

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

        setTimeout(function() {
            coin.style.transition = 'none';
            coin.style.transform = result.resultSide === 'heads' ? 'rotateY(0deg)' : 'rotateY(180deg)';

            if (result.isWin) {
                status.innerText = '🏆 第 ' + result.roundId + ' 局中獎！';
                status.style.color = '#00ff88';
                var winAmount = amount * 1.8;
                var newBalance = tempBalance + winAmount;
                document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
            } else {
                status.innerText = '💀 第 ' + result.roundId + ' 局未中獎';
                status.style.color = '#ff4444';
            }

            txLog.innerHTML = txLinkHTML(result.txHash);
            btn1.disabled = false;
            btn2.disabled = false;
            setTimeout(refreshBalance, 10000);
        }, 3000);
    })
    .catch(function(e) {
        status.innerText = '❌ 錯誤: ' + e.message;
        status.style.color = 'red';
        btn1.disabled = false;
        btn2.disabled = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}

window.addEventListener('load', function () {
    updateCoinflipRoundHint();
    setInterval(updateCoinflipRoundHint, 1000);
});
