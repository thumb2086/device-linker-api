/* === 子熙賭場 - 共用 UI 工具 === */

var user = { address: '', publicKey: '', sessionId: '', displayName: '', balance: 0, chainBalance: 0, totalBet: 0, level: '', betLimit: 0, yjcVip: null };
var userToastTimerSeq = 0;
var BALANCE_OVERRIDE_KEY = 'zixi_balance_override';
var BALANCE_OVERRIDE_ENABLED = true;
var balanceRefreshIntervalId = null;
var balanceAuthoritativeSyncIntervalId = null;
var slotsSettlementResumeIntervalId = null;

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
    var useAuthoritativeValue = !BALANCE_OVERRIDE_ENABLED || normalizedSource === 'authoritative' || normalizedSource === 'chain';
    if (useAuthoritativeValue) {
        clearDisplayedBalanceOverride();
        var authoritativeBalance = toSafeNumber(value, 0);
        user.chainBalance = authoritativeBalance;
        user.balance = authoritativeBalance;
        renderBalanceValue(authoritativeBalance);
        return authoritativeBalance;
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
        'bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);',
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
        '@media (max-width: 640px) { .support-shortcut-link { left: 12px; right: 12px; justify-content: center; bottom: calc(env(safe-area-inset-bottom, 0px) + 8px); } }'
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

function getBgmEnabled() {
    try {
        return localStorage.getItem('casino_bgm_muted') !== 'true';
    } catch (error) {
        return true;
    }
}

function getBgmVolume() {
    try {
        var raw = parseFloat(localStorage.getItem('casino_bgm_volume') || '0.35');
        if (!Number.isFinite(raw)) return 0.35;
        return Math.min(1, Math.max(0, raw));
    } catch (error) {
        return 0.35;
    }
}

function getBarrageEnabled() {
    try {
        return localStorage.getItem('casino_barrage_enabled') !== 'false';
    } catch (error) {
        return true;
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

function inferGlobalBgmTrack() {
    var path = String(window.location && window.location.pathname || '').toLowerCase();
    if (!path || path === '/' || path === '/index.html') return 'lobby';
    if (path.indexOf('/games/market') >= 0) return 'tense';
    if (path.indexOf('/games/casino') >= 0) return 'lobby';
    if (path.indexOf('/games/') >= 0) return 'casino';
    return 'lobby';
}

function ensureGlobalBgmPlayback(force) {
    var track = inferGlobalBgmTrack();
    if (!track || !getBgmEnabled()) {
        if (window.audioManager && typeof window.audioManager.setBgmEnabled === 'function') {
            window.audioManager.setBgmEnabled(getBgmEnabled());
        }
        return;
    }

    if (!window.audioManager || typeof window.audioManager.playBGM !== 'function') {
        if (window.__zixiBgmRetryTimer) clearTimeout(window.__zixiBgmRetryTimer);
        window.__zixiBgmRetryTimer = setTimeout(function () {
            ensureGlobalBgmPlayback(force);
        }, 300);
        return;
    }

    if (window.__zixiBgmRetryTimer) {
        clearTimeout(window.__zixiBgmRetryTimer);
        window.__zixiBgmRetryTimer = null;
    }

    var shouldForce = force === true;
    window.audioManager.setBgmVolume(getBgmVolume());
    window.audioManager.setBgmEnabled(getBgmEnabled());
    if (!shouldForce && window.__zixiActiveBgmTrack === track && window.audioManager.currentBgmKey) {
        return;
    }
    window.audioManager.playBGM(track);
    window.__zixiActiveBgmTrack = track;
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
        '<span>音效音量</span>',
        '<input id="settings-audio-volume" class="settings-input settings-range" type="range" min="0" max="100" step="5">',
        '</label>',
        '<label class="settings-field">',
        '<span>BGM</span>',
        '<select id="settings-bgm-enabled" class="settings-input">',
        '<option value="on">開啟</option>',
        '<option value="off">關閉</option>',
        '</select>',
        '</label>',
        '<label class="settings-field">',
        '<span>BGM 音量</span>',
        '<input id="settings-bgm-volume" class="settings-input settings-range" type="range" min="0" max="100" step="5">',
        '</label>',
        '<label class="settings-field">',
        '<span>彈幕</span>',
        '<select id="settings-barrage-enabled" class="settings-input">',
        '<option value="on">開啟</option>',
        '<option value="off">關閉</option>',
        '</select>',
        '</label>',
        '</div>',
        '<p class="settings-note">可切換金額顯示、音效、BGM 與彈幕；儲存後會立即套用到目前頁面。</p>',
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
    var bgmEnabledInput = document.getElementById('settings-bgm-enabled');
    var bgmVolumeInput = document.getElementById('settings-bgm-volume');
    var barrageEnabledInput = document.getElementById('settings-barrage-enabled');
    if (nameInput) nameInput.value = user.displayName || '';
    if (numberModeInput) numberModeInput.value = getNumberDisplayMode();
    if (audioEnabledInput) audioEnabledInput.value = getAudioEnabled() ? 'on' : 'off';
    if (audioVolumeInput) audioVolumeInput.value = String(Math.round(getAudioVolume() * 100));
    if (bgmEnabledInput) bgmEnabledInput.value = getBgmEnabled() ? 'on' : 'off';
    if (bgmVolumeInput) bgmVolumeInput.value = String(Math.round(getBgmVolume() * 100));
    if (barrageEnabledInput) barrageEnabledInput.value = getBarrageEnabled() ? 'on' : 'off';
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
    var bgmEnabledInput = document.getElementById('settings-bgm-enabled');
    var bgmVolumeInput = document.getElementById('settings-bgm-volume');
    var barrageEnabledInput = document.getElementById('settings-barrage-enabled');
    var nextDisplayName = String(nameInput && nameInput.value || '').trim();
    var nextMode = modeInput ? modeInput.value : getNumberDisplayMode();
    var nextAudioEnabled = !audioEnabledInput || audioEnabledInput.value !== 'off';
    var nextAudioVolume = Math.min(1, Math.max(0, toSafeNumber(audioVolumeInput && audioVolumeInput.value, 50) / 100));
    var nextBgmEnabled = !bgmEnabledInput || bgmEnabledInput.value !== 'off';
    var nextBgmVolume = Math.min(1, Math.max(0, toSafeNumber(bgmVolumeInput && bgmVolumeInput.value, 35) / 100));
    var nextBarrageEnabled = !barrageEnabledInput || barrageEnabledInput.value !== 'off';
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
                localStorage.setItem('casino_bgm_muted', nextBgmEnabled ? 'false' : 'true');
                localStorage.setItem('casino_bgm_volume', String(nextBgmVolume));
                localStorage.setItem('casino_barrage_enabled', nextBarrageEnabled ? 'true' : 'false');
            } catch (error) {
                console.log('Failed to persist user settings');
            }
            ensureAudioManagerScript();
            if (window.audioManager) {
                window.audioManager.setMute(!nextAudioEnabled);
                window.audioManager.setSfxVolume(nextAudioVolume);
                window.audioManager.setBgmEnabled(nextBgmEnabled);
                window.audioManager.setBgmVolume(nextBgmVolume);
                if (nextAudioEnabled && !window.audioManager.initialized) window.audioManager.init();
                if (nextBgmEnabled) ensureGlobalBgmPlayback();
            }
            if (typeof setGlobalBarrageEnabled === 'function') {
                setGlobalBarrageEnabled(nextBarrageEnabled);
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

function updateUI(data, options) {
    if (!data) return;
    var opts = options && typeof options === 'object' ? options : {};

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

    if (data.yjcVip !== undefined) {
        user.yjcVip = data.yjcVip || null;
    }

    if (!opts.skipGlobalHooks) {
        ensureSupportShortcut();
        ensureAudioManagerScript();
        ensureGlobalAudioBindings();
        ensureGlobalBgmPlayback();
        ensureSettingsButton();
    }
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
    var payload = {
        action: 'get_balance',
        address: user.address
    };
    if (typeof window.getWalletActiveToken === 'function') {
        var activeWalletToken = String(window.getWalletActiveToken() || '').trim().toLowerCase();
        if (activeWalletToken) payload.token = activeWalletToken;
    }

    fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

function resumeGlobalSlotsSettlements() {
    if (!user.sessionId || !user.address) return;
    if (window.location.pathname.indexOf('/games/slots.html') >= 0) return;

    fetch('/api/game?game=slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'status',
            address: user.address,
            sessionId: user.sessionId
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || data.error) return;

            var updates = Array.isArray(data.updates) ? data.updates : [];
            var payoutAdded = 0;
            for (var index = 0; index < updates.length; index += 1) {
                var update = updates[index] || {};
                if (String(update.settlementStatus || '').toLowerCase() === 'settled') {
                    payoutAdded += toSafeNumber(update.payoutAmount, 0);
                }
            }

            if (payoutAdded > 0) {
                setDisplayedBalance(getCurrentUserBalance() + payoutAdded, 5000, 'slots-global-payout');
            }

            if (updates.length > 0) {
                setTimeout(refreshBalance, 1200);
            }
        })
        .catch(function () {
            console.log('Global slots settlement resume failed');
        });
}

function startBalanceRefresh() {
    if (balanceRefreshIntervalId) clearInterval(balanceRefreshIntervalId);
    if (balanceAuthoritativeSyncIntervalId) clearInterval(balanceAuthoritativeSyncIntervalId);
    if (slotsSettlementResumeIntervalId) clearInterval(slotsSettlementResumeIntervalId);
    setTimeout(refreshBalance, 800);
    setTimeout(resumeGlobalSlotsSettlements, 2200);
    balanceRefreshIntervalId = setInterval(refreshBalance, 30000);
    balanceAuthoritativeSyncIntervalId = setInterval(syncAuthoritativeChainBalance, 15 * 60 * 1000);
    slotsSettlementResumeIntervalId = setInterval(resumeGlobalSlotsSettlements, 12000);
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

function bootstrapGlobalAudio() {
    if (window.__zixiGlobalAudioBootstrapped) return;
    window.__zixiGlobalAudioBootstrapped = true;

    ensureAudioManagerScript();
    ensureGlobalAudioBindings();

    var kick = function (force) {
        try {
            ensureGlobalBgmPlayback(force === true);
        } catch (error) {
            console.log('Global BGM bootstrap failed');
        }
    };

    kick(true);
    setTimeout(function () { kick(false); }, 350);
    setTimeout(function () { kick(false); }, 1200);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            kick(false);
        }
    });

    window.addEventListener('focus', function () {
        kick(false);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureGlobalChatScriptLoaded);
    document.addEventListener('DOMContentLoaded', bootstrapGlobalAudio);
} else {
    ensureGlobalChatScriptLoaded();
    bootstrapGlobalAudio();
}
