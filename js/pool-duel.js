var poolStatusBusy = false;
var poolPollTimer = null;
var currentPoolState = null;
var poolAimAngle = 0;
var poolShotPower = 0.62;
var poolCuePlacement = { x: 230, y: 250 };

function getPoolMatch() {
    return currentPoolState && currentPoolState.match ? currentPoolState.match : null;
}

function getCueBall(match) {
    if (!match || !match.table || !Array.isArray(match.table.balls)) return null;
    for (var i = 0; i < match.table.balls.length; i += 1) {
        if (match.table.balls[i].number === 0) return match.table.balls[i];
    }
    return null;
}

function setPoolStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#d7f5e6';
}

function setPoolTx(txHash) {
    var txEl = document.getElementById('tx-log');
    if (!txEl) return;
    txEl.innerHTML = txHash ? txLinkHTML(txHash) : '';
}

function renderPoolLog(items) {
    var logEl = document.getElementById('pool-log');
    if (!logEl) return;
    if (!Array.isArray(items) || items.length === 0) {
        logEl.innerHTML = '<div class="pool-log-item">目前還沒有對局紀錄</div>';
        return;
    }

    logEl.innerHTML = items.map(function (item) {
        return '<div class="pool-log-item">' + String(item || '') + '</div>';
    }).join('');
}

function setPoolButtons(config) {
    var joinBtn = document.getElementById('join-btn');
    var cancelBtn = document.getElementById('cancel-btn');
    var timeoutBtn = document.getElementById('timeout-btn');
    var rewardBtn = document.getElementById('reward-btn');
    var shootBtn = document.getElementById('shoot-btn');

    if (joinBtn) joinBtn.disabled = !config.canJoin;
    if (cancelBtn) cancelBtn.disabled = !config.canCancel;
    if (timeoutBtn) timeoutBtn.disabled = !config.canClaimTimeout;
    if (rewardBtn) rewardBtn.disabled = !config.canClaimReward;
    if (shootBtn) shootBtn.disabled = !config.canShoot;
}

function setAimPowerValue() {
    var valueEl = document.getElementById('shot-power-value');
    if (valueEl) valueEl.innerText = Math.round(poolShotPower * 100) + '%';
}

function setAimNote(text) {
    var noteEl = document.getElementById('aim-note');
    if (noteEl) noteEl.innerText = text || '';
}

function setCanvasHint(text) {
    var hintEl = document.getElementById('pool-canvas-hint');
    if (hintEl) hintEl.innerText = text || '';
}

function updateTablePhase(match) {
    var el = document.getElementById('table-phase');
    if (!el) return;

    if (!match || match.status === 'idle') {
        el.innerText = '開放球桌';
        return;
    }

    if (match.status === 'finished' || match.status === 'settling') {
        el.innerText = match.winnerDisplayName ? ('勝者：' + match.winnerDisplayName) : '對局結束';
        return;
    }

    if (match.rules && match.rules.openTable) {
        el.innerText = '開放球桌';
        return;
    }

    var selfTarget = match.self && match.self.targetLabel ? match.self.targetLabel : '未分組';
    var oppTarget = match.opponent && match.opponent.targetLabel ? match.opponent.targetLabel : '未分組';
    el.innerText = '你目標：' + selfTarget + ' / 對手目標：' + oppTarget;
}

