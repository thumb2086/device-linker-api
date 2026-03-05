/* === 老虎機遊戲邏輯 === */

var SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
var SYMBOLS_PER_REEL = 30; // 符號帶長度
var isSpinning = false;

/**
 * 動態取得符號高度 (配合 RWD)
 */
function getSymbolHeight() {
    var el = document.querySelector('.reel-symbol');
    if (el) return el.offsetHeight;
    return window.innerWidth <= 420 ? 80 : 90;
}

/**
 * 建立轉輪符號帶
 */
function buildReels() {
    for (var r = 1; r <= 3; r++) {
        var strip = document.getElementById('reel-' + r);
        strip.innerHTML = '';
        for (var i = 0; i < SYMBOLS_PER_REEL; i++) {
            var div = document.createElement('div');
            div.className = 'reel-symbol';
            div.textContent = SLOT_SYMBOLS[i % SLOT_SYMBOLS.length];
            strip.appendChild(div);
        }
        // 初始位置：顯示第一個符號在中間行
        strip.style.transform = 'translateY(0px)';
    }
}

/**
 * 開始旋轉動畫
 */
function startSpinAnimation() {
    for (var r = 1; r <= 3; r++) {
        var strip = document.getElementById('reel-' + r);
        strip.classList.add('spinning');
        strip.dataset.spinPos = '0';
        animateReel(strip);
    }
}

/**
 * 單個轉輪的快速旋轉動畫 (requestAnimationFrame)
 */
function animateReel(strip) {
    if (!strip.classList.contains('spinning')) return;

    var pos = parseFloat(strip.dataset.spinPos || 0);
    pos -= 30; // 每幀移動 px
    // 循環：超過整個符號帶長度就重置
    var totalHeight = SYMBOLS_PER_REEL * getSymbolHeight();
    if (Math.abs(pos) >= totalHeight) {
        pos = 0;
    }
    strip.dataset.spinPos = pos;
    strip.style.transform = 'translateY(' + pos + 'px)';

    requestAnimationFrame(function() { animateReel(strip); });
}

/**
 * 停止某個轉輪並定位到目標符號
 */
function stopReel(reelNum, targetEmoji, callback) {
    var strip = document.getElementById('reel-' + reelNum);
    strip.classList.remove('spinning');

    // 找到目標符號的索引
    var targetIndex = SLOT_SYMBOLS.indexOf(targetEmoji);
    if (targetIndex === -1) targetIndex = 0;

    // 計算目標位置：讓目標符號出現在中間（第2行）
    // 中間行 = 第1個位置 (0-indexed), 所以 offset = targetIndex * SYMBOL_HEIGHT
    // 但我們要在 reel 的 270px 高度中，讓目標出現在中間的 90px
    // 頂部顯示 targetIndex-1, 中間顯示 targetIndex, 底部顯示 targetIndex+1
    // 所以 translateY = -(targetIndex - 1) * SYMBOL_HEIGHT (如果 targetIndex > 0)
    // 為了要有多一些視覺位移，加上偏移
    var extraLoops = (3 + reelNum) * SLOT_SYMBOLS.length; // 多轉幾圈
    var finalIndex = extraLoops + targetIndex;

    // 確保 strip 有足夠的符號
    while (strip.children.length < finalIndex + 3) {
        var div = document.createElement('div');
        div.className = 'reel-symbol';
        div.textContent = SLOT_SYMBOLS[strip.children.length % SLOT_SYMBOLS.length];
        strip.appendChild(div);
    }

    // 目標：讓 finalIndex 的符號出現在中間（offset = 1 symbol from top）
    var targetY = -(finalIndex - 1) * getSymbolHeight();

    strip.style.transform = 'translateY(' + targetY + 'px)';

    // 等待過渡完成 (防止 callback 重複觸發)
    var called = false;
    function onEnd() {
        if (called) return;
        called = true;
        strip.removeEventListener('transitionend', onEnd);
        if (callback) callback();
    }
    strip.addEventListener('transitionend', onEnd);
    setTimeout(onEnd, 800);
}

/**
 * 執行旋轉
 */
function spin() {
    if (isSpinning) return;

    var amountInput = document.getElementById('bet-amount');
    var amount = parseFloat(amountInput.value);
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var spinBtn = document.getElementById('spin-btn');
    var payline = document.getElementById('payline');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }

    isSpinning = true;
    spinBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 交易確認中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    payline.classList.remove('win');

    // 重建轉輪 (重置位置)
    buildReels();

    // 樂觀更新餘額
    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    // 開始旋轉動畫
    setTimeout(function() {
        startSpinAnimation();
    }, 50);

    // 同時打 API
    fetch('/api/game?game=slots', {
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

        var reelEmojis = result.reels.map(function(r) { return r.emoji; });

        // 確保最少轉 1.5 秒後才停
        var minSpinTime = 1500;
        var stopDelay = 500; // 每個轉輪間隔

        setTimeout(function() {
            // 依序停止轉輪
            stopReel(1, reelEmojis[0], function() {
                setTimeout(function() {
                    stopReel(2, reelEmojis[1], function() {
                        setTimeout(function() {
                            stopReel(3, reelEmojis[2], function() {
                                // 所有轉輪停止，顯示結果
                                showResult(result, amount, tempBalance);
                            });
                        }, stopDelay);
                    });
                }, stopDelay);
            });
        }, minSpinTime);
    })
    .catch(function(e) {
        console.error(e);
        // 停止旋轉
        for (var r = 1; r <= 3; r++) {
            var strip = document.getElementById('reel-' + r);
            strip.classList.remove('spinning');
        }
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        isSpinning = false;
        spinBtn.disabled = false;
        document.getElementById('balance-val').innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    });
}

/**
 * 顯示遊戲結果
 */
function showResult(result, betAmount, tempBalance) {
    var statusMsg = document.getElementById('status-msg');
    var txLog = document.getElementById('tx-log');
    var spinBtn = document.getElementById('spin-btn');
    var payline = document.getElementById('payline');
    var hBal = document.getElementById('header-balance');

    updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

    if (result.resultType === 'triple') {
        payline.classList.add('win');

        var profitAmount = betAmount * result.multiplier;
        var displayMultiplier = result.multiplier + 'x';

        statusMsg.innerHTML = '🏆 三連線！' +
            ' <span class="result-multiplier" style="display:inline;">' + displayMultiplier + '</span>';
        statusMsg.style.color = '#00ff88';

        // 贏了：本金還在 + 利潤
        var newBalance = tempBalance + betAmount + profitAmount;
        document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    } else if (result.resultType === 'double') {
        payline.classList.add('win');
        statusMsg.innerHTML = '⭐ 兩連線，返還 <span class="result-multiplier" style="display:inline;">0.5x</span>';
        statusMsg.style.color = '#ffcc00';

        // 下注已先扣，兩連只返還半注
        var halfBackBalance = tempBalance + (betAmount * 0.5);
        document.getElementById('balance-val').innerText = halfBackBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = halfBackBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    } else {
        statusMsg.innerText = '💀 沒有連線，下次好運！';
        statusMsg.style.color = '#ff4444';
    }

    txLog.innerHTML = txLinkHTML(result.txHash);

    isSpinning = false;
    spinBtn.disabled = false;
    setTimeout(refreshBalance, 10000);
}
