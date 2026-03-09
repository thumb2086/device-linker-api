var currentMultiplier = 1.0;
var isFlying = false;
var flightStartTime = 0;
var animationId = null;
var currentBetId = null;
var canvas = null;
var ctx = null;
var engineSoundId = null;
var lastCrashPollAt = 0;

var GRAPH_PADDING = {
    top: 82,
    right: 32,
    bottom: 28,
    left: 30
};

function getCanvasWidth() {
    return canvas ? canvas.clientWidth : 0;
}

function getCanvasHeight() {
    return canvas ? canvas.clientHeight : 0;
}

function setMultiplierDisplay(value, state) {
    var el = document.getElementById('multiplier-val');
    if (!el) return;
    el.innerText = Number(value || 1).toFixed(2) + 'x';
    el.className = 'multiplier-display ' + (state || 'is-idle');
}

function hideCrashOverlay() {
    var overlay = document.getElementById('crash-overlay');
    if (overlay) overlay.classList.remove('is-visible');
}

function showCrashOverlay(point) {
    var overlay = document.getElementById('crash-overlay');
    var crashMsg = document.getElementById('crash-msg');
    if (crashMsg) crashMsg.innerText = Number(point || 0).toFixed(2) + 'x';
    if (overlay) overlay.classList.add('is-visible');
}

function initCrashGraph() {
    canvas = document.getElementById('crash-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setMultiplierDisplay(1, 'is-idle');
    drawGrid();
}

function resizeCanvas() {
    if (!canvas || !ctx) return;
    var rect = canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!isFlying) drawGrid();
}

function drawGrid() {
    if (!ctx || !canvas) return;
    var width = getCanvasWidth();
    var height = getCanvasHeight();
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    for (var row = 0; row < 6; row += 1) {
        var y = GRAPH_PADDING.top + ((height - GRAPH_PADDING.top - GRAPH_PADDING.bottom) / 5) * row;
        ctx.beginPath();
        ctx.moveTo(GRAPH_PADDING.left, y);
        ctx.lineTo(width - GRAPH_PADDING.right, y);
        ctx.stroke();
    }

    for (var col = 0; col < 7; col += 1) {
        var x = GRAPH_PADDING.left + ((width - GRAPH_PADDING.left - GRAPH_PADDING.right) / 6) * col;
        ctx.beginPath();
        ctx.moveTo(x, GRAPH_PADDING.top);
        ctx.lineTo(x, height - GRAPH_PADDING.bottom);
        ctx.stroke();
    }
}

function getFlightPoint(timeSeconds, elapsedSeconds, maxMultiplier) {
    var width = getCanvasWidth();
    var height = getCanvasHeight();
    var safeElapsed = Math.max(4, elapsedSeconds * 1.05);
    var safeMaxMultiplier = Math.max(2.2, maxMultiplier * 1.15);
    var normalizedMultiplier = (Math.pow(Math.E, 0.08 * timeSeconds) - 1) / (safeMaxMultiplier - 1);

    return {
        x: GRAPH_PADDING.left + (timeSeconds / safeElapsed) * (width - GRAPH_PADDING.left - GRAPH_PADDING.right),
        y: height - GRAPH_PADDING.bottom - normalizedMultiplier * (height - GRAPH_PADDING.top - GRAPH_PADDING.bottom)
    };
}