function updatePlayerCards(match) {
    var selfNameEl = document.getElementById('self-name');
    var opponentNameEl = document.getElementById('opponent-name');
    var selfGroupEl = document.getElementById('self-group');
    var opponentGroupEl = document.getElementById('opponent-group');
    var selfProgressEl = document.getElementById('self-progress');
    var opponentProgressEl = document.getElementById('opponent-progress');

    if (!match || match.status === 'idle') {
        if (selfNameEl) selfNameEl.innerText = '你';
        if (opponentNameEl) opponentNameEl.innerText = '等待對手';
        if (selfGroupEl) selfGroupEl.innerText = '未分組';
        if (opponentGroupEl) opponentGroupEl.innerText = '未分組';
        if (selfProgressEl) selfProgressEl.innerText = '待開局';
        if (opponentProgressEl) opponentProgressEl.innerText = '待開局';
        return;
    }

    if (selfNameEl) selfNameEl.innerText = match.self ? match.self.displayName : '你';
    if (opponentNameEl) opponentNameEl.innerText = match.opponent ? match.opponent.displayName : '等待對手';
    if (selfGroupEl) selfGroupEl.innerText = match.self ? match.self.groupLabel : '未分組';
    if (opponentGroupEl) opponentGroupEl.innerText = match.opponent ? match.opponent.groupLabel : '未分組';

    if (selfProgressEl) {
        selfProgressEl.innerText = match.self
            ? ('已清 ' + match.self.cleared + ' / 7，剩 ' + match.self.remaining + ' 顆')
            : '待開局';
    }
    if (opponentProgressEl) {
        opponentProgressEl.innerText = match.opponent
            ? ('已清 ' + match.opponent.cleared + ' / 7，剩 ' + match.opponent.remaining + ' 顆')
            : '待開局';
    }
}

function ensureCuePlacement(match) {
    var cueBall = getCueBall(match);
    if (match && match.shotState && match.shotState.ballInHand) {
        if (!poolCuePlacement || !Number.isFinite(poolCuePlacement.x) || !Number.isFinite(poolCuePlacement.y)) {
            poolCuePlacement = { x: 220, y: 250 };
        }
        return;
    }

    if (cueBall && !cueBall.pocketed) {
        poolCuePlacement = { x: cueBall.x, y: cueBall.y };
    }
}

