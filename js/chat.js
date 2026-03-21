var chatPollTimer = null;
var chatAutoStartTimer = null;
var chatReconnectTimer = null;
var chatLastRenderKey = "";
var chatWidgetCollapsed = true;
var chatSeenMessageIds = {};
var chatHasBootstrappedMessages = false;
var chatBarrageQueue = [];
var chatBarrageFlushTimer = null;
var chatScrollFrame = null;
var chatStarted = false;
var chatRoomOptions = [];
var currentChatRoomId = "public";
var chatMessages = [];
var chatMessageIds = {};
var chatCursor = "";
var chatSocket = null;
var chatSocketConnecting = false;
var chatRealtimeEnabled = false;
var BARRAGE_LANE_COUNT = 8;
var BARRAGE_LANE_BASE_TOP = 70;
var BARRAGE_LANE_GAP = 42;
var BARRAGE_MIN_DURATION = 7;
var BARRAGE_MAX_DURATION = 14;
var CHAT_POLL_INTERVAL_MS = 3000;
var CHAT_REALTIME_RECONNECT_MS = 3000;
var barrageLaneNextReadyAt = new Array(BARRAGE_LANE_COUNT).fill(0);

function isChatRealtimeConfigured() {
    if (window.CHAT_REALTIME_URL) return true;
    return window.CHAT_REALTIME_ENABLED === true ||
        String(window.CHAT_REALTIME_ENABLED || "").trim().toLowerCase() === "true";
}

function getStoredBarrageEnabled() {
    try {
        return localStorage.getItem("casino_barrage_enabled") !== "false";
    } catch (error) {
        return true;
    }
}

function escapeChatHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getChatDisplayName(item) {
    if (!item) return "匿名玩家";
    var name = String(item.displayName || "").trim();
    if (name) return name;
    var address = String(item.address || "").trim();
    if (!address) return "匿名玩家";
    if (address.length <= 12) return address;
    return address.slice(0, 6) + "..." + address.slice(-4);
}

function formatChatTime(iso) {
    var ts = Date.parse(String(iso || ""));
    if (!Number.isFinite(ts)) return "--:--";
    var date = new Date(ts);
    var hh = String(date.getHours()).padStart(2, "0");
    var mm = String(date.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
}

function getGlobalBarrageLayer() {
    return document.getElementById("global-barrage-layer");
}

function getChatStatusElement() {
    return document.getElementById("chat-status");
}

function setChatStatus(text, isError) {
    var status = getChatStatusElement();
    if (!status) return;
    status.innerText = text || "";
    status.style.color = isError ? "#ff8d8d" : "";
}

function getCurrentRoomLabel() {
    var room = (chatRoomOptions || []).find(function (item) {
        return item && item.id === currentChatRoomId;
    });
    return room && room.label ? room.label : "公共大廳";
}

function updateChatConnectionStatus() {
    var modeText = chatRealtimeEnabled ? "即時連線" : "同步中";
    var roomLabel = getCurrentRoomLabel();
    var countText = String(chatMessages.length || 0);
    setChatStatus(roomLabel + " " + modeText + " " + countText + " 則", false);
}

function renderRoomSelectOptions() {
    var select = document.getElementById("chat-room-select");
    var note = document.getElementById("chat-room-note");
    if (!select) return;

    var options = Array.isArray(chatRoomOptions) && chatRoomOptions.length
        ? chatRoomOptions
        : [{ id: "public", label: "公共大廳", requiredLevel: null }];

    select.innerHTML = options.map(function (room) {
        var requirement = room.requiredLevel ? " VIP " + room.requiredLevel : "";
        return '<option value="' + escapeChatHtml(room.id) + '">' + escapeChatHtml((room.label || room.id) + requirement) + "</option>";
    }).join("");

    var hasCurrent = options.some(function (room) {
        return room.id === currentChatRoomId;
    });
    if (!hasCurrent) {
        currentChatRoomId = options[0].id || "public";
    }
    select.value = currentChatRoomId;

    var activeRoom = options.find(function (room) {
        return room.id === currentChatRoomId;
    }) || options[0];
    if (note && activeRoom) {
        var requirementText = activeRoom.requiredLevel
            ? ("限 VIP " + activeRoom.requiredLevel + " 以上")
            : "所有玩家皆可加入";
        var token = activeRoom.bettingToken || null;
        var tokenText = "";
        if (token && token.symbol) {
            tokenText = token.bettingEnabled
                ? (" | 下注幣別: " + token.symbol)
                : (" | 幣別: " + token.symbol + " (目前停用)");
        }
        var announcementText = activeRoom.announcement ? (" | " + activeRoom.announcement) : "";
        note.innerText = "目前房間: " + (activeRoom.label || activeRoom.id) + " | " + requirementText + tokenText + announcementText;
    }
}

function resetChatRoomState(roomId) {
    currentChatRoomId = String(roomId || "public");
    chatMessages = [];
    chatMessageIds = {};
    chatCursor = "";
    chatLastRenderKey = "";
    chatSeenMessageIds = {};
    chatHasBootstrappedMessages = false;
}

function onChatRoomChange() {
    var select = document.getElementById("chat-room-select");
    if (!select) return;
    resetChatRoomState(select.value || "public");
    renderRoomSelectOptions();
    if (chatRealtimeEnabled && chatSocket && chatSocket.readyState === window.WebSocket.OPEN) {
        sendRealtimeJoin();
        return;
    }
    loadChatMessages({ forceSnapshot: true });
}

function bindChatInputIfNeeded() {
    var input = document.getElementById("chat-input");
    if (!input || input.dataset.chatEnterBound) return;
    input.dataset.chatEnterBound = "1";
    input.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage("chat");
        }
    });
}

