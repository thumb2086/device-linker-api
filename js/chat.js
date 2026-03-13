var chatPollTimer = null;
var chatAutoStartTimer = null;
var chatLastRenderKey = '';
var chatWidgetCollapsed = true;
var chatSeenMessageIds = {};
var chatHasBootstrappedMessages = false;
var chatBarrageQueue = [];
var chatBarrageFlushTimer = null;
var BARRAGE_LANE_COUNT = 8;
var BARRAGE_LANE_BASE_TOP = 70;
var BARRAGE_LANE_GAP = 42;
var BARRAGE_MIN_DURATION = 7;
var BARRAGE_MAX_DURATION = 14;
var barrageLaneNextReadyAt = new Array(BARRAGE_LANE_COUNT).fill(0);
var chatStarted = false;
var chatRoomOptions = [];
var currentChatRoomId = 'public';

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


function renderRoomSelectOptions() {
    var select = document.getElementById('chat-room-select');
    var note = document.getElementById('chat-room-note');
    if (!select) return;

    var options = Array.isArray(chatRoomOptions) && chatRoomOptions.length ? chatRoomOptions : [{ id: 'public', label: '公共大廳', requiredLevel: null }];
    select.innerHTML = options.map(function (room) {
        var lockText = room.requiredLevel ? ' 👑' : '';
        var req = room.requiredLevel ? ('（需 ' + room.requiredLevel + '）') : '';
        return '<option value="' + escapeChatHtml(room.id) + '">' + escapeChatHtml(room.label + req + lockText) + '</option>';
    }).join('');

    var hasCurrent = options.some(function (room) { return room.id === currentChatRoomId; });
    if (!hasCurrent) currentChatRoomId = 'public';
    select.value = currentChatRoomId;

    var activeRoom = options.find(function (room) { return room.id === currentChatRoomId; }) || options[0];
    if (note && activeRoom) {
        var requirementText = activeRoom.requiredLevel
            ? ('需求：' + activeRoom.requiredLevel)
            : '所有玩家可加入';
        var token = activeRoom.bettingToken || null;
        var tokenText = '';
        if (token && token.symbol) {
            tokenText = token.bettingEnabled
                ? ('｜下注幣：' + token.symbol)
                : ('｜預留幣：' + token.symbol + '（尚未上鏈）');
        }
        var announcementText = activeRoom.announcement ? ('｜' + activeRoom.announcement) : '';
        note.innerText = '目前房間：' + activeRoom.label + '（' + requirementText + '）' + tokenText + announcementText;
    }
}

function onChatRoomChange() {
    var select = document.getElementById('chat-room-select');
    if (!select) return;
    currentChatRoomId = String(select.value || 'public');
    chatLastRenderKey = '';
    chatSeenMessageIds = {};
    chatHasBootstrappedMessages = false;
    renderRoomSelectOptions();
    loadChatMessages();
}

function ensureGlobalChatUi() {
    if (!document || !document.body) return;

    if (!document.getElementById('global-barrage-layer')) {
        var barrageLayer = document.createElement('div');
        barrageLayer.id = 'global-barrage-layer';
        barrageLayer.className = 'global-barrage-layer hidden';
        document.body.appendChild(barrageLayer);
    }

    if (document.getElementById('lobby-chat-widget')) return;

    var wrapper = document.createElement('section');
    wrapper.className = 'global-chat-widget';
    wrapper.id = 'lobby-chat-widget';
    wrapper.innerHTML = [
        '<div class="lobby-chat-header">',
        '<div><h2>全服聊天室</h2></div>',
        '<div class="chat-header-actions">',
        '<div id="chat-status" class="chat-status">聊天室連線中...</div>',
        '<select id="chat-room-select" class="text-input chat-room-select" onchange="onChatRoomChange()"></select>',
        '<button class="chat-toggle-btn" id="chat-toggle-btn" onclick="toggleLobbyChatWidget()" aria-expanded="true">收合</button>',
        '</div>',
        '</div>',
        '<div id="chat-room-note" class="chat-room-note"></div>',
        '<div id="chat-widget-body">',
        '<div id="chat-message-list" class="chat-message-list"></div>',
        '<div class="chat-input-row">',
        '<input id="chat-input" class="text-input chat-input" maxlength="160" placeholder="輸入留言，所有玩家都看得到...">',
        '<button class="btn-primary" onclick="sendChatMessage(\'chat\')">送出</button>',
        '</div>',
        '</div>'
    ].join('');
    document.body.appendChild(wrapper);

    var input = document.getElementById('chat-input');
    if (input && !input.dataset.chatEnterBound) {
        input.dataset.chatEnterBound = '1';
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendChatMessage('chat');
            }
        });
    }
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
        btn.innerText = '💬';
        btn.setAttribute('aria-expanded', 'false');
    } else {
        body.classList.remove('hidden');
        widget.classList.remove('chat-widget-collapsed');
        btn.innerText = '－';
        btn.setAttribute('aria-expanded', 'true');
    }
}

function toggleLobbyChatWidget() {
    chatWidgetCollapsed = !chatWidgetCollapsed;
    applyLobbyChatWidgetState();
}