function renderPoolState(payload) {
    currentPoolState = payload || null;
    var match = payload && payload.match ? payload.match : null;
    var waiting = payload && payload.waiting;
    var queue = payload && payload.queue ? payload.queue : null;
    var turnBadgeEl = document.getElementById('turn-badge');
    var turnTimerEl = document.getElementById('turn-timer');

    if (waiting && queue) {
        updatePlayerCards(null);
        updateTablePhase(null);
        if (turnBadgeEl) turnBadgeEl.innerText = '配對中';
        if (turnTimerEl) turnTimerEl.innerText = '已鎖定 1,000 子熙幣';
        setPoolButtons({
            canJoin: false,
            canCancel: true,
            canClaimTimeout: false,
            canClaimReward: false,
            canShoot: false
        });
        setPoolStatus('配對中，找到對手後會自動開局', false);
        setCanvasHint('等待對手加入球桌');
        setAimNote('配對成功後可在球桌上瞄準出桿');
        setPoolTx(queue.txHash || '');
        renderPoolLog(['你已進入撞球對戰等待隊列']);
        drawPoolTable();
        return;
    }

    if (!match || match.status === 'idle') {
        updatePlayerCards(null);
        updateTablePhase(null);
        if (turnBadgeEl) turnBadgeEl.innerText = '尚未開局';
        if (turnTimerEl) turnTimerEl.innerText = '固定賭注 1,000';
        setPoolButtons({
            canJoin: true,
            canCancel: false,
            canClaimTimeout: false,
            canClaimReward: false,
            canShoot: false
        });
        setPoolStatus('點擊加入配對後會先鎖定 1,000 子熙幣', false);
        setCanvasHint('加入配對後開始對戰');
        setAimNote('進場後使用球桌瞄準方向，力道條控制出桿強度');
        setPoolTx('');
        renderPoolLog([]);
        drawPoolTable();
        return;
    }

    ensureCuePlacement(match);
    updatePlayerCards(match);
    updateTablePhase(match);

    if (turnBadgeEl) {
        if (match.status === 'finished') {
            turnBadgeEl.innerText = match.winnerAddress === (match.self && match.self.address) ? '你獲勝' : (match.winnerDisplayName || '對手獲勝');
        } else if (match.status === 'settling') {
            turnBadgeEl.innerText = '等待結算';
        } else {
            turnBadgeEl.innerText = match.isMyTurn ? '輪到你出桿' : '輪到對手';
        }
    }
    if (turnTimerEl) {
        turnTimerEl.innerText = match.status === 'active'
            ? ('剩餘 ' + Math.ceil((match.turnDeadlineMs || 0) / 1000) + ' 秒')
            : (match.settlementError ? ('結算待重試：' + match.settlementError) : '標準 8 號球規則');
    }

    setPoolButtons({
        canJoin: false,
        canCancel: false,
        canClaimTimeout: !!match.canClaimTimeout,
        canClaimReward: !!match.canClaimReward,
        canShoot: !!match.isMyTurn && match.status === 'active'
    });

    setPoolTx(match.payoutTxHash || '');
    renderPoolLog(match.log);

    if (match.status === 'active') {
        if (match.isMyTurn && match.shotState && match.shotState.ballInHand) {
            setPoolStatus('你有白球自由球，先點球桌擺放白球再出桿', false);
            setCanvasHint('點擊球桌擺放白球，再按出桿');
            setAimNote('白球落袋或犯規後，對手可以自由擺白球');
        } else if (match.isMyTurn) {
            setPoolStatus('輪到你出桿，請瞄準你的目標球', false);
            setCanvasHint('移動滑鼠或手指設定方向，再按出桿');
            setAimNote('清完自己的球組後，最後才能收 8 號球');
        } else {
            setPoolStatus('等待對手出桿', false);
            setCanvasHint('對手操作中');
            setAimNote('目前由對手回合，系統每 3 秒同步桌面狀態');
        }
    } else if (match.status === 'settling') {
        setPoolStatus(match.canClaimReward ? '你已獲勝，請領取 2,000 子熙幣' : '對局已分勝負，等待勝者領獎', false);
        setCanvasHint(match.winnerDisplayName ? (match.winnerDisplayName + ' 勝出') : '等待結算');
        setAimNote(match.lastShotSummary || '對局已完成');
    } else {
        setPoolStatus(match.winnerAddress === (match.self && match.self.address) ? '你贏下本局撞球對戰' : '本局撞球對戰已結束', false);
        setCanvasHint(match.winnerDisplayName ? (match.winnerDisplayName + ' 勝出') : '對局結束');
        setAimNote(match.lastShotSummary || '對局已完成');
    }

    drawPoolTable();
}

function callPoolApi(action, payload) {
    var body = {
        game: 'poolduel',
        action: action,
        sessionId: user.sessionId
    };
    if (payload && typeof payload === 'object') {
        Object.keys(payload).forEach(function (key) {
            body[key] = payload[key];
        });
    }

    return fetch('/api/game?game=poolduel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (res) { return res.json(); });
}

function syncPoolStatus(silent) {
    if (poolStatusBusy) return Promise.resolve();
    poolStatusBusy = true;

    return callPoolApi('status')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '撞球對戰同步失敗');
            renderPoolState(data);
        })
        .catch(function (error) {
            if (!silent) setPoolStatus('錯誤: ' + error.message, true);
        })
        .finally(function () {
            poolStatusBusy = false;
        });
}

