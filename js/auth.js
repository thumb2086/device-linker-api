/* === 子熙賭場 - 認證模組 === */
var authPollInterval = null;
var authDeepLink = '';
var lobbyAuthReadyCallback = null;
var CUSTODY_CRED_KEY = 'casino_custody_credentials';

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

function getStoredCustodyCredentials() {
    try {
        var raw = localStorage.getItem(CUSTODY_CRED_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function storeCustodyCredentials(username, password) {
    localStorage.setItem(CUSTODY_CRED_KEY, JSON.stringify({
        username: String(username || '').trim(),
        password: String(password || '')
    }));
}

function clearCustodyCredentials() {
    localStorage.removeItem(CUSTODY_CRED_KEY);
}

function updateCustodyQuickLoginUI() {
    var btn = document.getElementById('custody-quick-btn');
    var meta = document.getElementById('custody-quick-meta');
    var creds = getStoredCustodyCredentials();
    if (!btn || !meta) return;

    if (creds && creds.username && creds.password) {
        btn.classList.remove('hidden');
        meta.classList.remove('hidden');
        meta.innerText = '已記住帳號：' + creds.username;
        return;
    }

    btn.classList.add('hidden');
    meta.classList.add('hidden');
}

/**
 * 大廳頁面用: 初始化認證流程 (QR Code + 輪詢)
 * @param {Function} onAuthorized - 認證成功後的回調
 */
function initLobbyAuth(onAuthorized) {
    lobbyAuthReadyCallback = onAuthorized;
    updateCustodyQuickLoginUI();
    refreshMaintenanceBanner();

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

function refreshMaintenanceBanner() {
    var banner = document.getElementById('maintenance-banner');
    var titleEl = banner ? banner.querySelector('.maintenance-title') : null;
    var messageEl = banner ? banner.querySelector('.maintenance-message') : null;
    if (!banner) return;

    fetch('/api/user?action=get_maintenance')
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.enabled) {
                banner.classList.add('hidden');
                return;
            }
            banner.classList.remove('hidden');
            if (titleEl) titleEl.innerText = data.title || '系統維護中';
            if (messageEl) messageEl.innerText = data.message || '目前暫停登入與遊戲，請稍後再試。';
        })
        .catch(function () {
            banner.classList.add('hidden');
        });
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
    fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create_session',
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
        startAuthPolling(sessionId, onAuthorized);

        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, authDeepLink, { width: 200, margin: 2 });
            return;
        }

        renderQRUnavailable(canvas);
        updateAuthMessage('⚠️ QR Code 載入失敗，請改用授權碼或點「在手機 App 授權」');
    }

    function tryRenderQR(sessionId, deepLink, retriesLeft) {
        if (typeof QRCode !== 'undefined') {
            renderSession(sessionId, deepLink);
        } else {
            if (retriesLeft <= 0) {
                renderSession(sessionId, deepLink);
                return;
            }
            setTimeout(function () { tryRenderQR(sessionId, deepLink, retriesLeft - 1); }, 500);
        }
    }

    createAuthSession(function (session) {
        if (session && session.sessionId) {
            tryRenderQR(session.sessionId, session.deepLink, 6);
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
        fetch('/api/user?action=get_status&sessionId=' + sessionId)
            .then(function(res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function(data) {
                if (data && data.status === 'blacklisted') {
                    clearInterval(authPollInterval);
                    authPollInterval = null;
                    updateAuthMessage('❌ ' + (data.error || '帳號已被禁止進入'));
                    return;
                }
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

function renderQRUnavailable(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 200;
    canvas.height = 200;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QR Code 暫時不可用', canvas.width / 2, 90);
    ctx.fillText('請改用授權碼登入', canvas.width / 2, 114);
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

function startCustodyAuth() {
    var usernameInput = window.prompt('請輸入託管帳號（3-32 字，英文數字底線）');
    if (usernameInput === null) return;
    var username = String(usernameInput || '').trim();
    if (!username) {
        updateAuthMessage('請先輸入帳號');
        return;
    }

    var passwordInput = window.prompt('請輸入密碼（至少 6 碼）');
    if (passwordInput === null) return;
    var password = String(passwordInput || '');
    if (password.length < 6) {
        updateAuthMessage('密碼至少 6 碼');
        return;
    }

    var platform = detectClientPlatform();
    var clientType = detectClientType(platform);
    updateAuthMessage('<span class="loader"></span> 託管帳戶登入中...');

    fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'custody_login',
            username: username,
            password: password,
            platform: platform,
            clientType: clientType
        })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success || !data.sessionId || !data.address || !data.publicKey) {
                throw new Error((data && data.error) ? data.error : '託管登入失敗');
            }

            user.address = data.address;
            user.publicKey = data.publicKey;
            user.sessionId = data.sessionId;
            storeAuth(data.sessionId, data.address, data.publicKey);
            storeCustodyCredentials(username, password);
            updateCustodyQuickLoginUI();

            verifySession(data.sessionId, function (valid, authData) {
                if (valid && lobbyAuthReadyCallback) {
                    lobbyAuthReadyCallback(authData);
                    return;
                }

                if (lobbyAuthReadyCallback) {
                    lobbyAuthReadyCallback({
                        status: 'authorized',
                        address: data.address,
                        publicKey: data.publicKey,
                        balance: '0.00',
                        totalBet: '0.00',
                        vipLevel: '普通會員'
                    });
                }
            });

            if (data.isNewAccount && data.bonusGranted) {
                updateAuthMessage('✅ 註冊成功，已送 ' + formatDisplayNumber(data.registerBonus, 2) + ' 子熙幣');
            } else if (data.isNewAccount && data.bonusError) {
                updateAuthMessage('⚠️ 已註冊，但送幣失敗：' + data.bonusError);
            } else {
                updateAuthMessage('✅ 託管登入成功');
            }
        })
        .catch(function (err) {
            updateAuthMessage('❌ 託管登入失敗：' + err.message);
        });
}

function quickCustodyAuth() {
    var creds = getStoredCustodyCredentials();
    if (!creds || !creds.username || !creds.password) {
        updateAuthMessage('目前沒有已記住的帳號密碼');
        updateCustodyQuickLoginUI();
        return;
    }

    var platform = detectClientPlatform();
    var clientType = detectClientType(platform);
    updateAuthMessage('<span class="loader"></span> 託管帳戶快速登入中...');

    fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'custody_login',
            username: creds.username,
            password: creds.password,
            platform: platform,
            clientType: clientType
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success || !data.sessionId || !data.address || !data.publicKey) {
                throw new Error((data && data.error) ? data.error : '快速登入失敗');
            }

            user.address = data.address;
            user.publicKey = data.publicKey;
            user.sessionId = data.sessionId;
            storeAuth(data.sessionId, data.address, data.publicKey);

            verifySession(data.sessionId, function (valid, authData) {
                if (valid && lobbyAuthReadyCallback) {
                    lobbyAuthReadyCallback(authData);
                    return;
                }

                if (lobbyAuthReadyCallback) {
                    lobbyAuthReadyCallback({
                        status: 'authorized',
                        address: data.address,
                        publicKey: data.publicKey,
                        balance: '0.00',
                        totalBet: '0.00',
                        vipLevel: '普通會員'
                    });
                }
            });

            updateAuthMessage('✅ 託管快速登入成功');
        })
        .catch(function (err) {
            clearCustodyCredentials();
            updateCustodyQuickLoginUI();
            updateAuthMessage('❌ 快速登入失敗，已清除已記住帳密：' + err.message);
        });
}

/**
 * 驗證 session 是否仍有效
 */
function verifySession(sessionId, callback) {
    fetch('/api/user?action=get_status&sessionId=' + sessionId)
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

updateCustodyQuickLoginUI();
