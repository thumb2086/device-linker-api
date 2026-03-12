var chatPollTimer = null;
var chatLastRenderKey = '';
var chatWidgetCollapsed = false;
var chatSeenMessageIds = {};
var chatBarrageQueue = [];
var chatBarrageFlushTimer = null;
var BARRAGE_LANE_COUNT = 8;
var BARRAGE_LANE_BASE_TOP = 70;
var BARRAGE_LANE_GAP = 42;
var BARRAGE_MIN_DURATION = 7;
var BARRAGE_MAX_DURATION = 14;
var barrageLaneNextReadyAt = new Array(BARRAGE_LANE_COUNT).fill(0);

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

function getGlobalBarrageLayer() {
    return document.getElementById('global-barrage-layer');
}

function setGlobalBarrageEnabled(enabled) {
    var layer = getGlobalBarrageLayer();
    if (!layer) return;
    if (enabled) layer.classList.remove('hidden');
    else layer.classList.add('hidden');
}

function applyLobbyChatWidgetState() {
    var body = document.getElementById('chat-widget-body');
    var btn = document.getElementById('chat-toggle-btn');
    var widget = document.getElementById('lobby-chat-widget');
    if (!body || !btn || !widget) return;

    if (chatWidgetCollapsed) {
        body.classList.add('hidden');
        widget.classList.add('chat-widget-collapsed');
        btn.innerText = '展開';
        btn.setAttribute('aria-expanded', 'false');
    } else {
        body.classList.remove('hidden');
        widget.classList.remove('chat-widget-collapsed');
        btn.innerText = '收合';
        btn.setAttribute('aria-expanded', 'true');
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
    queueBarrageMessages(rows);
}

function queueBarrageMessages(rows) {
    var items = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < items.length; i += 1) {
        var item = items[i] || {};
        var id = String(item.id || '');
        if (!id || chatSeenMessageIds[id]) continue;
        chatSeenMessageIds[id] = true;
        chatBarrageQueue.push(item);
    }
    flushBarrageQueue();
}

function pickLane(nowTs) {
    var idx = 0;
    var best = barrageLaneNextReadyAt[0] || 0;
    for (var i = 1; i < barrageLaneNextReadyAt.length; i += 1) {
        if (barrageLaneNextReadyAt[i] < best) {
            best = barrageLaneNextReadyAt[i];
            idx = i;
        }
    }
    if (best > nowTs) return -1;
    return idx;
}

function renderBarrageItem(item, laneIndex) {
    var layer = getGlobalBarrageLayer();
    if (!layer) return;

    var text = '💬 ' + getChatDisplayName(item) + '：' + String(item && item.message || '');
    var textLen = text.length;
    var duration = Math.min(BARRAGE_MAX_DURATION, Math.max(BARRAGE_MIN_DURATION, 5 + textLen * 0.08));

    var node = document.createElement('div');
    node.className = 'global-barrage-item';
    node.style.top = (BARRAGE_LANE_BASE_TOP + laneIndex * BARRAGE_LANE_GAP) + 'px';
    node.style.animationDuration = duration + 's';
    node.textContent = text;

    layer.appendChild(node);

    var nowTs = Date.now();
    barrageLaneNextReadyAt[laneIndex] = nowTs + Math.max(2200, duration * 380);

    node.addEventListener('animationend', function () {
        if (node && node.parentNode) node.parentNode.removeChild(node);
    });
}

function flushBarrageQueue() {
    if (chatBarrageFlushTimer) {
        clearTimeout(chatBarrageFlushTimer);
        chatBarrageFlushTimer = null;
    }
    if (!chatBarrageQueue.length) return;

    var nowTs = Date.now();
    var laneIndex = pickLane(nowTs);
    if (laneIndex < 0) {
        chatBarrageFlushTimer = setTimeout(flushBarrageQueue, 260);
        return;
    }

    var next = chatBarrageQueue.shift();
    renderBarrageItem(next, laneIndex);

    chatBarrageFlushTimer = setTimeout(flushBarrageQueue, 200);
}

function loadChatMessages() {
    return fetch('/api/chat?action=list&limit=60')
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

function startLobbyChat() {
    stopLobbyChat();
    chatWidgetCollapsed = false;
    applyLobbyChatWidgetState();
    setGlobalBarrageEnabled(true);
    loadChatMessages();
    chatPollTimer = setInterval(loadChatMessages, 3500);
}

function stopLobbyChat() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }
}