function joinPoolQueue() {
    setPoolStatus('加入配對中...', false);
    callPoolApi('join_queue')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '加入配對失敗');
            renderPoolState(data);
            refreshBalance();
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function cancelPoolQueue() {
    setPoolStatus('取消等待中...', false);
    callPoolApi('cancel_queue')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '取消等待失敗');
            renderPoolState(data);
            if (data.txHash) setPoolTx(data.txHash);
            refreshBalance();
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function submitPoolShot() {
    var match = getPoolMatch();
    if (!match || !match.isMyTurn || match.status !== 'active') {
        setPoolStatus('目前還不能出桿', true);
        return;
    }

    var payload = {
        angle: poolAimAngle,
        power: poolShotPower
    };

    if (match.shotState && match.shotState.ballInHand) {
        payload.cueX = poolCuePlacement.x;
        payload.cueY = poolCuePlacement.y;
    }

    setPoolStatus('出桿中...', false);
    callPoolApi('shoot', payload)
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '出桿失敗');
            renderPoolState(data);
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function claimTurnTimeout() {
    setPoolStatus('正在確認超時...', false);
    callPoolApi('claim_turn_timeout')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '宣告超時失敗');
            renderPoolState(data);
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function claimPoolReward() {
    setPoolStatus('領取獎勵中...', false);
    callPoolApi('claim_reward')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '領取獎勵失敗');
            renderPoolState(data);
            if (data.txHash) setPoolTx(data.txHash);
            refreshBalance();
        })
        .catch(function (error) {
            setPoolStatus('錯誤: ' + error.message, true);
        });
}

function poolCanvasPointFromEvent(event) {
    var canvas = document.getElementById('pool-canvas');
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var source = event.touches && event.touches[0] ? event.touches[0] : event;
    var x = ((source.clientX - rect.left) / rect.width) * canvas.width;
    var y = ((source.clientY - rect.top) / rect.height) * canvas.height;
    return { x: x, y: y };
}

function updateAimFromPoint(point) {
    var match = getPoolMatch();
    if (!match || !match.isMyTurn || match.status !== 'active') return;
    var cueBase = (match.shotState && match.shotState.ballInHand) ? poolCuePlacement : getCueBall(match);
    if (!cueBase) return;
    poolAimAngle = Math.atan2(point.y - cueBase.y, point.x - cueBase.x);
    drawPoolTable();
}

function onPoolCanvasPointer(event) {
    var match = getPoolMatch();
    if (!match || !match.isMyTurn || match.status !== 'active') return;
    var point = poolCanvasPointFromEvent(event);
    if (!point) return;

    if (match.shotState && match.shotState.ballInHand) {
        poolCuePlacement = {
            x: Math.max(11, Math.min(989, point.x)),
            y: Math.max(11, Math.min(489, point.y))
        };
    } else {
        updateAimFromPoint(point);
    }
    drawPoolTable();
}

function drawTableBackground(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#5a3118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f6e4e';
    ctx.fillRect(30, 30, canvas.width - 60, canvas.height - 60);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

    var pockets = [
        { x: 30, y: 30 },
        { x: canvas.width / 2, y: 30 },
        { x: canvas.width - 30, y: 30 },
        { x: 30, y: canvas.height - 30 },
        { x: canvas.width / 2, y: canvas.height - 30 },
        { x: canvas.width - 30, y: canvas.height - 30 }
    ];
    for (var i = 0; i < pockets.length; i += 1) {
        ctx.beginPath();
        ctx.arc(pockets[i].x, pockets[i].y, 24, 0, Math.PI * 2);
        ctx.fillStyle = '#050807';
        ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(250, 44);
    ctx.lineTo(250, canvas.height - 44);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
}

function ballColor(number) {
    var colors = {
        1: '#f4d643',
        2: '#3268d6',
        3: '#d84438',
        4: '#7746c3',
        5: '#f0862b',
        6: '#2a8a42',
        7: '#7f1d19',
        8: '#111111',
        9: '#f4d643',
        10: '#3268d6',
        11: '#d84438',
        12: '#7746c3',
        13: '#f0862b',
        14: '#2a8a42',
        15: '#7f1d19'
    };
    return colors[number] || '#ffffff';
}

function drawBall(ctx, ball, isGhost) {
    var radius = 11;
    ctx.save();
    if (isGhost) ctx.globalAlpha = 0.72;

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    if (ball.number !== 0) {
        if (ball.number > 8) {
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            ctx.beginPath();
            ctx.rect(ball.x - radius, ball.y - 5, radius * 2, 10);
            ctx.clip();
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = ballColor(ball.number);
            ctx.fill();
            ctx.restore();
            ctx.save();
            if (isGhost) ctx.globalAlpha = 0.72;
        } else {
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = ballColor(ball.number);
            ctx.fill();
        }
    }

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 5.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    if (ball.number > 0) {
        ctx.fillStyle = ball.number === 8 ? '#f4fff8' : '#18221d';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ball.number), ball.x, ball.y + 0.4);
    }

    ctx.restore();
}