function drawFlightPath(elapsedSeconds) {
    if (!ctx || !canvas) return;

    var width = getCanvasWidth();
    var height = getCanvasHeight();
    var maxMultiplier = Math.max(currentMultiplier, 2.2);

    drawGrid();

    ctx.beginPath();
    ctx.strokeStyle = '#34f59f';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(52, 245, 159, 0.35)';

    var firstPoint = getFlightPoint(0, elapsedSeconds, maxMultiplier);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (var t = 0.04; t <= elapsedSeconds; t += 0.04) {
        var point = getFlightPoint(t, elapsedSeconds, maxMultiplier);
        ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    var endPoint = getFlightPoint(elapsedSeconds, elapsedSeconds, maxMultiplier);
    ctx.beginPath();
    ctx.fillStyle = '#34f59f';
    ctx.arc(endPoint.x, endPoint.y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(52, 245, 159, 0.14)';
    ctx.beginPath();
    ctx.arc(endPoint.x, endPoint.y, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8df8c8';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = endPoint.x > width - 96 ? 'right' : 'left';
    ctx.fillText(
        currentMultiplier.toFixed(2) + 'x',
        endPoint.x > width - 96 ? endPoint.x - 10 : endPoint.x + 10,
        Math.max(GRAPH_PADDING.top + 14, endPoint.y - 12)
    );
}

function startGame() {
    if (isFlying) return;

    var amount = parseFloat(document.getElementById('bet-amount').value);
    var statusMsg = document.getElementById('status-msg');
    var startBtn = document.getElementById('start-btn');
    var cashoutBtn = document.getElementById('cashout-btn');
    var currentBalance = parseFloat(document.getElementById('balance-val').innerText.replace(/,/g, ''));

    if (!Number.isFinite(amount) || amount <= 0) {
        statusMsg.innerText = '請輸入有效的下注金額';
        statusMsg.style.color = '#ff6b6b';
        return;
    }

    if (currentBalance < amount) {
        statusMsg.innerText = '餘額不足';
        statusMsg.style.color = '#ff6b6b';
        return;
    }

    startBtn.disabled = true;
    cashoutBtn.disabled = true;
    currentBetId = null;
    hideCrashOverlay();
    setMultiplierDisplay(1, 'is-live');
    drawGrid();
    statusMsg.innerHTML = '<span class="loader"></span> 正在起飛...';
    statusMsg.style.color = '#c4d0d4';

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
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (result.error) throw new Error(result.error);

            currentBetId = result.betId;
            isFlying = true;
            flightStartTime = Date.now();
            lastCrashPollAt = 0;
            currentMultiplier = 1.0;
            cashoutBtn.disabled = false;
            statusMsg.innerText = '飛行中，抓準時機兌現';
            statusMsg.style.color = '#9fe7c6';

            if (window.audioManager) {
                engineSoundId = window.audioManager.play('crash_engine', { loop: true });
            }

            var tempBalance = currentBalance - amount;
            document.getElementById('balance-val').innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            var headerBalance = document.getElementById('header-balance');
            if (headerBalance) {
                headerBalance.innerText = tempBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

            animateFlight();
        })
        .catch(function (error) {
            statusMsg.innerText = '錯誤: ' + error.message;
            statusMsg.style.color = '#ff6b6b';
            startBtn.disabled = false;
            setMultiplierDisplay(1, 'is-idle');
        });
}

function animateFlight() {
    if (!isFlying) return;

    var now = Date.now();
    var elapsed = (now - flightStartTime) / 1000;
    currentMultiplier = Math.pow(Math.E, 0.08 * elapsed);
    setMultiplierDisplay(currentMultiplier, 'is-live');

    var autoValue = parseFloat(document.getElementById('auto-cashout').value);
    if (Number.isFinite(autoValue) && autoValue >= 1.1 && currentMultiplier >= autoValue) {
        cashOut();
        return;
    }

    drawFlightPath(elapsed);
    animationId = requestAnimationFrame(animateFlight);

    if (now - lastCrashPollAt >= 350) {
        lastCrashPollAt = now;
        checkIfCrashed();
    }
}

function stopEngineSound() {
    if (window.audioManager && engineSoundId) {
        window.audioManager.stop('crash_engine', engineSoundId);
        engineSoundId = null;
    }
}

function checkIfCrashed() {
    if (!isFlying || !currentBetId) return;

    fetch('/api/game?game=crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: user.address,
            sessionId: user.sessionId,
            action: 'get_result',
            betId: currentBetId,
            currentMultiplier: currentMultiplier
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (!isFlying || !result || typeof result.crashPoint !== 'number') return;
            if (currentMultiplier >= result.crashPoint) {
                onCrash(result.crashPoint);
            }
        })
        .catch(function () {});
}

function onCrash(point) {
    if (!isFlying && !currentBetId) return;

    isFlying = false;
    cancelAnimationFrame(animationId);
    stopEngineSound();

    if (window.audioManager) {
        window.audioManager.play('crash_explosion');
    }

    setMultiplierDisplay(point, 'is-crashed');
    showCrashOverlay(point);

    var startBtn = document.getElementById('start-btn');
    var cashoutBtn = document.getElementById('cashout-btn');
    var statusMsg = document.getElementById('status-msg');
    if (startBtn) startBtn.disabled = false;
    if (cashoutBtn) cashoutBtn.disabled = true;
    if (statusMsg) {
        statusMsg.innerText = '爆炸了，這局未能兌現';
        statusMsg.style.color = '#ff6b6b';
    }

    currentBetId = null;
    addHistory(point, false);
}

function cashOut() {
    if (!isFlying || !currentBetId) return;

    var multiplier = currentMultiplier;
    isFlying = false;
    cancelAnimationFrame(animationId);
    stopEngineSound();

    if (window.audioManager) {
        window.audioManager.play('win_small');
    }

    var statusMsg = document.getElementById('status-msg');
    statusMsg.innerHTML = '<span class="loader"></span> 正在兌現...';
    statusMsg.style.color = '#c4d0d4';

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
        .then(function (res) { return res.json(); })
        .then(function (result) {
            var startBtn = document.getElementById('start-btn');
            var cashoutBtn = document.getElementById('cashout-btn');
            if (startBtn) startBtn.disabled = false;
            if (cashoutBtn) cashoutBtn.disabled = true;

            if (result.status === 'crashed') {
                currentBetId = result.betId || currentBetId;
                onCrash(result.crashPoint);
                return;
            }

            if (result.error) throw new Error(result.error);

            hideCrashOverlay();
            setMultiplierDisplay(result.multiplier || multiplier, 'is-win');
            statusMsg.innerHTML = '成功兌現，獲得 ' + result.payout + ' 子熙幣 (' + Number(result.multiplier || multiplier).toFixed(2) + 'x)';
            statusMsg.style.color = '#34f59f';
            document.getElementById('tx-log').innerHTML = txLinkHTML(result.txHash);

            currentBetId = null;
            refreshBalance();
            addHistory(multiplier, true);
        })
        .catch(function (error) {
            var startBtn = document.getElementById('start-btn');
            var cashoutBtn = document.getElementById('cashout-btn');
            if (startBtn) startBtn.disabled = false;
            if (cashoutBtn) cashoutBtn.disabled = true;
            statusMsg.innerText = '兌現失敗: ' + error.message;
            statusMsg.style.color = '#ff6b6b';
            setMultiplierDisplay(multiplier, 'is-live');
        });
}

function addHistory(point, win) {
    var list = document.getElementById('history-list');
    if (!list) return;

    var item = document.createElement('div');
    item.className = 'history-item ' + (win ? 'win' : 'lose');
    item.innerText = Number(point || 0).toFixed(2) + 'x';
    list.prepend(item);

    while (list.children.length > 10) {
        list.removeChild(list.lastChild);
    }
}
