/* === 閃電賭場 - 共用工具 === */

// 全域用戶狀態
var user = { address: '', publicKey: '', sessionId: '' };

/**
 * 更新 UI 上的用戶數據 (餘額、VIP、累計押注)
 */
function updateUI(data) {
    if (!data) return;

    if (data.balance !== undefined) {
        var balEl = document.getElementById('balance-val');
        if (balEl) balEl.innerText = parseFloat(data.balance).toLocaleString(undefined, { minimumFractionDigits: 2 });
        // 也更新 header 上的餘額
        var hBal = document.getElementById('header-balance');
        if (hBal) hBal.innerText = parseFloat(data.balance).toLocaleString(undefined, { minimumFractionDigits: 2 });
    }

    if (data.totalBet !== undefined) {
        var tbEl = document.getElementById('total-bet-val');
        if (tbEl) tbEl.innerText = parseFloat(data.totalBet).toFixed(2);
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

    fetch('/api/get-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.address })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            updateUI({ balance: data.balance });
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

function recoverLegacyLossToCurrentWallet() {
    if (!user.sessionId || !user.address) return;

    var btn = document.getElementById('recover-btn');
    var msgEl = document.getElementById('recover-msg');
    var txEl = document.getElementById('recover-tx');

    if (btn) btn.disabled = true;
    if (msgEl) msgEl.innerHTML = '<span class="loader"></span> 回收交易送出中...';
    if (txEl) txEl.innerHTML = '';

    fetch('/api/recover-loss-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: user.sessionId,
            toAddress: user.address
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data || !data.success) {
            throw new Error((data && data.error) || '回收失敗');
        }

        if (msgEl) msgEl.innerText = '✅ 已回收 ' + data.amount + ' ZXC 到目前登入錢包';
        if (txEl) txEl.innerHTML = txLinkHTML(data.txHash);
        setTimeout(refreshBalance, 7000);
    })
    .catch(function(err) {
        if (msgEl) msgEl.innerText = '❌ 回收失敗: ' + err.message;
    })
    .finally(function() {
        if (btn) btn.disabled = false;
    });
}