function ensureGlobalChatUi() {
    if (!document || !document.body) return;

    if (!document.getElementById("global-barrage-layer")) {
        var barrageLayer = document.createElement("div");
        barrageLayer.id = "global-barrage-layer";
        barrageLayer.className = "global-barrage-layer hidden";
        document.body.appendChild(barrageLayer);
    }

    if (!document.getElementById("lobby-chat-widget")) {
        var wrapper = document.createElement("section");
        wrapper.className = "global-chat-widget chat-widget-collapsed";
        wrapper.id = "lobby-chat-widget";
        wrapper.innerHTML = [
            '<div class="lobby-chat-header">',
            "<div><h2>Community</h2></div>",
            '<div class="chat-header-actions">',
            '<div id="chat-status" class="chat-status">聊天室連線中...</div>',
            '<select id="chat-room-select" class="text-input chat-room-select" onchange="onChatRoomChange()"></select>',
            '<button class="chat-toggle-btn" id="chat-toggle-btn" onclick="toggleLobbyChatWidget()" aria-expanded="false">展開</button>',
            "</div>",
            "</div>",
            '<div id="chat-room-note" class="chat-room-note"></div>',
            '<div id="chat-widget-body" class="hidden">',
            '<div id="chat-message-list" class="chat-message-list"></div>',
            '<div class="chat-input-row">',
            '<input id="chat-input" class="text-input chat-input" maxlength="160" placeholder="輸入留言，所有玩家都看得到...">',
            '<button class="btn-primary" onclick="sendChatMessage(\'chat\')">送出</button>',
            "</div>",
            "</div>"
        ].join("");
        document.body.appendChild(wrapper);
    }

    bindChatInputIfNeeded();
}

function setGlobalBarrageEnabled(enabled) {
    var layer = getGlobalBarrageLayer();
    if (!layer) return;
    if (enabled) {
        layer.classList.remove("hidden");
        return;
    }
    layer.classList.add("hidden");
    layer.innerHTML = "";
    chatBarrageQueue = [];
    barrageLaneNextReadyAt = new Array(BARRAGE_LANE_COUNT).fill(0);
    if (chatBarrageFlushTimer) {
        clearTimeout(chatBarrageFlushTimer);
        chatBarrageFlushTimer = null;
    }
}

