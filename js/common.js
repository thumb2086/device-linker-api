/* === 閃電賭場 - 共用工具 === */

// 全域用戶狀態
var user = { address: '', publicKey: '', sessionId: '' };

function toSafeNumber(value, fallback) {
    var parsed = Number(String(value === undefined || value === null ? '' : value).replace(/,/g, '').trim());
    if (!Number.isFinite(parsed)) return (fallback !== undefined ? fallback : 0);
    return parsed;
}

/**
 * 更新 UI 上的用戶數據 (餘額、VIP、累計押注)
 */
function updateUI(data) {
    if (!data) return;

    if (data.balance !== undefined) {
        var balanceNum = toSafeNumber(data.balance, 0);
        var balEl = document.getElementById('balance-val');
        if (balEl) balEl.innerText = balanceNum.toLocaleString(undefined, { minimumFractionDigits: 2 });
        // 也更新 header 上的餘額
        var hBal = document.getElementById('header-balance');
        if (hBal) hBal.innerText = balanceNum.toLocaleString(undefined, { minimumFractionDigits: 2 });
    }

    if (data.totalBet !== undefined) {
        var totalBetNum = toSafeNumber(data.totalBet, 0);
        var tbEl = document.getElementById('total-bet-val');
        if (tbEl) tbEl.innerText = totalBetNum.toFixed(2);
    }

    if (data.vipLevel) {
        var badge = document.getElementById('vip-badge');
        if (badge) badge.innerText = data.vipLevel;

        var hVip = document.getElementById('header-vip');
        if (hVip) hVip.innerText = data.vipLevel;

        var card = document.getElementById('main-card');
        if (card) {
            if (data.vipLevel.indexOf('鑽石') !== -1 || data.vipLevel.indexOf('VIP') !== -1) {
                card.classList.add('vip-diamond');
            } else {
                card.classList.remove('vip-diamond');
            }
        }
    }
}

/**
 * 從 API 刷新餘額
 */
function refreshBalance() {
    if (!user.address) return;

    // 如果有待開獎的下注，我們可能不想直接刷新 UI 餘額以免跳動
    // 但為了準確性，我們還是獲取最新餘額，但在 UI 更新時做點處理
    fetch('/api/get-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.address })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            // 如果遊戲腳本有定義 calcDisplayBalance，則使用它
            if (typeof calcDisplayBalance === 'function') {
                updateUI({ balance: calcDisplayBalance(data.balance) });
            } else {
                updateUI({ balance: data.balance });
            }
        }
    })
    .catch(function(e) { console.log('Balance refresh failed'); });
}

/**
 * 開始定期刷新餘額
 */
function startBalanceRefresh() {
    setTimeout(refreshBalance, 800);
    setInterval(refreshBalance, 30000);
}

/**
 * 格式化交易連結 HTML
 */
function txLinkHTML(txHash) {
    if (!txHash) return '';
    return '<a href="https://sepolia.etherscan.io/tx/' + txHash + '" target="_blank" style="color: #888; text-decoration: underline;">' +
        '🔗 查看區塊鏈交易憑證 (Etherscan)</a>';
}

function ensurePageTransitionEl() {
    var existing = document.getElementById('page-transition');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.id = 'page-transition';
    overlay.className = 'page-transition';
    overlay.innerHTML = '<div class="page-transition-text"><span class="loader"></span><span id="page-transition-msg">載入中...</span></div>';
    document.body.appendChild(overlay);
    return overlay;
}

function showPageTransition(message) {
    var overlay = ensurePageTransitionEl();
    var msg = document.getElementById('page-transition-msg');
    if (msg && message) msg.innerText = message;
    overlay.classList.add('show');
}

function hidePageTransition() {
    var overlay = document.getElementById('page-transition');
    if (!overlay) return;
    overlay.classList.remove('show');
}

/* === 全站聊天室 + 彈幕 === */
var CHAT_STORAGE_KEY = 'zxc_global_chat_messages_v1';
var WIN_STORAGE_KEY = 'zxc_global_win_messages_v1';
var CHAT_MAX_MESSAGES = 80;
var chatState = {
    latestChatId: 0,
    latestWinId: 0
};

function safeJsonParse(raw, fallback) {
    try {
        var parsed = JSON.parse(raw);
        return parsed || fallback;
    } catch (e) {
        return fallback;
    }
}

function readMessageList(storageKey) {
    return safeJsonParse(localStorage.getItem(storageKey) || '[]', []);
}

function writeMessageList(storageKey, list) {
    localStorage.setItem(storageKey, JSON.stringify(list.slice(-CHAT_MAX_MESSAGES)));
}

function getDisplayName() {
    if (user && user.address) return user.address.slice(0, 6) + '...' + user.address.slice(-4);
    return '訪客';
}

function nextMessageId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

function ensureGlobalChatUI() {
    if (document.getElementById('global-chat-root')) return;

    var root = document.createElement('div');
    root.id = 'global-chat-root';
    root.innerHTML = '' +
        '<div id="global-barrage-layer"></div>' +
        '<button id="global-chat-toggle" class="global-chat-toggle" title="聊天室">💬 聊天室</button>' +
        '<div id="global-chat-panel" class="global-chat-panel hidden">' +
            '<div class="global-chat-head">全站聊天室</div>' +
            '<div id="global-chat-list" class="global-chat-list"></div>' +
            '<div class="global-chat-input-row">' +
                '<input id="global-chat-input" type="text" maxlength="80" placeholder="登入後才能聊天" disabled />' +
                '<button id="global-chat-send" type="button">送出</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(root);

    var toggleBtn = document.getElementById('global-chat-toggle');
    var panel = document.getElementById('global-chat-panel');
    var input = document.getElementById('global-chat-input');
    var sendBtn = document.getElementById('global-chat-send');

    toggleBtn.addEventListener('click', function () {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) input.focus();
    });

    sendBtn.addEventListener('click', submitGlobalChatMessage);
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitGlobalChatMessage();
    });

    updateChatAccessUI();
}