function drawAimLine(ctx, match) {
    if (!match || !match.isMyTurn || match.status !== 'active') return;
    var cueBase = (match.shotState && match.shotState.ballInHand) ? poolCuePlacement : getCueBall(match);
    if (!cueBase || cueBase.pocketed) return;

    var lineLength = 210 + (poolShotPower * 70);
    var cueX = cueBase.x - Math.cos(poolAimAngle) * (70 + poolShotPower * 90);
    var cueY = cueBase.y - Math.sin(poolAimAngle) * (70 + poolShotPower * 90);
    var aimX = cueBase.x + Math.cos(poolAimAngle) * lineLength;
    var aimY = cueBase.y + Math.sin(poolAimAngle) * lineLength;

    ctx.beginPath();
    ctx.moveTo(cueBase.x, cueBase.y);
    ctx.lineTo(aimX, aimY);
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(cueX, cueY);
    ctx.lineTo(cueBase.x - Math.cos(poolAimAngle) * 18, cueBase.y - Math.sin(poolAimAngle) * 18);
    ctx.strokeStyle = '#d4b17c';
    ctx.lineWidth = 6;
    ctx.stroke();
}

function drawPoolTable() {
    var canvas = document.getElementById('pool-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var match = getPoolMatch();

    drawTableBackground(ctx, canvas);

    if (!match || !match.table || !Array.isArray(match.table.balls)) {
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = '600 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('等待球桌開局', canvas.width / 2, canvas.height / 2);
        return;
    }

    drawAimLine(ctx, match);

    for (var i = 0; i < match.table.balls.length; i += 1) {
        var ball = match.table.balls[i];
        if (ball.number === 0 && match.shotState && match.shotState.ballInHand && match.isMyTurn) continue;
        if (ball.pocketed) continue;
        drawBall(ctx, ball, false);
    }

    if (match.shotState && match.shotState.ballInHand && match.isMyTurn) {
        drawBall(ctx, {
            number: 0,
            x: poolCuePlacement.x,
            y: poolCuePlacement.y
        }, true);
    }
}

function bindPoolCanvas() {
    var canvas = document.getElementById('pool-canvas');
    if (!canvas || canvas.dataset.bound === '1') return;

    canvas.addEventListener('mousemove', function (event) {
        var match = getPoolMatch();
        if (!match || !match.isMyTurn || match.status !== 'active') return;
        updateAimFromPoint(poolCanvasPointFromEvent(event));
    });

    canvas.addEventListener('click', function (event) {
        onPoolCanvasPointer(event);
    });

    canvas.addEventListener('touchstart', function (event) {
        onPoolCanvasPointer(event);
        event.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', function (event) {
        var match = getPoolMatch();
        if (!match || !match.isMyTurn || match.status !== 'active') return;
        updateAimFromPoint(poolCanvasPointFromEvent(event));
        event.preventDefault();
    }, { passive: false });

    canvas.dataset.bound = '1';
}

function bindPoolControls() {
    var powerRange = document.getElementById('shot-power-range');
    if (powerRange && powerRange.dataset.bound !== '1') {
        powerRange.addEventListener('input', function () {
            poolShotPower = Number(powerRange.value || 62) / 100;
            setAimPowerValue();
            drawPoolTable();
        });
        powerRange.dataset.bound = '1';
    }
    setAimPowerValue();
}

function initPoolDuelPage() {
    bindPoolCanvas();
    bindPoolControls();
    drawPoolTable();
    syncPoolStatus(false);
    poolPollTimer = window.setInterval(function () {
        syncPoolStatus(true);
    }, 3000);
}
