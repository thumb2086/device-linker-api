/* === 子熙賭場 - 共用 UI 工具 === */

var user = { address: '', publicKey: '', sessionId: '' };

function toSafeNumber(value, fallback) {
    var parsed = Number(String(value === undefined || value === null ? '' : value).replace(/,/g, '').trim());
    if (!Number.isFinite(parsed)) return (fallback !== undefined ? fallback : 0);
    return parsed;
}

function formatCompactZh(value, digits) {
    var num = toSafeNumber(value, 0);
    var sign = num < 0 ? '-' : '';
    var abs = Math.abs(num);
    var fractionDigits = digits === undefined ? 2 : digits;

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

function renderMaxBetNote(maxBet) {
    var noteEl = document.getElementById('max-bet-note');
    if (!noteEl) return;

    if (maxBet === undefined || maxBet === null || maxBet === '') {
        noteEl.innerText = '單注上限將依目前 VIP 等級計算';
        return;
    }

    noteEl.innerText = '單注上限 ' + formatCompactZh(maxBet, 2) + ' 子熙幣，依目前 VIP 等級自動調整';
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
    link.innerText = '問題回報';
    document.body.appendChild(link);
}

function updateUI(data) {
    if (!data) return;

    if (data.displayName !== undefined) {
        var nameEl = document.getElementById('display-name-val');
        if (nameEl) nameEl.innerText = data.displayName || '未設定';
    }

    if (data.balance !== undefined) {
        var balanceNum = toSafeNumber(data.balance, 0);
        var balanceText = balanceNum.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        var balEl = document.getElementById('balance-val');
        if (balEl) balEl.innerText = balanceText;

        var headerBalance = document.getElementById('header-balance');
        if (headerBalance) headerBalance.innerText = balanceText;
    }

    if (data.totalBet !== undefined) {
        var totalBetNum = toSafeNumber(data.totalBet, 0);
        var totalBetEl = document.getElementById('total-bet-val');
        if (totalBetEl) totalBetEl.innerText = formatCompactZh(totalBetNum, 2);
    }

    if (data.vipLevel) {
        var vipText = data.vipLevel;
        if (data.maxBet !== undefined) {
            vipText += ' | 單注上限 ' + formatCompactZh(data.maxBet, 2) + ' 子熙幣';
        }

        var badge = document.getElementById('vip-badge');
        if (badge) badge.innerText = vipText;

        var headerVip = document.getElementById('header-vip');
        if (headerVip) headerVip.innerText = vipText;

        var card = document.getElementById('main-card');
        if (card) {
            if (data.vipLevel.indexOf('鑽石') !== -1 || data.vipLevel.indexOf('VIP') !== -1) {
                card.classList.add('vip-diamond');
            } else {
                card.classList.remove('vip-diamond');
            }
        }
    }

    if (data.maxBet !== undefined) {
        renderMaxBetNote(data.maxBet);
    }

    ensureSupportShortcut();
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
            if (typeof calcDisplayBalance === 'function') {
                updateUI({ balance: calcDisplayBalance(data.balance) });
            } else {
                updateUI({ balance: data.balance });
            }
        })
        .catch(function () {
            console.log('Balance refresh failed');
        });
}

function startBalanceRefresh() {
    setTimeout(refreshBalance, 800);
    setInterval(refreshBalance, 30000);
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