function appendChatMessageRow(item) {
    var list = document.getElementById('chat-message-list');
    if (!list) return;

    var row = document.createElement('div');
    row.className = 'chat-message-row';
    row.innerHTML =
        '<div class="chat-message-head">' +
        '<span class="chat-message-user">' + escapeChatHtml(getChatDisplayName(item)) + '</span>' +
        '<span class="chat-message-time">' + escapeChatHtml(formatChatTime(item.createdAt)) + '</span>' +
        '</div>' +
        '<div class="chat-message-body">' + escapeChatHtml(item.message || '') + '</div>';

    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
}


function renderChatMessages(messages, shouldQueueBarrage) {
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
    if (shouldQueueBarrage) queueBarrageMessages(rows);
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

    var isWinner = item && item.type === 'winner';
    var text = (isWinner ? '🏆 中獎播報 ' : '💬 ') + getChatDisplayName(item) + '：' + String(item && item.message || '');
    var textLen = text.length;
    var duration = Math.min(BARRAGE_MAX_DURATION, Math.max(BARRAGE_MIN_DURATION, 5 + textLen * 0.08));

    var node = document.createElement('div');
    node.className = 'global-barrage-item' + (isWinner ? ' winner' : '');
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


function buildChatListUrl() {
    var params = [
        'action=list',
        'limit=60',
        'roomId=' + encodeURIComponent(currentChatRoomId)
    ];
    if (window.user && user.sessionId) params.push('sessionId=' + encodeURIComponent(String(user.sessionId)));
    return '/api/chat?' + params.join('&');
}

function loadChatMessages() {
    return fetch(buildChatListUrl())
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '聊天室載入失敗');
            if (Array.isArray(data.rooms) && data.rooms.length) chatRoomOptions = data.rooms;
            if (data.room && data.room.id) currentChatRoomId = String(data.room.id);
            renderRoomSelectOptions();
            var rows = data.messages || [];
            var shouldQueueBarrage = chatHasBootstrappedMessages;
            renderChatMessages(rows, shouldQueueBarrage);
            if (!chatHasBootstrappedMessages) {
                var initialItems = Array.isArray(rows) ? rows : [];
                for (var i = 0; i < initialItems.length; i += 1) {
                    var initialId = String((initialItems[i] || {}).id || '');
                    if (initialId) chatSeenMessageIds[initialId] = true;
                }
                chatHasBootstrappedMessages = true;
            }
            var status = document.getElementById('chat-status');
            var roomName = data.room && data.room.label ? data.room.label : '公共大廳';
            if (status) status.innerText = roomName + ' 同步中 · ' + String(data.returned || 0) + ' 則';
        })
        .catch(function (error) {
            var status = document.getElementById('chat-status');
            var message = String(error && error.message || '聊天室同步失敗');
            if (message.indexOf('進入') >= 0 && currentChatRoomId !== 'public') {
                currentChatRoomId = 'public';
                chatLastRenderKey = '';
                renderRoomSelectOptions();
                if (status) status.innerText = 'VIP 房目前不可進入，已切回公共大廳';
                return loadChatMessages();
            }
            if (status) status.innerText = '聊天室同步失敗：' + message;
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
            message: message,
            roomId: currentChatRoomId
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '送出失敗');
            input.value = '';
            if (status) status.innerText = '✅ 已送出至目前房間';
            
            var newMessage = data.message;
            if (!newMessage || !newMessage.id) return;

            appendChatMessageRow(newMessage);
            queueBarrageMessages([newMessage]);

        })
        .catch(function (error) {
            if (status) status.innerText = '❌ ' + error.message;
        });
}

function startLobbyChat() {
    if (chatStarted) return;
    chatStarted = true;
    ensureGlobalChatUi();
    stopLobbyChat();
    chatWidgetCollapsed = true;
    chatLastRenderKey = '';
    chatSeenMessageIds = {};
    chatHasBootstrappedMessages = false;
    chatBarrageQueue = [];
    barrageLaneNextReadyAt = new Array(BARRAGE_LANE_COUNT).fill(0);
    applyLobbyChatWidgetState();
    renderRoomSelectOptions();
    setGlobalBarrageEnabled(true);
    loadChatMessages();
    chatPollTimer = setInterval(loadChatMessages, 3500);
}

function stopLobbyChat() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }
    if (chatBarrageFlushTimer) {
        clearTimeout(chatBarrageFlushTimer);
        chatBarrageFlushTimer = null;
    }
}

function maybeStartGlobalChat() {
    var hasSession = !!(window.user && user.sessionId);
    if (!hasSession) return;
    ensureGlobalChatUi();
    startLobbyChat();
    if (chatAutoStartTimer) {
        clearInterval(chatAutoStartTimer);
        chatAutoStartTimer = null;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        ensureGlobalChatUi();
        maybeStartGlobalChat();
    });
} else {
    ensureGlobalChatUi();
    maybeStartGlobalChat();
}

if (!chatAutoStartTimer) {
    chatAutoStartTimer = setInterval(maybeStartGlobalChat, 1000);
}