function renderGlobalChat() {
    var listEl = document.getElementById('global-chat-list');
    if (!listEl) return;

    var messages = readMessageList(CHAT_STORAGE_KEY);
    listEl.innerHTML = messages.map(function (msg) {
        return '<div class="global-chat-item"><span class="name">' + msg.name + '</span><span class="text">' + msg.text + '</span></div>';
    }).join('');
    listEl.scrollTop = listEl.scrollHeight;
}

function showBarrage(text, type) {
    var layer = document.getElementById('global-barrage-layer');
    if (!layer || !text) return;

    var item = document.createElement('div');
    item.className = 'global-barrage-item ' + (type === 'win' ? 'win' : 'chat');
    item.innerText = text;
    item.style.top = (8 + Math.random() * 28) + 'vh';
    item.style.animationDuration = (8 + Math.random() * 4).toFixed(1) + 's';
    layer.appendChild(item);

    setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
    }, 13000);
}

function processNewChatForBarrage() {
    var messages = readMessageList(CHAT_STORAGE_KEY);
    var latest = chatState.latestChatId;
    messages.forEach(function (msg) {
        if (msg.id > latest) {
            showBarrage('💬 ' + msg.name + ': ' + msg.text, 'chat');
            latest = msg.id;
        }
    });
    chatState.latestChatId = latest;
}

function processNewWinForBarrage() {
    var messages = readMessageList(WIN_STORAGE_KEY);
    var latest = chatState.latestWinId;
    messages.forEach(function (msg) {
        if (msg.id > latest) {
            showBarrage('🏆 ' + msg.text, 'win');
            latest = msg.id;
        }
    });
    chatState.latestWinId = latest;
}


function isChatAuthenticated() {
    return !!(user && user.sessionId && user.address);
}

function updateChatAccessUI() {
    var toggleBtn = document.getElementById('global-chat-toggle');
    var panel = document.getElementById('global-chat-panel');
    var input = document.getElementById('global-chat-input');
    var sendBtn = document.getElementById('global-chat-send');
    if (!toggleBtn || !panel || !input || !sendBtn) return;

    var authed = isChatAuthenticated();
    toggleBtn.classList.toggle('hidden', !authed);
    if (!authed) panel.classList.add('hidden');

    input.disabled = !authed;
    sendBtn.disabled = !authed;
    input.placeholder = authed ? '輸入訊息，按 Enter 送出' : '登入後才能聊天';
}
function submitGlobalChatMessage() {
    if (!isChatAuthenticated()) return;

    var input = document.getElementById('global-chat-input');
    if (!input) return;

    var text = (input.value || '').trim();
    if (!text) return;

    var messages = readMessageList(CHAT_STORAGE_KEY);
    messages.push({
        id: nextMessageId(),
        name: getDisplayName(),
        text: text
    });
    writeMessageList(CHAT_STORAGE_KEY, messages);
    input.value = '';
    renderGlobalChat();
    processNewChatForBarrage();
}

function emitWinBarrage(payload) {
    var amount = toSafeNumber(payload && payload.amount, 0);
    var payout = toSafeNumber(payload && payload.payout, 0);
    var game = (payload && payload.game) ? payload.game : '遊戲';
    var multi = payload && payload.multiplier ? '，倍率 ' + payload.multiplier + 'x' : '';
    var text = (payload && payload.title ? payload.title : ('[' + game + '] ' + getDisplayName() + ' 中獎')) +
        '｜下注 ' + amount.toFixed(2) + ' ZXC' +
        '｜派彩 ' + payout.toFixed(2) + ' ZXC' + multi;

    var messages = readMessageList(WIN_STORAGE_KEY);
    messages.push({ id: nextMessageId(), text: text });
    writeMessageList(WIN_STORAGE_KEY, messages);
    processNewWinForBarrage();
}

window.emitWinBarrage = emitWinBarrage;

function initGlobalChatSystem() {
    ensureGlobalChatUI();

    var chatMessages = readMessageList(CHAT_STORAGE_KEY);
    var winMessages = readMessageList(WIN_STORAGE_KEY);

    chatState.latestChatId = chatMessages.length ? chatMessages[chatMessages.length - 1].id : 0;
    chatState.latestWinId = winMessages.length ? winMessages[winMessages.length - 1].id : 0;

    renderGlobalChat();

    updateChatAccessUI();
    setInterval(updateChatAccessUI, 1000);

    window.addEventListener('storage', function (e) {
        if (e.key === CHAT_STORAGE_KEY) {
            renderGlobalChat();
            processNewChatForBarrage(); // 只有新訊息才會跳
        }
        if (e.key === WIN_STORAGE_KEY) {
            processNewWinForBarrage();
        }
        if (e.key === 'casino_auth') {
            updateChatAccessUI();
        }
    });
}

document.addEventListener('DOMContentLoaded', initGlobalChatSystem);
