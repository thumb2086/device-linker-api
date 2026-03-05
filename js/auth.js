/* === Auth & Session === */
var authPollInterval = null;
var authDeepLink = '';
var lobbyAuthReadyCallback = null;

var DEMO_MODE_KEY = 'casino_demo_mode';
var DEMO_ADDRESS_KEY = 'casino_demo_address';
var DEMO_PUBLIC_KEY_KEY = 'casino_demo_public_key';

function buildDeepLink(sessionId) {
    return 'dlinker://login?sessionId=' + encodeURIComponent(sessionId);
}

function buildLegacyDeepLink(sessionId) {
    return 'dlinker:login:' + sessionId;
}

function getStoredAuth() {
    try {
        var data = localStorage.getItem('casino_auth');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

function storeAuth(sessionId, address, publicKey) {
    localStorage.setItem('casino_auth', JSON.stringify({ sessionId: sessionId, address: address, publicKey: publicKey }));
}

function clearAuth() {
    localStorage.removeItem('casino_auth');
}

function isDemoModeEnabled() {
    try {
        return localStorage.getItem(DEMO_MODE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function setDemoModeEnabled(enabled) {
    try {
        localStorage.setItem(DEMO_MODE_KEY, enabled ? '1' : '0');
    } catch (e) {}
}

function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(arr);
    } else {
        for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }

    var hex = '';
    for (var j = 0; j < arr.length; j++) {
        var part = arr[j].toString(16);
        if (part.length < 2) part = '0' + part;
        hex += part;
    }
    return hex;
}

function getOrCreateDemoIdentity() {
    var address = localStorage.getItem(DEMO_ADDRESS_KEY) || '';
    var publicKey = localStorage.getItem(DEMO_PUBLIC_KEY_KEY) || '';

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        address = '0x' + randomHex(20);
        localStorage.setItem(DEMO_ADDRESS_KEY, address);
    }

    if (!publicKey || publicKey.length < 16) {
        publicKey = 'demo_pk_' + randomHex(32);
        localStorage.setItem(DEMO_PUBLIC_KEY_KEY, publicKey);
    }

    return { address: address, publicKey: publicKey };
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
        body: JSON.stringify({ action: 'create', platform: platform, clientType: clientType })
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

function renderAuthCode(sessionId) {
    var authCodeEl = document.getElementById('auth-code');
    if (authCodeEl) authCodeEl.innerText = sessionId || '-';
}

function updateAuthMessage(html) {
    var authMsg = document.getElementById('auth-msg');
    if (authMsg) authMsg.innerHTML = html;
}

function verifySession(sessionId, callback, attempt) {
    var currentAttempt = Number(attempt || 0);

    fetch('/api/auth?sessionId=' + encodeURIComponent(sessionId))
        .then(function (res) {
            if (!res.ok) throw new Error('http_' + res.status);
            return res.json();
        })
        .then(function (data) {
            callback(data && data.status === 'authorized', data, false);
        })
        .catch(function () {
            if (currentAttempt < 2) {
                setTimeout(function () {
                    verifySession(sessionId, callback, currentAttempt + 1);
                }, 500 + (currentAttempt * 300));
                return;
            }
            callback(false, null, true);
        });
}

function createAndAuthorizeDemoSession(callback) {
    var identity = getOrCreateDemoIdentity();
    var platform = detectClientPlatform();
    var clientType = detectClientType(platform);

    createAuthSession(function (session) {
        if (!session || !session.sessionId) {
            callback(null);
            return;
        }

        fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: session.sessionId,
                address: identity.address,
                publicKey: identity.publicKey,
                platform: platform,
                clientType: clientType,
                mode: 'demo'
            })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.success) {
                    callback(null);
                    return;
                }

                callback({
                    sessionId: session.sessionId,
                    address: data.address || identity.address,
                    publicKey: identity.publicKey
                });
            })
            .catch(function () { callback(null); });
    });
}