function scrollChatToLatest() {
    var list = document.getElementById("chat-message-list");
    if (!list) return;

    function commitScroll() {
        list.scrollTop = list.scrollHeight;
    }

    if (chatScrollFrame && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(chatScrollFrame);
        chatScrollFrame = null;
    }

    if (typeof window.requestAnimationFrame === "function") {
        chatScrollFrame = window.requestAnimationFrame(function () {
            chatScrollFrame = window.requestAnimationFrame(function () {
                chatScrollFrame = null;
                commitScroll();
            });
        });
        return;
    }

    window.setTimeout(commitScroll, 0);
}

function applyLobbyChatWidgetState() {
    var body = document.getElementById("chat-widget-body");
    var btn = document.getElementById("chat-toggle-btn");
    var widget = document.getElementById("lobby-chat-widget");
    if (!body || !btn || !widget) return;

    if (chatWidgetCollapsed) {
        body.classList.add("hidden");
        widget.classList.add("chat-widget-collapsed");
        btn.innerText = "展開";
        btn.setAttribute("aria-expanded", "false");
    } else {
        body.classList.remove("hidden");
        widget.classList.remove("chat-widget-collapsed");
        btn.innerText = "收合";
        btn.setAttribute("aria-expanded", "true");
        scrollChatToLatest();
    }
}

function toggleLobbyChatWidget() {
    chatWidgetCollapsed = !chatWidgetCollapsed;
    applyLobbyChatWidgetState();
}

function renderChatMessages(rows, queueBarrage) {
    var list = document.getElementById("chat-message-list");
    if (!list) return;
    var items = Array.isArray(rows) ? rows : [];
    var key = items.map(function (item) {
        return item && item.id ? item.id : "";
    }).join("|");
    if (chatLastRenderKey === key) return;
    chatLastRenderKey = key;

    list.innerHTML = items.map(function (item) {
        return '<div class="chat-message-row">' +
            '<div class="chat-message-head">' +
            '<span class="chat-message-user">' + escapeChatHtml(getChatDisplayName(item)) + "</span>" +
            '<span class="chat-message-time">' + escapeChatHtml(formatChatTime(item.createdAt)) + "</span>" +
            "</div>" +
            '<div class="chat-message-body">' + escapeChatHtml(item.message || "") + "</div>" +
            "</div>";
    }).join("");

    scrollChatToLatest();
    if (queueBarrage) {
        queueBarrageMessages(items);
    }
}

