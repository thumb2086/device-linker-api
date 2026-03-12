var chatPollTimer = null;
var chatLastRenderKey = '';
var chatBarrageTimer = null;
var chatWidgetCollapsed = false;

function escapeChatHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getChatDisplayName(item) {
    if (!item) return '匿名玩家';
    var name = String(item.displayName || '').trim();
    if (name) return name;
    var address = String(item.address || '').trim();
    if (!address) return '匿名玩家';
    if (address.length <= 12) return address;
    return address.slice(0, 6) + '...' + address.slice(-4);
}

function formatChatTime(iso) {
    var ts = Date.parse(String(iso || ''));
    if (!Number.isFinite(ts)) return '--:--';
    var date = new Date(ts);
    var hh = String(date.getHours()).padStart(2, '0');
    var mm = String(date.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
}

function applyLobbyChatWidgetState() {
    var body = document.getElementById('chat-widget-body');
    var btn = document.getElementById('chat-toggle-btn');
    var widget = document.getElementById('lobby-chat-widget');
    if (!body || !btn || !widget) return;

    if (chatWidgetCollapsed) {
        body.classList.add('hidden');
        widget.classList.add('chat-widget-collapsed');
        btn.innerText = '+';
    } else {
        body.classList.remove('hidden');
        widget.classList.remove('chat-widget-collapsed');
        btn.innerText = '－';
    }
}

function toggleLobbyChatWidget() {
    chatWidgetCollapsed = !chatWidgetCollapsed;
    applyLobbyChatWidgetState();
}

function renderChatMessages(messages) {
    var list = document.getElementById('chat-message-list');
    if (!list) return;
    var rows = Array.isArray(messages) ? messages : [];
    var key = rows.map(function (item) { return item.id || ''; }).join('|');
    if (chatLastRenderKey === key) return;
    chatLastRenderKey = key;

    list.innerHTML = rows.map(function (item) {
        return '<div class="chat-message-row">' +
            '<div class="chat-message-head">' +
            '<span class="chat-message-user">' + escapeChatHtml(getChatDisplayName(item)) + '</span>' +
            '<span class="chat-message-time">' + escapeChatHtml(formatChatTime(item.createdAt)) + '</span>' +
            '</div>' +
            '<div class="chat-message-body">' + escapeChatHtml(item.message || '') + '</div>' +
            '</div>';
    }).join('');

    list.scrollTop = list.scrollHeight;
    renderChatBarrage(rows.slice(-10));
}

function loadChatMessages() {
    return fetch('/api/chat?action=list&limit=40')
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '聊天室載入失敗');
            renderChatMessages(data.messages || []);
            var status = document.getElementById('chat-status');
            if (status) status.innerText = '全服同步中 · ' + String(data.returned || 0) + ' 則';
        })
        .catch(function (error) {
            var status = document.getElementById('chat-status');
            if (status) status.innerText = '聊天室同步失敗：' + error.message;
        });
}

function sendChatMessage(type) {
    var input = document.getElementById('chat-input');
    var status = document.getElementById('chat-status');
    if (!input || !user.sessionId) return;
    var message = String(input.value || '').trim();
    if (!message) {
        if (status) status.innerText = '請先輸入訊息';
        return;
    }

    if (status) status.innerText = '送出中...';
    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'send',
            sessionId: user.sessionId,
            type: type === 'winner' ? 'winner' : 'chat',
            message: message
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '送出失敗');
            input.value = '';
            if (status) status.innerText = '✅ 已送出，全服可見';
            return loadChatMessages();
        })
        .catch(function (error) {
            if (status) status.innerText = '❌ ' + error.message;
        });
}

function renderChatBarrage(messages) {
    var lane = document.getElementById('chat-barrage-lane');
    if (!lane) return;

    if (chatBarrageTimer) {
        clearTimeout(chatBarrageTimer);
        chatBarrageTimer = null;
    }

    lane.innerHTML = messages.map(function (item, idx) {
        var delay = idx * 0.55;
        return '<div class="chat-barrage-item" style="animation-delay:' + delay + 's">💬 ' +
            escapeChatHtml(getChatDisplayName(item)) + '：' + escapeChatHtml(item.message || '') +
            '</div>';
    }).join('');

    chatBarrageTimer = setTimeout(function () {
        lane.innerHTML = '';
    }, 8600);
}

function startLobbyChat() {
    stopLobbyChat();
    chatWidgetCollapsed = false;
    applyLobbyChatWidgetState();
    loadChatMessages();
    chatPollTimer = setInterval(loadChatMessages, 3500);
}

function stopLobbyChat() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }
}
