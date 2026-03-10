function duelApi(action, payload) {
    return fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
            game: 'duel',
            action: action,
            sessionId: user.sessionId
        }, payload || {}))
    }).then(function (res) { return res.json(); });
}

function setDuelStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#ffd36a';
}

function refreshDuels() {
    setDuelStatus('正在同步對局清單...', false);
    duelApi('list')
        .then(function (data) {
            if (!data || !data.success) throw new Error(data.error || '載入失敗');
            renderDuelList(data.duels || []);
            setDuelStatus('對局清單已更新', false);
        })
        .catch(function (e) {
            setDuelStatus('錯誤: ' + e.message, true);
        });
}

function renderDuelList(duels) {
    var listEl = document.getElementById('duel-list');
    if (!listEl) return;

    if (duels.length === 0) {
        listEl.innerHTML = '<div class="empty-list">目前沒有可加入的對局</div>';
        return;
    }

    listEl.innerHTML = duels.map(function (d) {
        var isMine = d.creator.toLowerCase() === user.address.toLowerCase();
        return '<div class="duel-item">' +
            '<div class="duel-info">' +
                '<span class="creator-name">' + escapeHtml(d.creatorName) + ' 的對局</span>' +
                '<span class="duel-meta">' + d.amount.toLocaleString() + ' 子熙幣</span>' +
            '</div>' +
            '<div class="duel-actions">' +
                (isMine ? '<span class="state-chip info">等待對手中</span>' :
                '<button class="btn-primary compact-btn" onclick="joinDuel(\'' + d.id + '\')">加入對賭</button>') +
            '</div>' +
            '</div>';
    }).join('');
}

function createDuel() {
    var amount = Number(document.getElementById('duel-amount').value);
    if (isNaN(amount) || amount <= 0) {
        alert('請輸入有效金額');
        return;
    }

    setDuelStatus('正在建立對局...', false);
    duelApi('create', { amount: amount })
        .then(function (data) {
            if (!data || !data.success) throw new Error(data.error || '建立失敗');
            refreshBalance();
            refreshDuels();
            setDuelStatus('對局已建立，等待其他玩家加入', false);
        })
        .catch(function (e) {
            setDuelStatus('錯誤: ' + e.message, true);
        });
}

function joinDuel(duelId) {
    if (!confirm('確定要加入此對局並扣除賭注嗎？')) return;

    setDuelStatus('對局中，請稍候...', false);
    duelApi('join', { duelId: duelId })
        .then(function (data) {
            if (!data || !data.success) throw new Error(data.error || '加入失敗');
            refreshBalance();

            var d = data.duel;
            var isWinner = d.winner.toLowerCase() === user.address.toLowerCase();
            if (isWinner) {
                alert('恭喜獲勝！獲得 ' + (d.amount * 2).toLocaleString() + ' 子熙幣');
            } else {
                alert('很遺憾，這次對賭輸了。');
            }
            refreshDuels();
        })
        .catch(function (e) {
            setDuelStatus('錯誤: ' + e.message, true);
            alert(e.message);
        });
}