function enterDemoMode(onAuthorized) {
    setDemoModeEnabled(true);
    updateAuthMessage('<span class="loader"></span> 啟用體驗模式中...');

    createAndAuthorizeDemoSession(function (authData) {
        if (!authData) {
            updateAuthMessage('體驗模式啟用失敗，請稍後再試。');
            return;
        }

        user.sessionId = authData.sessionId;
        user.address = authData.address;
        user.publicKey = authData.publicKey;
        storeAuth(authData.sessionId, authData.address, authData.publicKey);

        fetch('/api/airdrop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: authData.address, sessionId: authData.sessionId })
        })
            .catch(function () { return null; })
            .finally(function () {
                verifySession(authData.sessionId, function (valid, data, transient) {
                    if (valid && onAuthorized) {
                        onAuthorized(data);
                    } else if (onAuthorized) {
                        onAuthorized({
                            status: 'authorized',
                            address: authData.address,
                            publicKey: authData.publicKey,
                            balance: '100.00',
                            totalBet: '0.00',
                            vipLevel: '體驗會員'
                        });
                    }

                    if (transient) {
                        console.warn('Demo session verify transient failure, fallback granted');
                    }

                    if (typeof hidePageTransition === 'function') hidePageTransition();
                });
            });
    });
}

function startDemoMode() {
    enterDemoMode(lobbyAuthReadyCallback);
}

function startAuthPolling(sessionId, onAuthorized) {
    if (authPollInterval) clearInterval(authPollInterval);

    authPollInterval = setInterval(function () {
        fetch('/api/auth?sessionId=' + encodeURIComponent(sessionId))
            .then(function (res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function (data) {
                if (!data || data.status !== 'authorized') return;

                clearInterval(authPollInterval);
                authPollInterval = null;

                user.address = data.address;
                user.publicKey = data.publicKey;
                user.sessionId = sessionId;

                storeAuth(sessionId, data.address, data.publicKey);
                if (onAuthorized) onAuthorized(data);
            })
            .catch(function (err) { console.error('Auth polling error:', err); });
    }, 1500);
}

function showQRAuth(onAuthorized) {
    var authUI = document.getElementById('auth-ui');
    if (authUI) authUI.classList.remove('hidden');

    var lobbyUI = document.getElementById('lobby-ui');
    if (lobbyUI) lobbyUI.classList.add('hidden');

    if (typeof hidePageTransition === 'function') hidePageTransition();

    var canvas = document.getElementById('qr-canvas');
    if (!canvas) return;

    function renderSession(sessionId, deepLink) {
        user.sessionId = sessionId;
        authDeepLink = deepLink || buildDeepLink(sessionId);

        renderAuthCode(sessionId);
        updateAuthMessage('<span class="loader"></span> 請使用手機 App 掃描 QR code');

        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, authDeepLink, { width: 200, margin: 2 });
            startAuthPolling(sessionId, onAuthorized);
        }
    }

    function tryRenderQR(sessionId, deepLink) {
        if (typeof QRCode !== 'undefined') {
            renderSession(sessionId, deepLink);
            return;
        }
        setTimeout(function () { tryRenderQR(sessionId, deepLink); }, 500);
    }

    createAuthSession(function (session) {
        if (session && session.sessionId) {
            tryRenderQR(session.sessionId, session.deepLink);
            return;
        }
        updateAuthMessage('建立登入 session 失敗，請稍後重試');
    });
}

function launchDeepLink(deepLink, legacyDeepLink) {
    var primary = legacyDeepLink || deepLink;
    var fallback = deepLink && deepLink !== primary ? deepLink : '';
    if (!primary) return;

    window.location.href = primary;
    if (fallback) {
        setTimeout(function () { window.location.assign(fallback); }, 400);
    }
}

