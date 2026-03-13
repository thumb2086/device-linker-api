/* === 子熙賭場 - 共用 UI 工具 === */

var user = { address: '', publicKey: '', sessionId: '', displayName: '', balance: 0, chainBalance: 0, totalBet: 0, level: '', betLimit: 0 };
var userToastTimerSeq = 0;
var BALANCE_OVERRIDE_KEY = 'zixi_balance_override';
var BALANCE_OVERRIDE_ENABLED = false;
var balanceRefreshIntervalId = null;
var balanceAuthoritativeSyncIntervalId = null;

function getNumberDisplayMode() {
    try {
        var stored = String(localStorage.getItem('zixi_number_mode') || '').trim().toLowerCase();
        return stored === 'full' ? 'full' : 'compact';
    } catch (error) {
        return 'compact';
    }
}

function setNumberDisplayMode(mode) {
    var normalized = String(mode || '').trim().toLowerCase() === 'full' ? 'full' : 'compact';
    try {
        localStorage.setItem('zixi_number_mode', normalized);
    } catch (error) {
        console.log('Failed to persist number mode');
    }
    return normalized;
}

function toSafeNumber(value, fallback) {
    var parsed = Number(String(value === undefined || value === null ? '' : value).replace(/,/g, '').trim());
    if (!Number.isFinite(parsed)) return (fallback !== undefined ? fallback : 0);
    return parsed;
}

function formatFullNumberValue(num, fractionDigits) {
    return num.toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
}

function formatCompactNumberValue(num, fractionDigits) {
    var sign = num < 0 ? '-' : '';
    var abs = Math.abs(num);

    if (abs >= 1000000000000) {
        return sign + (abs / 1000000000000).toFixed(fractionDigits).replace(/\.?0+$/, '') + ' 兆';
    }
    if (abs >= 100000000) {
        return sign + (abs / 100000000).toFixed(fractionDigits).replace(/\.?0+$/, '') + ' 億';
    }
    if (abs >= 10000) {
        return sign + (abs / 10000).toFixed(fractionDigits).replace(/\.?0+$/, '') + ' 萬';
    }

    return sign + abs.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits
    });
}

function formatDisplayNumber(value, digits) {
    var num = toSafeNumber(value, 0);
    var fractionDigits = digits === undefined ? 2 : digits;
    return getNumberDisplayMode() === 'full'
        ? formatFullNumberValue(num, fractionDigits)
        : formatCompactNumberValue(num, fractionDigits);
}

function formatCompactZh(value, digits) {
    var num = toSafeNumber(value, 0);
    var fractionDigits = digits === undefined ? 2 : digits;
    return getNumberDisplayMode() === 'full'
        ? formatFullNumberValue(num, fractionDigits)
        : formatCompactNumberValue(num, fractionDigits);
}

function getCurrentUserBalance() {
    return toSafeNumber(user.balance, 0);
}

function getBalanceStorage() {
    try {
        return window.sessionStorage;
    } catch (error) {
        return null;
    }
}

function readBalanceDisplayOverride() {
    var storage = getBalanceStorage();
    if (!storage) return null;

    try {
        var raw = storage.getItem(BALANCE_OVERRIDE_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        var expiresAt = Number(parsed.expiresAt || 0);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            storage.removeItem(BALANCE_OVERRIDE_KEY);
            return null;
        }
        return {
            address: String(parsed.address || '').toLowerCase(),
            value: toSafeNumber(parsed.value, 0),
            expiresAt: expiresAt,
            source: String(parsed.source || '')
        };
    } catch (error) {
        return null;
    }
}

function clearDisplayedBalanceOverride() {
    var storage = getBalanceStorage();
    if (!storage) return;
    try {
        storage.removeItem(BALANCE_OVERRIDE_KEY);
    } catch (error) {
        console.log('Failed to clear balance override');
    }
}

