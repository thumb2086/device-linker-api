/* === 閃電賭場 - 認證模組 === */
var authPollInterval = null;
var authDeepLink = '';

function buildDeepLink(sessionId) {
    return 'dlinker://login?sessionId=' + encodeURIComponent(sessionId);
}

function buildLegacyDeepLink(sessionId) {
    return 'dlinker:login:' + sessionId;
}

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

function detectClientPlatform() {
    var ua = (navigator.userAgent || '').toLowerCase();
    if (ua.indexOf('android') >= 0) return 'android';
    if (ua.indexOf('iphone') >= 0 || ua.indexOf('ipad') >= 0 || ua.indexOf('ipod') >= 0) return 'ios';
    if (ua.indexOf('windows') >= 0) return 'windows';
    if (ua.indexOf('mac os') >= 0 || ua.indexOf('macintosh') >= 0) return 'macos';
    if (ua.indexOf('linux') >= 0) return 'linux';
    return 'web';
}

function detectClientType(platform) {
    if (platform === 'android' || platform === 'ios') return 'mobile';
    if (platform === 'windows' || platform === 'macos' || platform === 'linux') return 'desktop';
    return 'web';
}

function createAuthSession(callback) {
    var platform = detectClientPlatform();
    var clientType = detectClientType(platform);
    fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create',
            platform: platform,
            clientType: clientType
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success || !data.sessionId) {
                callback(null);
                return;
            }
            callback({
                sessionId: data.sessionId,
                deepLink: data.deepLink || buildDeepLink(data.sessionId),
                legacyDeepLink: data.legacyDeepLink || buildLegacyDeepLink(data.sessionId)
            });
        })
        .catch(function () { callback(null); });
}

/**
 * 顯示 QR Code 認證畫面並開始輪詢
 */
function showQRAuth(onAuthorized) {
    var authUI = document.getElementById('auth-ui');
    if (authUI) authUI.classList.remove('hidden');
    var lobbyUI = document.getElementById('lobby-ui');
    if (lobbyUI) lobbyUI.classList.add('hidden');
    if (typeof hidePageTransition === 'function') {
        hidePageTransition();
    }

    var canvas = document.getElementById('qr-canvas');
    if (!canvas) return;

    function renderSession(sessionId, deepLink) {
        user.sessionId = sessionId;
        authDeepLink = deepLink || buildDeepLink(sessionId);
        renderAuthCode(sessionId);
        updateAuthMessage('<span class="loader"></span> 等待硬體授權...');

        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, authDeepLink, { width: 200, margin: 2 });
            startAuthPolling(sessionId, onAuthorized);
        }
    }

    function tryRenderQR(sessionId, deepLink) {
        if (typeof QRCode !== 'undefined') {
            renderSession(sessionId, deepLink);
        } else {
            setTimeout(function () { tryRenderQR(sessionId, deepLink); }, 500);
        }
    }

    createAuthSession(function (session) {
        if (session && session.sessionId) {
            tryRenderQR(session.sessionId, session.deepLink);
            return;
        }
        updateAuthMessage('⚠️ 認證服務暫時無法使用，請稍後重試');
    });
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

function updateAuthMessage(html) {
    var authMsg = document.getElementById('auth-msg');
    if (authMsg) authMsg.innerHTML = html;
}

function launchDeepLink(deepLink, legacyDeepLink) {
    var primaryLink = legacyDeepLink || deepLink;
    var fallbackLink = deepLink && deepLink !== primaryLink ? deepLink : '';
    if (!primaryLink) return;
    window.location.href = primaryLink;
    if (fallbackLink) {
        setTimeout(function () {
            window.location.assign(fallbackLink);
        }, 400);
    }
}

function openAppAuth() {
    if (!user.sessionId) return;
    var deepLink = authDeepLink || buildDeepLink(user.sessionId);
    var legacyDeepLink = buildLegacyDeepLink(user.sessionId);
    updateAuthMessage('<span class="loader"></span> 嘗試開啟 App，請在手機允許跳轉...');

    var jumpedOut = false;
    var onVisibilityChange = function () {
        if (document.hidden) {
            jumpedOut = true;
        }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    launchDeepLink(deepLink, legacyDeepLink);

    setTimeout(function () {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (!jumpedOut) {
            updateAuthMessage('⚠️ 無法自動開啟 App，請先手動打開 App 並貼上授權碼登入');
            return;
        }
        updateAuthMessage('<span class="loader"></span> 已切到 App，等待授權完成...');
    }, 1800);
}

function copyAuthCode() {
    if (!user.sessionId) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(user.sessionId).then(function() {
            updateAuthMessage('✅ 已複製授權碼，請到 App 貼上登入');
        });
        return;
    }

    var tmp = document.createElement('input');
    tmp.value = user.sessionId;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);

    updateAuthMessage('✅ 已複製授權碼，請到 App 貼上登入');
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