function queueBarrageMessages(rows) {
    if (!getStoredBarrageEnabled()) return;
    var items = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < items.length; i += 1) {
        var item = items[i] || {};
        var id = String(item.id || "");
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
    if (!layer || !getStoredBarrageEnabled()) return;

    var isWinner = item && item.type === "winner";
    var text = (isWinner ? "中獎 " : "聊天 ") + getChatDisplayName(item) + "：" + String(item && item.message || "");
    var textLen = text.length;
    var duration = Math.min(BARRAGE_MAX_DURATION, Math.max(BARRAGE_MIN_DURATION, 5 + textLen * 0.08));

    var node = document.createElement("div");
    node.className = "global-barrage-item" + (isWinner ? " winner" : "");
    node.style.top = (BARRAGE_LANE_BASE_TOP + laneIndex * BARRAGE_LANE_GAP) + "px";
    node.style.animationDuration = duration + "s";
    node.textContent = text;
    layer.appendChild(node);

    var nowTs = Date.now();
    barrageLaneNextReadyAt[laneIndex] = nowTs + Math.max(2200, duration * 380);
    node.addEventListener("animationend", function () {
        if (node.parentNode) node.parentNode.removeChild(node);
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

    renderBarrageItem(chatBarrageQueue.shift(), laneIndex);
    chatBarrageFlushTimer = setTimeout(flushBarrageQueue, 200);
}

function buildChatListUrl(sinceId) {
    var params = [
        "action=list",
        "limit=60",
        "roomId=" + encodeURIComponent(currentChatRoomId)
    ];
    if (window.user && user.sessionId) {
        params.push("sessionId=" + encodeURIComponent(String(user.sessionId)));
    }
    if (sinceId) {
        params.push("sinceId=" + encodeURIComponent(String(sinceId)));
    }
    return "/api/chat?" + params.join("&");
}

function upsertChatMessages(rows, replaceAll) {
    var items = Array.isArray(rows) ? rows : [];
    var newItems = [];

    if (replaceAll) {
        chatMessages = [];
        chatMessageIds = {};
    }

    for (var i = 0; i < items.length; i += 1) {
        var item = items[i] || {};
        var id = String(item.id || "");
        if (!id) continue;
        if (chatMessageIds[id]) continue;
        chatMessageIds[id] = true;
        chatMessages.push(item);
        newItems.push(item);
    }

    if (chatMessages.length > 60) {
        chatMessages = chatMessages.slice(-60);
        var nextIds = {};
        for (var j = 0; j < chatMessages.length; j += 1) {
            nextIds[String(chatMessages[j].id || "")] = true;
        }
        chatMessageIds = nextIds;
    }

    return newItems;
}

function markSnapshotAsSeen(rows) {
    var items = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < items.length; i += 1) {
        var id = String((items[i] || {}).id || "");
        if (id) chatSeenMessageIds[id] = true;
    }
}

function applyChatPayload(data, mode) {
    if (!data || data.success === false) {
        throw new Error((data && data.error) || "聊天室同步失敗");
    }

    if (Array.isArray(data.rooms) && data.rooms.length) {
        chatRoomOptions = data.rooms;
    }
    if (data.room && data.room.id) {
        currentChatRoomId = String(data.room.id);
    }
    renderRoomSelectOptions();

    var isSnapshot = mode === "snapshot";
    var incomingRows = Array.isArray(data.messages) ? data.messages : [];
    var newItems = upsertChatMessages(incomingRows, isSnapshot);
    chatCursor = String(data.cursor || chatCursor || "");

    if (!chatHasBootstrappedMessages || isSnapshot) {
        renderChatMessages(chatMessages, false);
        markSnapshotAsSeen(chatMessages);
        chatHasBootstrappedMessages = true;
    } else if (newItems.length) {
        renderChatMessages(chatMessages, true);
    }

    updateChatConnectionStatus();
}

function handleRealtimeSnapshot(payload) {
    if (Array.isArray(payload.rooms) && payload.rooms.length) {
        chatRoomOptions = payload.rooms;
    }
    if (payload.room && payload.room.id) {
        resetChatRoomState(payload.room.id);
    } else {
        resetChatRoomState(currentChatRoomId);
    }
    renderRoomSelectOptions();
    upsertChatMessages(Array.isArray(payload.messages) ? payload.messages : [], true);
    chatCursor = String(payload.cursor || "");
    renderChatMessages(chatMessages, false);
    markSnapshotAsSeen(chatMessages);
    chatHasBootstrappedMessages = true;
    updateChatConnectionStatus();
}

function handleRealtimeMessage(payload) {
    if (!payload || String(payload.roomId || "") !== currentChatRoomId) return;
    var newItems = upsertChatMessages([payload.message], false);
    if (newItems.length) {
        chatCursor = String(payload.cursor || newItems[newItems.length - 1].id || chatCursor);
        renderChatMessages(chatMessages, chatHasBootstrappedMessages);
        if (!chatHasBootstrappedMessages) {
            markSnapshotAsSeen(chatMessages);
            chatHasBootstrappedMessages = true;
        }
        updateChatConnectionStatus();
    }
}

function startPollingLoop() {
    if (chatPollTimer) return;
    chatPollTimer = setInterval(function () {
        loadChatMessages({ sinceId: chatCursor || "" });
    }, CHAT_POLL_INTERVAL_MS);
}

function stopPollingLoop() {
    if (!chatPollTimer) return;
    clearInterval(chatPollTimer);
    chatPollTimer = null;
}

function buildChatRealtimeUrl() {
    if (window.CHAT_REALTIME_URL) return String(window.CHAT_REALTIME_URL);
    if (!isChatRealtimeConfigured()) return "";
    if (!window.location) return "";
    var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + window.location.host + "/chat";
}

function clearReconnectTimer() {
    if (!chatReconnectTimer) return;
    clearTimeout(chatReconnectTimer);
    chatReconnectTimer = null;
}

function scheduleRealtimeReconnect() {
    clearReconnectTimer();
    if (!chatStarted || !isChatRealtimeConfigured()) return;
    chatReconnectTimer = setTimeout(function () {
        connectChatRealtime();
    }, CHAT_REALTIME_RECONNECT_MS);
}

function closeChatRealtime() {
    clearReconnectTimer();
    chatSocketConnecting = false;
    chatRealtimeEnabled = false;
    if (!chatSocket) return;
    try {
        chatSocket.onopen = null;
        chatSocket.onmessage = null;
        chatSocket.onerror = null;
        chatSocket.onclose = null;
        if (chatSocket.readyState === window.WebSocket.OPEN || chatSocket.readyState === window.WebSocket.CONNECTING) {
            chatSocket.close();
        }
    } catch (error) {
    }
    chatSocket = null;
}

function sendRealtimeJoin() {
    if (!chatSocket || chatSocket.readyState !== window.WebSocket.OPEN) return;
    if (!(window.user && user.sessionId)) return;
    chatSocket.send(JSON.stringify({
        type: "join",
        sessionId: user.sessionId,
        roomId: currentChatRoomId
    }));
}

function connectChatRealtime() {
    if (!isChatRealtimeConfigured()) {
        chatRealtimeEnabled = false;
        startPollingLoop();
        updateChatConnectionStatus();
        return;
    }
    if (!window.WebSocket || !(window.user && user.sessionId)) {
        startPollingLoop();
        return;
    }
    if (chatSocketConnecting || (chatSocket && (chatSocket.readyState === window.WebSocket.OPEN || chatSocket.readyState === window.WebSocket.CONNECTING))) {
        return;
    }

    var realtimeUrl = buildChatRealtimeUrl();
    if (!realtimeUrl) {
        startPollingLoop();
        return;
    }

    chatSocketConnecting = true;
    try {
        chatSocket = new window.WebSocket(realtimeUrl);
    } catch (error) {
        chatSocketConnecting = false;
        startPollingLoop();
        scheduleRealtimeReconnect();
        return;
    }

    chatSocket.onopen = function () {
        chatSocketConnecting = false;
        chatRealtimeEnabled = true;
        stopPollingLoop();
        sendRealtimeJoin();
        updateChatConnectionStatus();
    };

    chatSocket.onmessage = function (event) {
        var payload = null;
        try {
            payload = JSON.parse(String(event.data || "{}"));
        } catch (error) {
            return;
        }

        var type = String(payload.type || "").toLowerCase();
        if (type === "snapshot") {
            handleRealtimeSnapshot(payload);
            return;
        }
        if (type === "message") {
            handleRealtimeMessage(payload);
            return;
        }
        if (type === "error") {
            if (payload.code === "ROOM_FORBIDDEN" && currentChatRoomId !== "public") {
                resetChatRoomState("public");
                renderRoomSelectOptions();
                setChatStatus("VIP 房權限不足，已切回公共大廳", true);
                if (chatRealtimeEnabled) sendRealtimeJoin();
                else loadChatMessages({ forceSnapshot: true });
                return;
            }
            setChatStatus(String(payload.message || "聊天室即時連線失敗"), true);
        }
    };

    chatSocket.onerror = function () {
        setChatStatus("聊天室即時連線失敗，改用同步模式", true);
    };

    chatSocket.onclose = function () {
        chatSocketConnecting = false;
        chatRealtimeEnabled = false;
        chatSocket = null;
        startPollingLoop();
        updateChatConnectionStatus();
        scheduleRealtimeReconnect();
    };
}

function loadChatMessages(options) {
    var config = options && typeof options === "object" ? options : {};
    var sinceId = config.forceSnapshot ? "" : String(config.sinceId || "");
    return fetch(buildChatListUrl(sinceId))
        .then(function (res) { return res.json(); })
        .then(function (data) {
            applyChatPayload(data, sinceId ? "delta" : "snapshot");
        })
        .catch(function (error) {
            var message = String(error && error.message || "聊天室同步失敗");
            if (message.indexOf("權限") >= 0 && currentChatRoomId !== "public") {
                resetChatRoomState("public");
                renderRoomSelectOptions();
                setChatStatus("VIP 房權限不足，已切回公共大廳", true);
                return loadChatMessages({ forceSnapshot: true });
            }
            setChatStatus("聊天室同步失敗: " + message, true);
        });
}

function sendChatMessage(type) {
    var input = document.getElementById("chat-input");
    if (!input || !(window.user && user.sessionId)) return;

    var message = String(input.value || "").trim();
    if (!message) {
        setChatStatus("請先輸入留言", true);
        return;
    }

    setChatStatus("送出中...", false);
    fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "send",
            sessionId: user.sessionId,
            type: type === "winner" ? "winner" : "chat",
            message: message,
            roomId: currentChatRoomId
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) {
                throw new Error((data && data.error) || "送出失敗");
            }
            input.value = "";
            if (data.message && data.message.id) {
                var newItems = upsertChatMessages([data.message], false);
                if (newItems.length) {
                    chatCursor = String(data.cursor || data.message.id || chatCursor);
                    renderChatMessages(chatMessages, chatHasBootstrappedMessages);
                    if (!chatHasBootstrappedMessages) {
                        markSnapshotAsSeen(chatMessages);
                        chatHasBootstrappedMessages = true;
                    }
                }
            }
            updateChatConnectionStatus();
            setChatStatus("訊息已送出", false);
        })
        .catch(function (error) {
            setChatStatus("送出失敗: " + String(error && error.message || "未知錯誤"), true);
        });
}

