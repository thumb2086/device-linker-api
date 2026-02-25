/* === 閃電賭場 - 認證模組 === */
var authPollInterval = null;

/**
 * 從 localStorage 讀取認證資料
 * 返回 { sessionId, address, publicKey } 或 null
 */
function getStoredAuth() {
    try {
        const data = localStorage.getItem('casino_auth');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

/**
 * 儲存認證資料到 localStorage
 */
function storeAuth(sessionId, address, publicKey) {
    localStorage.setItem('casino_auth', JSON.stringify({ sessionId, address, publicKey }));
}

/**
 * 清除認證資料
 */
function clearAuth() {
    localStorage.removeItem('casino_auth');
}

/**
 * 大廳頁面用: 初始化認證流程 (QR Code + 輪詢)
 * @param {Function} onAuthorized - 認證成功後的回調
 */
function initLobbyAuth(onAuthorized) {
    // 先檢查是否已有有效 session
    const stored = getStoredAuth();
    if (stored) {
        // 驗證 session 是否仍有效
        verifySession(stored.sessionId, function(valid, data) {
            if (valid) {
                user.address = stored.address;
                user.publicKey = stored.publicKey;
                user.sessionId = stored.sessionId;
                if (onAuthorized) onAuthorized(data);
            } else {
                clearAuth();
                showQRAuth(onAuthorized);
            }
        });
        return;
    }
    showQRAuth(onAuthorized);
}

/**
 * 顯示 QR Code 認證畫面並開始輪詢
 */
function showQRAuth(onAuthorized) {
    var sessionId = 'session_' + Math.random().toString(36).substring(7);
    user.sessionId = sessionId;
    renderAuthCode(sessionId);

    var authUI = document.getElementById('auth-ui');
    if (authUI) authUI.classList.remove('hidden');
    var lobbyUI = document.getElementById('lobby-ui');
    if (lobbyUI) lobbyUI.classList.add('hidden');
    if (typeof hidePageTransition === 'function') {
        hidePageTransition();
    }

    var canvas = document.getElementById('qr-canvas');
    if (!canvas) return;

    function tryRenderQR() {
        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, 'dlinker:login:' + sessionId, { width: 200, margin: 2 });
            startAuthPolling(sessionId, onAuthorized);
        } else {
            setTimeout(tryRenderQR, 500);
        }
    }
    tryRenderQR();
}

/**
 * 輪詢認證狀態
 */
function startAuthPolling(sessionId, onAuthorized) {
    if (authPollInterval) clearInterval(authPollInterval);
    authPollInterval = setInterval(function() {
        fetch('/api/auth?sessionId=' + sessionId)
            .then(function(res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function(data) {
                if (!data || data.status !== 'authorized') return;

                clearInterval(authPollInterval);
                authPollInterval = null;
                user.address = data.address;
                user.publicKey = data.publicKey;
                user.sessionId = sessionId;

                storeAuth(sessionId, data.address, data.publicKey);

                if (onAuthorized) onAuthorized(data);
            })
            .catch(function(err) { console.error('Auth polling error:', err); });
    }, 1500);
}

function renderAuthCode(sessionId) {
    var authCodeEl = document.getElementById('auth-code');
    if (authCodeEl) authCodeEl.innerText = sessionId || '-';
}

function openAppAuth() {
    if (!user.sessionId) return;
    var authMsg = document.getElementById('auth-msg');
    if (authMsg) authMsg.innerHTML = '<span class="loader"></span> 已開啟 App 授權，等待回傳...';
    window.location.href = 'dlinker:login:' + user.sessionId;
}

function copyAuthCode() {
    if (!user.sessionId) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(user.sessionId).then(function() {
            var authMsg = document.getElementById('auth-msg');
            if (authMsg) authMsg.innerHTML = '✅ 已複製授權碼，請到 App 貼上登入';
        });
        return;
    }

    var tmp = document.createElement('input');
    tmp.value = user.sessionId;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);

    var authMsgFallback = document.getElementById('auth-msg');
    if (authMsgFallback) authMsgFallback.innerHTML = '✅ 已複製授權碼，請到 App 貼上登入';
}

/**
 * 驗證 session 是否仍有效
 */
function verifySession(sessionId, callback) {
    fetch('/api/auth?sessionId=' + sessionId)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            callback(data.status === 'authorized', data);
        })
        .catch(function() { callback(false, null); });
}

/**
 * 遊戲頁面用: 檢查認證狀態，未登入則跳回大廳
 * @param {Function} onReady - 認證有效後的回調
 */
function checkGameAuth(onReady) {
    if (typeof showPageTransition === 'function') {
        showPageTransition('驗證登入中...');
    }

    var stored = getStoredAuth();
    if (!stored) {
        window.location.href = '/';
        return;
    }

    user.sessionId = stored.sessionId;
    user.address = stored.address;
    user.publicKey = stored.publicKey;

    verifySession(stored.sessionId, function(valid, data) {
        if (!valid) {
            clearAuth();
            window.location.href = '/';
            return;
        }
        if (onReady) onReady(data);
        if (typeof hidePageTransition === 'function') {
            hidePageTransition();
        }
    });
}

function navigateToGameWithAuth(targetUrl) {
    var stored = getStoredAuth();
    if (!stored || !targetUrl) {
        window.location.href = '/';
        return;
    }

    if (typeof showPageTransition === 'function') {
        showPageTransition('進入遊戲中...');
    }

    verifySession(stored.sessionId, function(valid) {
        if (!valid) {
            clearAuth();
            window.location.href = '/';
            return;
        }
        window.location.href = targetUrl;
    });
}

function logoutUser() {
    clearAuth();
    user.address = '';
    user.publicKey = '';
    user.sessionId = '';
    if (typeof showPageTransition === 'function') {
        showPageTransition('登出中...');
    }
    setTimeout(function () {
        window.location.href = '/';
    }, 120);
}
