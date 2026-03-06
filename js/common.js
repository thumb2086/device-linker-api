/* === 子熙賭場 - 共用工具 === */

// 全域用戶狀態
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
        if (tbEl) tbEl.innerText = formatCompactZh(totalBetNum, 2);
    }

    if (data.vipLevel) {
        var vipText = data.vipLevel;
        if (data.maxBet !== undefined) {
            vipText += ' | 單注上限 ' + formatCompactZh(data.maxBet, 2) + ' 子熙幣';
        }

        var badge = document.getElementById('vip-badge');
        if (badge) badge.innerText = vipText;

        var hVip = document.getElementById('header-vip');
        if (hVip) hVip.innerText = vipText;

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