function startLobbyChat() {
    if (chatStarted) return;
    chatStarted = true;
    ensureGlobalChatUi();
    bindChatInputIfNeeded();
    stopLobbyChat();
    resetChatRoomState("public");
    chatRoomOptions = [];
    chatWidgetCollapsed = true;
    chatBarrageQueue = [];
    barrageLaneNextReadyAt = new Array(BARRAGE_LANE_COUNT).fill(0);
    applyLobbyChatWidgetState();
    renderRoomSelectOptions();
    setGlobalBarrageEnabled(getStoredBarrageEnabled());
    loadChatMessages({ forceSnapshot: true }).finally(function () {
        connectChatRealtime();
        if (!chatRealtimeEnabled) {
            startPollingLoop();
        }
    });
}

function stopLobbyChat() {
    stopPollingLoop();
    closeChatRealtime();
    if (chatBarrageFlushTimer) {
        clearTimeout(chatBarrageFlushTimer);
        chatBarrageFlushTimer = null;
    }
}

function maybeStartGlobalChat() {
    var hasSession = !!(window.user && user.sessionId);
    if (!hasSession) return;
    ensureGlobalChatUi();
    bindChatInputIfNeeded();
    if (!chatStarted) {
        startLobbyChat();
    }
    if (chatAutoStartTimer) {
        clearInterval(chatAutoStartTimer);
        chatAutoStartTimer = null;
    }
}

window.onChatRoomChange = onChatRoomChange;
window.toggleLobbyChatWidget = toggleLobbyChatWidget;
window.sendChatMessage = sendChatMessage;
window.startLobbyChat = startLobbyChat;
window.stopLobbyChat = stopLobbyChat;
window.setGlobalBarrageEnabled = setGlobalBarrageEnabled;
window.loadChatMessages = loadChatMessages;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
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
