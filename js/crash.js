var currentMultiplier = 1.0;
var gameState = 'idle'; // idle, betting, pending, flying, crashed
var flightStartTime = 0;
var animationId = null;
var playerBet = null; // { amount, status: 'bet' | 'cashed_out' }
var lastGameState = {};
var isSubmitting = false;

var canvas = null;
var ctx = null;
var engineSoundId = null;

var GRAPH_PADDING = { top: 82, right: 32, bottom: 28, left: 30 };

function getCanvasWidth() { return canvas ? canvas.clientWidth : 0; }
function getCanvasHeight() { return canvas ? canvas.clientHeight : 0; }

function setMultiplierDisplay(value, state) {
    var el = document.getElementById('multiplier-val');
    if (!el) return;
    el.innerText = Number(value || 1).toFixed(2) + 'x';
    el.className = 'multiplier-display ' + (state || 'is-idle');
}

function setGameStatus(text, color) {
    var statusMsg = document.getElementById('status-msg');
    if (!statusMsg) return;
    statusMsg.innerText = text;
    statusMsg.style.color = color;
}

function updatePlayerControls() {
    var betBtn = document.getElementById('bet-btn');
    var cashoutBtn = document.getElementById('cashout-btn');
    if (!betBtn || !cashoutBtn) return;

    var canBet = gameState === 'betting' && !playerBet && !isSubmitting;
    var canCashOut = gameState === 'flying' && playerBet && playerBet.status === 'bet' && !isSubmitting;

    betBtn.disabled = !canBet;
    cashoutBtn.disabled = !canCashOut;

    if (gameState === 'betting' && playerBet) {
        betBtn.innerText = '已下注';
        betBtn.disabled = true;
    } else {
        betBtn.innerText = '下注';
    }
}