function setDisplayedBalanceOverride(value, ttlMs, source) {
    var storage = getBalanceStorage();
    var nextBalance = toSafeNumber(value, 0);
    if (!BALANCE_OVERRIDE_ENABLED) return nextBalance;
    if (!storage) return nextBalance;

    try {
        storage.setItem(BALANCE_OVERRIDE_KEY, JSON.stringify({
            address: String(user.address || '').toLowerCase(),
            value: nextBalance,
            expiresAt: Date.now() + Math.max(1000, Number(ttlMs || 30000)),
            source: String(source || '')
        }));
    } catch (error) {
        console.log('Failed to persist balance override');
    }
    return nextBalance;
}

function getActiveDisplayedBalanceOverride() {
    var override = readBalanceDisplayOverride();
    if (!override) return null;

    var currentAddress = String(user.address || '').toLowerCase();
    if (override.address && currentAddress && override.address !== currentAddress) {
        clearDisplayedBalanceOverride();
        return null;
    }
    return override;
}

function renderIdentity(profile) {
    var avatarEl = document.getElementById('identity-avatar');
    var titleEl = document.getElementById('identity-title');
    var avatarNameEl = document.getElementById('identity-avatar-name');
    var descEl = document.getElementById('identity-desc');
    var titleDescEl = document.getElementById('identity-title-desc');
    var avatarDescEl = document.getElementById('identity-avatar-desc');

    if (avatarEl) avatarEl.innerText = profile && profile.avatar ? profile.avatar.icon : '🪙';
    if (titleEl) titleEl.innerText = profile && profile.title ? profile.title.name : '等級自動稱號';
    if (avatarNameEl) avatarNameEl.innerText = profile && profile.avatar ? profile.avatar.name : '經典籌碼';

    // 舊版單一說明區域相容性
    if (descEl) {
        var desc = '';
        if (profile && profile.title && (profile.title.description || profile.title.shopDescription)) {
            desc = profile.title.description || profile.title.shopDescription;
        } else if (profile && profile.avatar && profile.avatar.description) {
            desc = profile.avatar.description;
        }
        descEl.innerText = desc || '';
        descEl.style.display = desc ? 'block' : 'none';
    }

    // 新版分開說明區域
    if (titleDescEl) {
        var tDesc = profile && profile.title ? (profile.title.description || profile.title.shopDescription) : '';
        titleDescEl.innerText = tDesc || '';
        titleDescEl.style.display = tDesc ? 'block' : 'none';
    }
    if (avatarDescEl) {
        var aDesc = profile && profile.avatar ? profile.avatar.description : '';
        avatarDescEl.innerText = aDesc || '';
        avatarDescEl.style.display = aDesc ? 'block' : 'none';
    }
}

function renderBalanceValue(value) {
    var nextBalance = toSafeNumber(value, 0);
    var balanceText = formatDisplayNumber(nextBalance, 2);

    var balEl = document.getElementById('balance-val');
    if (balEl) balEl.innerText = balanceText;

    var headerBalance = document.getElementById('header-balance');
    if (headerBalance) headerBalance.innerText = balanceText;
}

function resolveDisplayedBalanceValue(realBalance) {
    var nextBalance = toSafeNumber(realBalance, 0);
    if (typeof calcDisplayBalance === 'function') {
        nextBalance = toSafeNumber(calcDisplayBalance(nextBalance), nextBalance);
    }

    if (!BALANCE_OVERRIDE_ENABLED) {
        clearDisplayedBalanceOverride();
        return nextBalance;
    }

    var override = getActiveDisplayedBalanceOverride();
    if (!override) return nextBalance;

    if (Math.abs(toSafeNumber(realBalance, 0) - override.value) < 0.000001) {
        clearDisplayedBalanceOverride();
        return nextBalance;
    }

    return override.value;
}

function setDisplayedBalance(value, ttlMs, source) {
    var normalizedSource = String(source || '').trim().toLowerCase();
    var allowOverride = BALANCE_OVERRIDE_ENABLED && (normalizedSource === 'authoritative' || normalizedSource === 'chain');
    if (!allowOverride) {
        clearDisplayedBalanceOverride();
        var chainBalance = toSafeNumber(user.chainBalance, 0);
        user.balance = chainBalance;
        renderBalanceValue(chainBalance);
        return chainBalance;
    }
    var nextBalance = setDisplayedBalanceOverride(value, ttlMs, source);
    user.balance = nextBalance;
    renderBalanceValue(nextBalance);
    return nextBalance;
}

