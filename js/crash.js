/* === 爆點飛行遊戲邏輯 === */

var currentMultiplier = 1.00;
var isFlying = false;
var flightStartTime = 0;
var animationId = null;
var currentBetId = null;
var canvas, ctx;
var history = [];

// 音效控制
var engineSoundId = null;

/**
 * 初始化圖表
 */
function initCrashGraph() {
    canvas = document.getElementById('crash-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    drawGrid();
}

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    if (!isFlying) drawGrid();
}

function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;

    // 畫橫線
    for (var i = 0; i < 10; i++) {
        var y = canvas.height - (i * canvas.height / 10);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

/**
 * 開始遊戲
 */
function startGame() {
    if (isFlying) return;

    var amount = parseFloat(document.getElementById('bet-amount').value);
    var statusMsg = document.getElementById('status-msg');
    var startBtn = document.getElementById('start-btn');
    var cashoutBtn = document.getElementById('cashout-btn');
    var overlay = document.getElementById('crash-overlay');

    if (isNaN(amount) || amount <= 0) {
        statusMsg.innerText = '❌ 請輸入有效的金額';
        return;
    }

    // 檢查餘額
    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));
    if (currentBalance < amount) {
        statusMsg.innerText = '❌ 餘額不足';
        return;
    }

    startBtn.disabled = true;
    overlay.style.display = 'none';
    statusMsg.innerHTML = '<span class="loader"></span> 正在起飛...';

    if (window.audioManager) window.audioManager.play('bet');

    fetch('/api/game?game=crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            amount: amount,
            sessionId: user.sessionId,
            action: 'start'
        })
    })
    .then(res => res.json())
    .then(result => {
        if (result.error) throw new Error(result.error);

        currentBetId = result.betId;
        isFlying = true;
        flightStartTime = Date.now();
        currentMultiplier = 1.00;
        
        cashoutBtn.disabled = false;
        statusMsg.innerText = '🚀 飛行中... 及時兌現！';

        if (window.audioManager) {
            engineSoundId = window.audioManager.play('crash_engine', { loop: true });
        }

        // 樂觀更新餘額
        var tempBalance = currentBalance - amount;
        document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });
        var hBal = document.getElementById('header-balance');
        if (hBal) hBal.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2 });

        animateFlight();
    })
    .catch(e => {
        statusMsg.innerText = '❌ 錯誤: ' + e.message;
        startBtn.disabled = false;
    });
}

/**
 * 飛行動畫
 */
function animateFlight() {
    if (!isFlying) return;

    var elapsed = (Date.now() - flightStartTime) / 1000;
    // 指數增長公式: multiplier = e^(0.06 * elapsed)
    currentMultiplier = Math.pow(Math.E, 0.08 * elapsed);
    
    document.getElementById('multiplier-val').innerText = currentMultiplier.toFixed(2) + 'x';

    // 自動兌現檢查
    var autoValue = parseFloat(document.getElementById('auto-cashout').value);
    if (!isNaN(autoValue) && currentMultiplier >= autoValue) {
        cashOut();
        return; // 停止動畫，由 cashOut 處理
    }

    drawFlightPath(elapsed);
    animationId = requestAnimationFrame(animateFlight);

    // 每秒檢查一次是否炸了（後端會告知，或者前端模擬）
    // 這裡我們每 500ms 向後端確認一次狀態，或者更簡單地：
    // 在啟動時，後端其實已經決定了 crashPoint，我們可以透過一個隨機的延遲或者定時輪詢來檢查。
    // 為了流暢度，我們定時向後端拿「最終結果」，如果當前倍率已經超過它，就炸掉。
    if (elapsed % 0.5 < 0.02) { // 大約每 500ms
        checkIfCrashed();
    }
}

function drawFlightPath(elapsed) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    ctx.beginPath();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0, 255, 136, 0.5)';

    var startX = 50;
    var startY = canvas.height - 50;
    ctx.moveTo(startX, startY);

    for (var t = 0; t <= elapsed; t += 0.1) {
        var m = Math.pow(Math.E, 0.08 * t);
        var x = startX + (t * 50);
        var y = startY - (m * 20) + 20;
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
}

/**
 * 檢查是否已墜毀
 */
function checkIfCrashed() {
    fetch('/api/game?game=crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            sessionId: user.sessionId,
            action: 'get_result',
            betId: currentBetId
        })
    })
    .then(res => res.json())
    .then(result => {
        if (currentMultiplier >= result.crashPoint) {
            onCrash(result.crashPoint);
        }
    });
}

/**
 * 墜毀處理
 */
function onCrash(point) {
    if (!isFlying) return;
    isFlying = false;
    cancelAnimationFrame(animationId);

    if (window.audioManager) {
        if (engineSoundId) window.audioManager.stop('crash_engine', engineSoundId);
        window.audioManager.play('crash_explosion');
    }

    document.getElementById('multiplier-val').innerText = point.toFixed(2) + 'x';
    document.getElementById('multiplier-val').style.color = '#ff4444';
    
    var overlay = document.getElementById('crash-overlay');
    var crashMsg = document.getElementById('crash-msg');
    overlay.style.display = 'flex';
    crashMsg.innerText = 'CRASHED @ ' + point.toFixed(2) + 'x';

    document.getElementById('start-btn').disabled = false;
    document.getElementById('cashout-btn').disabled = true;
    document.getElementById('status-msg').innerText = '💥 飛機墜毀了！下次好運。';

    addHistory(point, false);
}

/**
 * 兌現
 */
function cashOut() {
    if (!isFlying) return;
    
    var multiplier = currentMultiplier;
    isFlying = false; // 立即停止前端計時
    cancelAnimationFrame(animationId);

    if (window.audioManager && engineSoundId) {
        window.audioManager.stop('crash_engine', engineSoundId);
        window.audioManager.play('win_small');
    }

    var statusMsg = document.getElementById('status-msg');
    statusMsg.innerHTML = '<span class="loader"></span> 正在結算...';

    fetch('/api/game?game=crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            sessionId: user.sessionId,
            action: 'cashout',
            betId: currentBetId,
            multiplier: multiplier
        })
    })
    .then(res => res.json())
    .then(result => {
        if (result.status === 'crashed') {
            onCrash(result.crashPoint);
        } else {
            statusMsg.innerHTML = '💰 兌現成功！贏得 ' + result.payout + ' 子熙幣 (' + result.multiplier.toFixed(2) + 'x)';
            statusMsg.style.color = '#00ff88';
            document.getElementById('tx-log').innerHTML = txLinkHTML(result.txHash);
            
            // 更新餘額
            refreshBalance();
            addHistory(multiplier, true);
        }
        document.getElementById('start-btn').disabled = false;
        document.getElementById('cashout-btn').disabled = true;
    })
    .catch(e => {
        statusMsg.innerText = '❌ 兌現錯誤: ' + e.message;
        document.getElementById('start-btn').disabled = false;
    });
}

function addHistory(point, win) {
    var list = document.getElementById('history-list');
    var item = document.createElement('div');
    item.className = 'history-item ' + (win ? 'win' : 'lose');
    item.innerText = point.toFixed(2) + 'x';
    list.prepend(item);
    
    if (list.children.length > 10) list.removeChild(list.lastChild);
}