function openAppAuth() {
    if (!user.sessionId) return;

    var deepLink = authDeepLink || buildDeepLink(user.sessionId);
    var legacyDeepLink = buildLegacyDeepLink(user.sessionId);
    updateAuthMessage('<span class="loader"></span> 嘗試開啟 App...');

    var jumpedOut = false;
    function onVisibilityChange() {
        if (document.hidden) jumpedOut = true;
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    launchDeepLink(deepLink, legacyDeepLink);

    setTimeout(function () {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (!jumpedOut) {
            updateAuthMessage('無法喚起 App，請手動開啟 App 後輸入登入碼');
            return;
        }
        updateAuthMessage('<span class="loader"></span> 已開啟 App，等待授權完成...');
    }, 1800);
}

function copyAuthCode() {
    if (!user.sessionId) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(user.sessionId).then(function () {
            updateAuthMessage('登入碼已複製，請貼到 App 完成登入');
        });
        return;
    }

    var tmp = document.createElement('input');
    tmp.value = user.sessionId;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);

    updateAuthMessage('登入碼已複製，請貼到 App 完成登入');
}

function initLobbyAuth(onAuthorized) {
    lobbyAuthReadyCallback = onAuthorized;

    if (isDemoModeEnabled()) {
        enterDemoMode(onAuthorized);
        return;
    }

    var stored = getStoredAuth();
    if (!stored) {
        showQRAuth(onAuthorized);
        return;
    }

    verifySession(stored.sessionId, function (valid, data, transient) {
        if (valid) {
            user.address = stored.address;
            user.publicKey = stored.publicKey;
            user.sessionId = stored.sessionId;
            if (onAuthorized) onAuthorized(data);
            return;
        }

        if (transient) {
            user.address = stored.address;
            user.publicKey = stored.publicKey;
            user.sessionId = stored.sessionId;
            if (onAuthorized) {
                onAuthorized({
                    status: 'authorized',
                    address: stored.address,
                    publicKey: stored.publicKey,
                    balance: '0.00',
                    totalBet: '0.00',
                    vipLevel: '會員'
                });
            }
            return;
        }

        clearAuth();
        showQRAuth(onAuthorized);
    });
}

function checkGameAuth(onReady) {
    if (typeof showPageTransition === 'function') {
        showPageTransition('驗證登入狀態中...');
    }

    var stored = getStoredAuth();

    if (isDemoModeEnabled()) {
        if (!stored) {
            enterDemoMode(onReady);
            return;
        }

        user.sessionId = stored.sessionId;
        user.address = stored.address;
        user.publicKey = stored.publicKey;

        verifySession(stored.sessionId, function (valid, data) {
            if (!valid) {
                enterDemoMode(onReady);
                return;
            }

            if (onReady) onReady(data);
            if (typeof hidePageTransition === 'function') hidePageTransition();
        });
        return;
    }

    if (!stored) {
        window.location.href = '/';
        return;
    }

    user.sessionId = stored.sessionId;
    user.address = stored.address;
    user.publicKey = stored.publicKey;

    verifySession(stored.sessionId, function (valid, data, transient) {
        if (!valid && !transient) {
            clearAuth();
            window.location.href = '/';
            return;
        }

        if (onReady) {
            onReady(data || {
                status: 'authorized',
                address: stored.address,
                publicKey: stored.publicKey,
                balance: '0.00',
                totalBet: '0.00',
                vipLevel: '會員'
            });
        }

        if (typeof hidePageTransition === 'function') hidePageTransition();
    });
}

function navigateToGameWithAuth(targetUrl) {
    if (!targetUrl) {
        window.location.href = '/';
        return;
    }

    if (isDemoModeEnabled()) {
        window.location.href = targetUrl;
        return;
    }

    var stored = getStoredAuth();
    if (!stored) {
        window.location.href = '/';
        return;
    }

    if (typeof showPageTransition === 'function') {
        showPageTransition('進入遊戲中...');
    }

    verifySession(stored.sessionId, function (valid, _data, transient) {
        if (!valid && !transient) {
            clearAuth();
            window.location.href = '/';
            return;
        }
        window.location.href = targetUrl;
    });
}

function logoutUser() {
    setDemoModeEnabled(false);
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