function renderMaxBetNote(maxBet) {
    var noteEl = document.getElementById('max-bet-note');
    if (!noteEl) return;

    if (maxBet === undefined || maxBet === null || maxBet === '') {
        noteEl.innerText = '單注上限將依目前等級計算';
        return;
    }

    noteEl.innerText = '單注上限 ' + formatDisplayNumber(maxBet, 2) + ' 子熙幣，依目前等級自動調整';
}

function ensureSupportShortcutStyle() {
    if (document.getElementById('support-shortcut-style')) return;
    var style = document.createElement('style');
    style.id = 'support-shortcut-style';
    style.textContent = [
        '.support-shortcut-link {',
        'position: fixed;',
        'right: 18px;',
        'bottom: 18px;',
        'z-index: 60;',
        'display: inline-flex;',
        'align-items: center;',
        'gap: 8px;',
        'padding: 12px 16px;',
        'border-radius: 999px;',
        'background: linear-gradient(135deg, rgba(255, 214, 102, 0.96), rgba(255, 157, 77, 0.96));',
        'color: #2b1100;',
        'font-weight: 700;',
        'text-decoration: none;',
        'box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);',
        '}',
        '.support-shortcut-link:hover { transform: translateY(-1px); }',
        '@media (max-width: 640px) { .support-shortcut-link { left: 12px; right: 12px; justify-content: center; bottom: 12px; } }'
    ].join('');
    document.head.appendChild(style);
}

function ensureUserToastStack() {
    var existing = document.getElementById('user-toast-stack');
    if (existing) return existing;

    var stack = document.createElement('div');
    stack.id = 'user-toast-stack';
    stack.className = 'user-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'true');
    document.body.appendChild(stack);
    return stack;
}

function showUserToast(text, isError) {
    var safeText = String(text || '').trim();
    if (!safeText) return;

    var stackEl = ensureUserToastStack();
    userToastTimerSeq += 1;

    var toastEl = document.createElement('div');
    toastEl.className = 'user-toast ' + (isError ? 'error' : 'success');
    toastEl.innerHTML =
        '<strong class="user-toast-title">' + (isError ? '操作失敗' : '操作成功') + '</strong>' +
        '<div class="user-toast-copy"></div>';
    toastEl.querySelector('.user-toast-copy').innerText = safeText;

    stackEl.appendChild(toastEl);
    requestAnimationFrame(function () {
        toastEl.classList.add('visible');
    });

    window.setTimeout(function () {
        toastEl.classList.remove('visible');
        window.setTimeout(function () {
            if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
        }, 220);
    }, isError ? 4200 : 2600);
}

function ensureSupportShortcut() {
    if (!user.sessionId) return;
    if (window.location.pathname.indexOf('/games/support.html') >= 0) return;

    ensureSupportShortcutStyle();

    var existing = document.getElementById('support-shortcut-link');
    if (existing) return;

    var link = document.createElement('a');
    link.id = 'support-shortcut-link';
    link.className = 'support-shortcut-link';
    link.href = '/games/support.html';
    link.innerText = '意見回饋';
    document.body.appendChild(link);
}

function getAudioEnabled() {
    try {
        return localStorage.getItem('casino_muted') !== 'true';
    } catch (error) {
        return true;
    }
}

function getAudioVolume() {
    try {
        var raw = parseFloat(localStorage.getItem('casino_volume') || '0.5');
        if (!Number.isFinite(raw)) return 0.5;
        return Math.min(1, Math.max(0, raw));
    } catch (error) {
        return 0.5;
    }
}