function initCrashGraph() {
    canvas = document.getElementById('crash-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setMultiplierDisplay(1, 'is-idle');
    drawGrid();
    syncGameState();
    setInterval(syncGameState, 2000);
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
    if (gameState !== 'flying') drawGrid();
}

function drawGrid() {
    if (!ctx || !canvas) return;
    var width = getCanvasWidth();
    var height = getCanvasHeight();
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (var row = 0; row < 6; row++) {
        var y = GRAPH_PADDING.top + ((height - GRAPH_PADDING.top - GRAPH_PADDING.bottom) / 5) * row;
        ctx.beginPath(); ctx.moveTo(GRAPH_PADDING.left, y); ctx.lineTo(width - GRAPH_PADDING.right, y); ctx.stroke();
    }
    for (var col = 0; col < 7; col++) {
        var x = GRAPH_PADDING.left + ((width - GRAPH_PADDING.left - GRAPH_PADDING.right) / 6) * col;
        ctx.beginPath(); ctx.moveTo(x, GRAPH_PADDING.top); ctx.lineTo(x, height - GRAPH_PADDING.bottom); ctx.stroke();
    }
}

function getFlightPoint(multiplier, maxMultiplier) {
    var elapsed = Math.log(multiplier) / 0.08;
    var width = getCanvasWidth();
    var height = getCanvasHeight();
    var maxElapsed = Math.max(4, Math.log(maxMultiplier) / 0.08);

    return {
        x: GRAPH_PADDING.left + (elapsed / maxElapsed) * (width - GRAPH_PADDING.left - GRAPH_PADDING.right),
        y: height - GRAPH_PADDING.bottom - ((multiplier - 1) / (maxMultiplier - 1)) * (height - GRAPH_PADDING.top - GRAPH_PADDING.bottom)
    };
}

function drawFlightPath(multiplier) {
    if (!ctx || !canvas) return;

    var maxMultiplier = Math.max(multiplier, 2.2);
    drawGrid();

    ctx.beginPath();
    ctx.strokeStyle = '#34f59f';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(52, 245, 159, 0.35)';

    var firstPoint = getFlightPoint(1, maxMultiplier);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (var m = 1.02; m <= multiplier; m *= 1.02) {
        var point = getFlightPoint(m, maxMultiplier);
        ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    var endPoint = getFlightPoint(multiplier, maxMultiplier);
    ctx.beginPath(); ctx.fillStyle = '#34f59f'; ctx.arc(endPoint.x, endPoint.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = 'rgba(52, 245, 159, 0.14)'; ctx.arc(endPoint.x, endPoint.y, 14, 0, Math.PI * 2); ctx.fill();
}

function animateFlight() {
    if (gameState !== 'flying') return;

    var now = Date.now();
    var elapsed = (now - flightStartTime) / 1000;
    currentMultiplier = Math.pow(Math.E, 0.08 * elapsed);
    
    setMultiplierDisplay(currentMultiplier, 'is-live');
    drawFlightPath(currentMultiplier);

    // Auto-cashout logic
    var autoValue = parseFloat(document.getElementById('auto-cashout').value);
    if (playerBet && playerBet.status === 'bet' && Number.isFinite(autoValue) && autoValue >= 1.01 && currentMultiplier >= autoValue) {
        cashOut();
    }

    animationId = requestAnimationFrame(animateFlight);
}

function stopEngineSound() {
    if (window.audioManager && engineSoundId) {
        window.audioManager.stop('crash_engine', engineSoundId);
        engineSoundId = null;
    }
}

function onRoundStart(data) {
    gameState = 'flying';
    flightStartTime = Date.parse(data.startTime) || Date.now();
    hideCrashOverlay();
    if (window.audioManager) engineSoundId = window.audioManager.play('crash_engine', { loop: true });
    animateFlight();
    if (playerBet) setGameStatus('飛行中，抓準時機兌現', '#9fe7c6');
}

function onRoundEnd(data) {
    if (gameState === 'flying') {
        if (window.audioManager) window.audioManager.play('crash_explosion');
    }
    gameState = 'crashed';
    stopEngineSound();
    cancelAnimationFrame(animationId);
    setMultiplierDisplay(data.crashPoint, 'is-crashed');
    showCrashOverlay(data.crashPoint);
    addHistory(data.crashPoint, playerBet && playerBet.status === 'cashed_out');

    if (playerBet && playerBet.status === 'bet') {
        setGameStatus('爆炸了，本輪未能兌現', '#ff6b6b');
    } else if (!playerBet) {
        setGameStatus('本輪結束', '#c4d0d4');
    }
    playerBet = null;
}

function syncGameState() {
    fetch('/api/game?game=crash&action=status').then(res => res.json()).then(data => {
        if (JSON.stringify(data) === JSON.stringify(lastGameState)) return;
        lastGameState = data;

        var oldGameState = gameState;
        gameState = data.state;

        if (oldGameState !== 'betting' && gameState === 'betting') {
            playerBet = null;
            hideCrashOverlay();
            setMultiplierDisplay(1.0, 'is-idle');
            drawGrid();
            setGameStatus('距離起飛 ' + data.expiresIn + ' 秒，可下注', '#c4d0d4');
        } else if (gameState === 'betting') {
            setGameStatus('距離起飛 ' + data.expiresIn + ' 秒，可下注', '#c4d0d4');
        }

        if (oldGameState !== 'pending' && gameState === 'pending') {
            setGameStatus('即將起飛，停止下注', '#ffd36a');
        }

        if (oldGameState !== 'flying' && gameState === 'flying') {
            onRoundStart(data);
        }

        if (gameState === 'crashed' && (oldGameState === 'flying' || oldGameState === 'pending')) {
            onRoundEnd(data);
        }
        updatePlayerControls();
    });
}

function placeBet() {
    if (gameState !== 'betting' || isSubmitting || playerBet) return;

    var amount = parseFloat(document.getElementById('bet-amount').value);
    var statusMsg = document.getElementById('status-msg');

    if (!Number.isFinite(amount) || amount <= 0) {
        setGameStatus('請輸入有效的下注金額', '#ff6b6b');
        return;
    }
    var currentBalance = getCurrentUserBalance();
    if (currentBalance < amount) {
        setGameStatus('餘額不足', '#ff6b6b');
        return;
    }

    // --- Optimistic Update ---
    isSubmitting = true;
    setDisplayedBalance(currentBalance - amount);
    if (window.audioManager) window.audioManager.play('bet');
    
    playerBet = { amount: amount, status: 'bet' };
    updatePlayerControls();

    // --- Background Fetch ---
    fetch('/api/game?game=crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.address, amount: amount, sessionId: user.sessionId, action: 'bet' })
    })
    .then(res => {
        if (!res.ok) return res.json().then(err => { throw new Error(err.error || '下注失敗') });
        return res.json();
    })
    .then(result => {
        if (result.error) throw new Error(result.error);
        // Bet confirmed, do nothing, UI is already updated
    })
    .catch(error => {
        setGameStatus('下注失敗: ' + error.message, '#ff6b6b');
        setDisplayedBalance(currentBalance); // Rollback
        playerBet = null;
    })
    .finally(() => {
        isSubmitting = false;
        updatePlayerControls();
    });
}

function cashOut() {
    if (gameState !== 'flying' || !playerBet || playerBet.status !== 'bet' || isSubmitting) return;

    // --- Optimistic Update ---
    isSubmitting = true;
    var multiplier = currentMultiplier;
    var payout = playerBet.amount * multiplier;
    
    setDisplayedBalance(getCurrentUserBalance() + payout);
    if (window.audioManager) window.audioManager.play('win_small');

    setGameStatus('成功兌現 @ ' + multiplier.toFixed(2) + 'x', '#34f59f');
    setMultiplierDisplay(multiplier, 'is-win');
    playerBet.status = 'cashed_out';
    updatePlayerControls();

    // --- Background Fetch ---
    fetch('/api/game?game=crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.address, sessionId: user.sessionId, action: 'cashout' })
    })
    .then(res => res.json())
    .then(result => {
        if(result.error && result.reason === 'already_crashed'){
             // Server authoritative state says we were too late. Rollback.
            setDisplayedBalance(getCurrentUserBalance() - payout);
            onRoundEnd(result.gameState);
        } else {
            // Success, maybe sync balance just in case
            setTimeout(refreshBalance, 2000);
        }
    })
    .catch(error => {
        // Extremely rare, but if API fails, we conservatively roll back.
        setGameStatus('兌現確認失敗，餘額已回滾', '#ff6b6b');
        setDisplayedBalance(getCurrentUserBalance() - payout);
        playerBet.status = 'bet'; // Allow retry?
    })
    .finally(() => {
        isSubmitting = false;
        updatePlayerControls();
    });
}

function addHistory(point, win) {
    var list = document.getElementById('history-list');
    if (!list) return;
    var item = document.createElement('div');
    item.className = 'history-item ' + (win ? 'win' : 'lose');
    item.innerText = Number(point || 0).toFixed(2) + 'x';
    list.prepend(item);
    if (list.children.length > 10) list.removeChild(list.lastChild);
}

// Helper to show the crash point overlay, not in original code but needed for onRoundEnd
function showCrashOverlay(point) {
    var overlay = document.getElementById('crash-overlay');
    var crashMsg = document.getElementById('crash-msg');
    if (crashMsg) crashMsg.innerText = Number(point || 0).toFixed(2) + 'x';
    if (overlay) overlay.classList.add('is-visible');
}

function hideCrashOverlay() {
    var overlay = document.getElementById('crash-overlay');
    if (overlay) overlay.classList.remove('is-visible');
}
