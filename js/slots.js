/* === 老虎機遊戲邏輯 === */

var SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
var SYMBOLS_PER_REEL = 30; // 符號帶長度
var isSpinning = false;

// 自動旋轉相關變數
var isAutoSpinning = false;
var autoSpinsLeft = 0;
var reelSoundId = null;

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
        strip.style.transform = 'translateY(0px)';
    }
}

/**
 * 切換自動旋轉
 */
function toggleAutoSpin() {
    var btn = document.getElementById('auto-btn');
    var countSelect = document.getElementById('auto-count');
    
    if (isAutoSpinning) {
        stopAutoSpin();
    } else {
        isAutoSpinning = true;
        autoSpinsLeft = parseInt(countSelect.value);
        btn.innerText = '🛑 停止自動 (' + (autoSpinsLeft > 1000 ? '∞' : autoSpinsLeft) + ')';
        btn.classList.add('active');
        
        // 如果目前沒在轉，立即開始第一轉
        if (!isSpinning) spin();
    }
    
    if (window.audioManager) window.audioManager.play('click');
}

function stopAutoSpin() {
    isAutoSpinning = false;
    autoSpinsLeft = 0;
    var btn = document.getElementById('auto-btn');
    btn.innerText = '🔄 自動旋轉 (關閉)';
    btn.classList.remove('active');
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

    if (window.audioManager) window.audioManager.play('slot_stop');

    var targetIndex = SLOT_SYMBOLS.indexOf(targetEmoji);
    if (targetIndex === -1) targetIndex = 0;

    var extraLoops = (3 + reelNum) * SLOT_SYMBOLS.length; 
    var finalIndex = extraLoops + targetIndex;

    while (strip.children.length < finalIndex + 3) {
        var div = document.createElement('div');
        div.className = 'reel-symbol';
        div.textContent = SLOT_SYMBOLS[strip.children.length % SLOT_SYMBOLS.length];
        strip.appendChild(div);
    }

    var targetY = -(finalIndex - 1) * getSymbolHeight();
    strip.style.transform = 'translateY(' + targetY + 'px)';

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
        stopAutoSpin();
        return;
    }

    // 檢查餘額
    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    if (currentBalance < amount) {
        statusMsg.innerText = '❌ 餘額不足';
        stopAutoSpin();
        return;
    }

    isSpinning = true;
    spinBtn.disabled = true;
    statusMsg.innerHTML = '<span class="loader"></span> 交易確認中...';
    statusMsg.style.color = '#ffcc00';
    txLog.innerHTML = '';
    payline.classList.remove('win');

    if (window.audioManager) {
        window.audioManager.play('bet');
        reelSoundId = window.audioManager.play('slot_reel', { loop: true });
    }

    buildReels();

    // 樂觀更新餘額
    var tempBalance = currentBalance - amount;
    document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var hBal = document.getElementById('header-balance');
    if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

    setTimeout(function() {
        startSpinAnimation();
    }, 50);

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
        var minSpinTime = 1200;
        var stopDelay = 400;

        setTimeout(function() {
            stopReel(1, reelEmojis[0], function() {
                setTimeout(function() {
                    stopReel(2, reelEmojis[1], function() {
                        setTimeout(function() {
                            stopReel(3, reelEmojis[2], function() {
                                if (window.audioManager && reelSoundId) {
                                    window.audioManager.stop('slot_reel', reelSoundId);
                                }
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
        if (window.audioManager && reelSoundId) {
            window.audioManager.stop('slot_reel', reelSoundId);
        }
        for (var r = 1; r <= 3; r++) {
            var strip = document.getElementById('reel-' + r);
            strip.classList.remove('spinning');
        }
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        statusMsg.style.color = 'red';
        isSpinning = false;
        spinBtn.disabled = false;
        stopAutoSpin();
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
    var stopOnWin = document.getElementById('stop-on-win').checked;
    var stopOnBigWin = document.getElementById('stop-on-big-win').checked;

    updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel });

    var isWin = false;
    var isBigWin = false;

    if (result.resultType === 'triple') {
        isWin = true;
        if (result.multiplier >= 15) isBigWin = true;
        
        payline.classList.add('win');
        if (window.audioManager) {
            window.audioManager.play(isBigWin ? 'win_big' : 'win_small');
        }

        var profitAmount = betAmount * result.multiplier;
        var displayMultiplier = result.multiplier + 'x';
        statusMsg.innerHTML = '🏆 三連線！' +
            ' <span class="result-multiplier" style="display:inline;">' + displayMultiplier + '</span>';
        statusMsg.style.color = '#00ff88';

        var newBalance = tempBalance + betAmount + profitAmount;
        document.getElementById('balance-val').innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        if (hBal) hBal.innerText = newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    } else if (result.resultType === 'double') {
        isWin = true;
        payline.classList.add('win');
        if (window.audioManager) window.audioManager.play('win_small');

        statusMsg.innerHTML = '⭐ 兩連線，返還 <span class="result-multiplier" style="display:inline;">0.5x</span>';
        statusMsg.style.color = '#ffcc00';

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

    // 自動旋轉邏輯
    if (isAutoSpinning) {
        var shouldStop = false;
        if (isBigWin && stopOnBigWin) shouldStop = true;
        else if (isWin && stopOnWin) shouldStop = true;
        
        if (autoSpinsLeft !== 9999) {
            autoSpinsLeft--;
            if (autoSpinsLeft <= 0) shouldStop = true;
        }

        if (shouldStop) {
            stopAutoSpin();
        } else {
            var btn = document.getElementById('auto-btn');
            btn.innerText = '🛑 停止自動 (' + (autoSpinsLeft > 1000 ? '∞' : autoSpinsLeft) + ')';
            setTimeout(spin, 1500); // 延遲一下再開始下一轉
        }
    }

    setTimeout(refreshBalance, 10000);
}