function ensureAudioManagerScript() {
    if (window.audioManager || document.getElementById('shared-audio-manager-script')) return;
    var script = document.createElement('script');
    script.id = 'shared-audio-manager-script';
    script.src = '/js/audio-manager.js';
    document.head.appendChild(script);
}

function playFallbackClickTone() {
    if (!getAudioEnabled()) return;
    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!window.__zixiClickAudioCtx) {
        window.__zixiClickAudioCtx = new AudioContextCtor();
    }
    var ctx = window.__zixiClickAudioCtx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 720;
    gain.gain.value = Math.max(0.01, getAudioVolume() * 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    var now = ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.start(now);
    osc.stop(now + 0.08);
}

function playUiClickSound() {
    if (!getAudioEnabled()) return;
    if (window.audioManager && typeof window.audioManager.play === 'function') {
        if (!window.audioManager.initialized) window.audioManager.init();
        var played = window.audioManager.play('click', { volume: Math.max(0.2, getAudioVolume()) });
        if (played) return;
    }
    playFallbackClickTone();
}

function ensureGlobalAudioBindings() {
    if (window.__zixiGlobalAudioBound) return;
    window.__zixiGlobalAudioBound = true;

    document.addEventListener('click', function (event) {
        var target = event.target && event.target.closest
            ? event.target.closest('button, a, [role="button"], .btn-primary, .btn-secondary, .logout-btn, .settings-btn')
            : null;
        if (!target) return;
        if (target.classList && target.classList.contains('settings-backdrop')) return;
        playUiClickSound();
    }, true);
}

function ensureSettingsModal() {
    var existing = document.getElementById('user-settings-modal');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = 'user-settings-modal';
    modal.className = 'settings-modal hidden';
    modal.innerHTML = [
        '<div class="settings-backdrop" onclick="closeUserSettings()"></div>',
        '<div class="settings-dialog">',
        '<div class="settings-head">',
        '<div>',
        '<div class="settings-kicker">Settings</div>',
        '<h2>個人設定</h2>',
        '</div>',
        '<button class="settings-close" type="button" onclick="closeUserSettings()">關閉</button>',
        '</div>',
        '<div class="settings-grid">',
        '<label class="settings-field">',
        '<span>顯示名稱</span>',
        '<input id="settings-display-name" class="settings-input" type="text" maxlength="24" placeholder="輸入顯示名稱">',
        '</label>',
        '<label class="settings-field">',
        '<span>金額顯示</span>',
        '<select id="settings-number-mode" class="settings-input">',
        '<option value="compact">100萬</option>',
        '<option value="full">1,000,000</option>',
        '</select>',
        '</label>',
        '<label class="settings-field">',
        '<span>音效</span>',
        '<select id="settings-audio-enabled" class="settings-input">',
        '<option value="on">開啟</option>',
        '<option value="off">關閉</option>',
        '</select>',
        '</label>',
        '<label class="settings-field">',
        '<span>音量</span>',
        '<input id="settings-audio-volume" class="settings-input settings-range" type="range" min="0" max="100" step="5">',
        '</label>',
        '</div>',
        '<p class="settings-note">可切換成中文簡寫或完整數字；音效開啟後，全站按鈕會有點擊音。</p>',
        '<div class="settings-actions">',
        '<button class="back-btn" type="button" onclick="closeUserSettings()">取消</button>',
        '<button class="btn-primary settings-save-btn" type="button" onclick="saveUserSettings()">儲存設定</button>',
        '</div>',
        '</div>'
    ].join('');
    document.body.appendChild(modal);
    return modal;
}

function ensureSettingsButton() {
    if (!user.sessionId) return;
    var statsEl = document.querySelector('.header-stats');
    if (!statsEl || document.getElementById('header-settings-btn')) return;

    ensureSettingsModal();

    var button = document.createElement('button');
    button.id = 'header-settings-btn';
    button.className = 'settings-btn';
    button.type = 'button';
    button.innerText = '設定';
    button.onclick = openUserSettings;

    var logoutBtn = statsEl.querySelector('.logout-btn');
    if (logoutBtn) statsEl.insertBefore(button, logoutBtn);
    else statsEl.appendChild(button);
}

function openUserSettings() {
    if (!user.sessionId) return;
    var modal = ensureSettingsModal();
    var nameInput = document.getElementById('settings-display-name');
    var numberModeInput = document.getElementById('settings-number-mode');
    var audioEnabledInput = document.getElementById('settings-audio-enabled');
    var audioVolumeInput = document.getElementById('settings-audio-volume');
    if (nameInput) nameInput.value = user.displayName || '';
    if (numberModeInput) numberModeInput.value = getNumberDisplayMode();
    if (audioEnabledInput) audioEnabledInput.value = getAudioEnabled() ? 'on' : 'off';
    if (audioVolumeInput) audioVolumeInput.value = String(Math.round(getAudioVolume() * 100));
    modal.classList.remove('hidden');
}

function closeUserSettings() {
    var modal = document.getElementById('user-settings-modal');
    if (modal) modal.classList.add('hidden');
}

function saveUserSettings() {
    if (!user.sessionId) return;

    var nameInput = document.getElementById('settings-display-name');
    var modeInput = document.getElementById('settings-number-mode');
    var audioEnabledInput = document.getElementById('settings-audio-enabled');
    var audioVolumeInput = document.getElementById('settings-audio-volume');
    var nextDisplayName = String(nameInput && nameInput.value || '').trim();
    var nextMode = modeInput ? modeInput.value : getNumberDisplayMode();
    var nextAudioEnabled = !audioEnabledInput || audioEnabledInput.value !== 'off';
    var nextAudioVolume = Math.min(1, Math.max(0, toSafeNumber(audioVolumeInput && audioVolumeInput.value, 50) / 100));
    var currentDisplayName = String(user.displayName || '').trim();
    var previousMode = getNumberDisplayMode();

    var savePromise = Promise.resolve();
    if (nextDisplayName !== currentDisplayName) {
        savePromise = fetch('/api/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'set_profile',
                sessionId: user.sessionId,
                displayName: nextDisplayName
            })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || '更新顯示名稱失敗');
                user.displayName = data.displayName || '';
                updateUI({ displayName: user.displayName });
            });
    }

    savePromise
        .then(function () {
            var normalizedMode = setNumberDisplayMode(nextMode);
            try {
                localStorage.setItem('casino_muted', nextAudioEnabled ? 'false' : 'true');
                localStorage.setItem('casino_volume', String(nextAudioVolume));
            } catch (error) {
                console.log('Failed to persist audio settings');
            }
            ensureAudioManagerScript();
            if (window.audioManager) {
                window.audioManager.setMute(!nextAudioEnabled);
                window.audioManager.setVolume(nextAudioVolume);
                if (nextAudioEnabled && !window.audioManager.initialized) window.audioManager.init();
            }
            closeUserSettings();
            if (previousMode !== normalizedMode) {
                window.location.reload();
                return;
            }
            alert('設定已更新');
        })
        .catch(function (error) {
            alert('更新失敗: ' + error.message);
        });
}

function updateUI(data) {
    if (!data) return;

    if (data.displayName !== undefined) {
        user.displayName = data.displayName || '';
        var nameEl = document.getElementById('display-name-val');
        if (nameEl) nameEl.innerText = data.displayName || '未設定';
        var myNameDisplay = document.getElementById('my-display-name');
        if (myNameDisplay) myNameDisplay.innerText = data.displayName || user.address;
    }

    if (data.balance !== undefined) {
        var balanceNum = toSafeNumber(data.balance, 0);
        user.chainBalance = balanceNum;
        user.balance = resolveDisplayedBalanceValue(balanceNum);
        renderBalanceValue(user.balance);
    }

    if (data.totalBet !== undefined) {
        var totalBetNum = toSafeNumber(data.totalBet, 0);
        user.totalBet = totalBetNum;
        var totalBetEl = document.getElementById('total-bet-val');
        if (totalBetEl) totalBetEl.innerText = formatDisplayNumber(totalBetNum, 2);
    }

    var levelValue = data.level !== undefined ? data.level : data.vipLevel;
    var betLimitValue = data.betLimit !== undefined ? data.betLimit : data.maxBet;

    if (levelValue) {
        user.level = String(levelValue);
        var levelText = String(levelValue);
        if (betLimitValue !== undefined) {
            user.betLimit = toSafeNumber(betLimitValue, 0);
            levelText += ' | 單注上限 ' + formatDisplayNumber(betLimitValue, 2) + ' 子熙幣';
        }

        var badge = document.getElementById('vip-badge');
        if (badge) badge.innerText = levelText;

        var headerVip = document.getElementById('header-vip');
        if (headerVip) headerVip.innerText = levelText;

        var card = document.getElementById('main-card');
        if (card) {
            if (String(levelValue).indexOf('鑽石') !== -1 || String(levelValue).indexOf('等級') !== -1) {
                card.classList.add('vip-diamond');
            } else {
                card.classList.remove('vip-diamond');
            }
        }
    }

    if (betLimitValue !== undefined) {
        user.betLimit = toSafeNumber(betLimitValue, 0);
        renderMaxBetNote(betLimitValue);
    }

    if (data.rewardProfile) {
        renderIdentity(data.rewardProfile);
    }

    ensureSupportShortcut();
    ensureAudioManagerScript();
    ensureGlobalAudioBindings();
    ensureSettingsButton();
}

function promptDisplayName() {
    if (!user.sessionId) return;

    var current = '';
    var currentEl = document.getElementById('display-name-val');
    if (currentEl) current = String(currentEl.innerText || '').trim();
    if (current === '未設定') current = '';

    var input = window.prompt('請輸入顯示名稱（2-24 字，可使用中文、英文、數字與底線）', current);
    if (input === null) return;

    fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'set_profile',
            sessionId: user.sessionId,
            displayName: input
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '更新顯示名稱失敗');
            updateUI({ displayName: data.displayName });
            alert('顯示名稱已更新');
        })
        .catch(function (error) {
            alert('更新失敗: ' + error.message);
        });
}

function refreshBalance() {
    if (!user.address) return;

    fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'get_balance',
            address: user.address
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) return;
            updateUI({ balance: data.balance });
        })
        .catch(function () {
            console.log('Balance refresh failed');
        });
}

function syncAuthoritativeChainBalance() {
    if (!user.address) return;
    clearDisplayedBalanceOverride();
    refreshBalance();
}

function startBalanceRefresh() {
    if (balanceRefreshIntervalId) clearInterval(balanceRefreshIntervalId);
    if (balanceAuthoritativeSyncIntervalId) clearInterval(balanceAuthoritativeSyncIntervalId);
    setTimeout(refreshBalance, 800);
    balanceRefreshIntervalId = setInterval(refreshBalance, 30000);
    balanceAuthoritativeSyncIntervalId = setInterval(syncAuthoritativeChainBalance, 15 * 60 * 1000);
}

function txLinkHTML(txHash) {
    if (!txHash) return '';
    return '<a href="https://sepolia.etherscan.io/tx/' + txHash + '" target="_blank" style="color: #888; text-decoration: underline;">查看交易紀錄 (Etherscan)</a>';
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

function ensureGlobalChatScriptLoaded() {
    if (window.__globalChatScriptLoading) return;
    if (window.startLobbyChat && typeof window.startLobbyChat === 'function') return;

    var existing = document.querySelector('script[data-global-chat-script="1"]');
    if (existing) return;

    window.__globalChatScriptLoading = true;
    var script = document.createElement('script');
    script.src = '/js/chat.js';
    script.defer = true;
    script.setAttribute('data-global-chat-script', '1');
    script.onload = function () {
        window.__globalChatScriptLoading = false;
    };
    script.onerror = function () {
        window.__globalChatScriptLoading = false;
        console.log('Global chat script failed to load');
    };
    document.head.appendChild(script);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureGlobalChatScriptLoaded);
} else {
    ensureGlobalChatScriptLoaded();
}
