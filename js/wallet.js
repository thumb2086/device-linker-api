var walletBusy = false;
var currentWalletAddress = '';
var currentWalletToken = 'zhixi';
var currentWalletTokenSymbol = 'ZHIXI';
var currentWalletSupportsAirdrop = true;

var walletTokenMap = {
    zhixi: {
        key: 'zhixi',
        symbol: 'ZHIXI',
        label: 'ZhiXi Coin',
        supportsAirdrop: true
    },
    yjc: {
        key: 'yjc',
        symbol: 'YJC',
        label: 'YouJian Coin',
        supportsAirdrop: false
    }
};

function normalizeWalletToken(value) {
    var normalized = String(value || 'zhixi').trim().toLowerCase();
    return walletTokenMap[normalized] ? normalized : 'zhixi';
}

function getWalletTokenMeta(token) {
    return walletTokenMap[normalizeWalletToken(token)];
}

function getWalletActiveToken() {
    return currentWalletToken;
}

window.getWalletActiveToken = getWalletActiveToken;

function fmtToken(value, digits) {
    var num = toSafeNumber(value, 0);
    var places = digits === undefined ? 6 : digits;
    if (typeof getNumberDisplayMode === 'function' && getNumberDisplayMode() === 'compact' && Math.abs(num) >= 10000) {
        return formatDisplayNumber(num, places);
    }
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: places
    });
}

function fmtTokenOrFallback(value, fallback, digits) {
    if (value === null || value === undefined || value === '') return fallback || 'N/A';
    return fmtToken(value, digits);
}

function setWalletStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff6666' : '#ffd36a';
}

function notifyWallet(text, isError) {
    setWalletStatus(text, isError);
    if (typeof showUserToast === 'function') {
        showUserToast(text, isError);
    }
}

function setWalletTx(txHash) {
    var txEl = document.getElementById('tx-log');
    if (!txEl) return;
    txEl.innerHTML = txHash ? txLinkHTML(txHash) : '';
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatHistoryTime(value) {
    var ts = Date.parse(String(value || ''));
    if (!Number.isFinite(ts)) return '-';
    return new Date(ts).toLocaleString('zh-TW', { hour12: false });
}

function formatNetAmount(value) {
    var num = toSafeNumber(value, 0);
    var sign = num > 0 ? '+' : '';
    return sign + fmtToken(num);
}

function shortenWalletAddress(value) {
    var text = String(value || '').trim();
    if (text.length <= 14) return text || '-';
    return text.slice(0, 6) + '...' + text.slice(-4);
}

function renderHistoryEmpty(targetId, text) {
    var el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = '<div class="history-empty">' + escapeHtml(text || 'No data') + '</div>';
}

function renderGameHistory(items) {
    var el = document.getElementById('game-history-list');
    if (!el) return;

    if (!Array.isArray(items) || items.length === 0) {
        renderHistoryEmpty('game-history-list', 'No game history yet.');
        return;
    }

    el.innerHTML = items.map(function (item) {
        var net = toSafeNumber(item.netAmount, 0);
        var amountClass = net > 0 ? 'is-win' : (net < 0 ? 'is-lose' : 'is-flat');
        var meta = [];
        if (item.betAmount) meta.push('Bet ' + fmtToken(item.betAmount));
        if (item.multiplier) meta.push('x' + Number(item.multiplier).toFixed(2));
        if (item.details) meta.push(item.details);

        return '' +
            '<div class="history-item-card">' +
                '<div class="history-item-top">' +
                    '<div>' +
                        '<div class="history-item-title">' + escapeHtml(item.gameLabel || item.game || '-') + '</div>' +
                        '<div class="history-item-label">' + escapeHtml(item.outcomeLabel || item.outcome || '-') + '</div>' +
                    '</div>' +
                    '<div class="history-amount ' + amountClass + '">' + formatNetAmount(item.netAmount) + '</div>' +
                '</div>' +
                '<div class="history-item-bottom">' +
                    '<span class="history-meta">' + escapeHtml(meta.join(' | ')) + '</span>' +
                    '<span class="history-meta">' + escapeHtml(formatHistoryTime(item.createdAt)) + '</span>' +
                '</div>' +
            '</div>';
    }).join('');
}

function renderTxHistory(items) {
    var el = document.getElementById('tx-history-list');
    if (!el) return;

    if (!Array.isArray(items) || items.length === 0) {
        renderHistoryEmpty('tx-history-list', 'No token transfers yet.');
        return;
    }

    el.innerHTML = items.map(function (item) {
        var isSend = item.type === 'send';
        var amountClass = isSend ? 'is-lose' : 'is-win';
        var tokenSymbol = item.tokenSymbol || currentWalletTokenSymbol;
        var amountText = (isSend ? '-' : '+') + fmtToken(item.amount) + ' ' + tokenSymbol;
        var counterParty = item.counterParty ? shortenWalletAddress(item.counterParty) : '-';
        var txLink = item.txHash
            ? '<a class="history-link" href="https://sepolia.etherscan.io/tx/' + encodeURIComponent(item.txHash) + '" target="_blank" rel="noopener noreferrer">View Tx</a>'
            : '';

        return '' +
            '<div class="history-item-card">' +
                '<div class="history-item-top">' +
                    '<div>' +
                        '<div class="history-item-title">' + (isSend ? 'Send' : 'Receive') + '</div>' +
                        '<div class="history-item-label">' + escapeHtml(counterParty) + '</div>' +
                    '</div>' +
                    '<div class="history-amount ' + amountClass + '">' + amountText + '</div>' +
                '</div>' +
                '<div class="history-item-bottom">' +
                    '<span class="history-meta">' + escapeHtml(item.date || '-') + '</span>' +
                    '<span>' + txLink + '</span>' +
                '</div>' +
            '</div>';
    }).join('');
}

function fetchWalletTxHistory() {
    var historyAddress = currentWalletAddress || user.address;
    if (!historyAddress) return Promise.resolve([]);

    return fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'get_history',
            token: currentWalletToken,
            address: historyAddress,
            limit: 10,
            page: 1
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || 'Failed to load transfer history');
            return Array.isArray(data.history) ? data.history : [];
        });
}

function fetchWalletGameHistory() {
    return callWallet('game_history', { limit: 12 })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || 'Failed to load game history');
            return Array.isArray(data.items) ? data.items : [];
        });
}

function refreshWalletHistory(silent) {
    if (!silent) setWalletStatus('Loading history...', false);

    if (currentWalletToken !== 'zhixi') {
        renderHistoryEmpty('game-history-list', currentWalletTokenSymbol + ' is not used in game settlement yet.');
        return fetchWalletTxHistory()
            .then(function (items) {
                renderTxHistory(items);
                if (!silent) setWalletStatus('History updated.', false);
            })
            .catch(function (error) {
                renderTxHistory([]);
                if (!silent) setWalletStatus('History update failed: ' + error.message, true);
            });
    }

    return Promise.allSettled([fetchWalletGameHistory(), fetchWalletTxHistory()])
        .then(function (results) {
            var gameResult = results[0];
            var txResult = results[1];
            var errors = [];

            if (gameResult.status === 'fulfilled') {
                renderGameHistory(gameResult.value);
            } else {
                renderGameHistory([]);
                errors.push(gameResult.reason && gameResult.reason.message ? gameResult.reason.message : 'Failed to load game history');
            }

            if (txResult.status === 'fulfilled') {
                renderTxHistory(txResult.value);
            } else {
                renderTxHistory([]);
                errors.push(txResult.reason && txResult.reason.message ? txResult.reason.message : 'Failed to load transfer history');
            }

            if (!silent) {
                setWalletStatus(errors.length > 0 ? ('History update failed: ' + errors.join(' / ')) : 'History updated.', errors.length > 0);
            }
        });
}

function withWalletBusy(task) {
    if (walletBusy) return Promise.reject(new Error('Wallet action is still running'));
    walletBusy = true;
    return task().finally(function () {
        walletBusy = false;
    });
}

function callWallet(action, payload) {
    var body = {
        sessionId: user.sessionId,
        action: action,
        token: currentWalletToken
    };

    if (payload && typeof payload === 'object') {
        Object.keys(payload).forEach(function (key) {
            body[key] = payload[key];
        });
    }

    return fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (res) { return res.json(); });
}

function applyWalletTokenMeta(data) {
    var meta = getWalletTokenMeta(data && data.token ? data.token : currentWalletToken);
    currentWalletToken = meta.key;
    currentWalletTokenSymbol = data && data.tokenSymbol ? data.tokenSymbol : meta.symbol;
    currentWalletSupportsAirdrop = data && data.supportsAirdrop !== undefined
        ? !!data.supportsAirdrop
        : !!meta.supportsAirdrop;

    var selectEl = document.getElementById('wallet-token-select');
    if (selectEl) selectEl.value = currentWalletToken;

    var badgeEl = document.getElementById('wallet-token-badge');
    if (badgeEl) badgeEl.innerText = currentWalletTokenSymbol;

    var metaEl = document.getElementById('wallet-token-meta');
    if (metaEl) {
        metaEl.innerText = (data && data.tokenLabel ? data.tokenLabel : meta.label) + ' (' + currentWalletTokenSymbol + ')';
    }

    var symbolEls = document.querySelectorAll('[data-wallet-token-symbol]');
    for (var index = 0; index < symbolEls.length; index += 1) {
        symbolEls[index].innerText = currentWalletTokenSymbol;
    }

    var gameHeadEl = document.getElementById('game-history-title-note');
    if (gameHeadEl) {
        gameHeadEl.innerText = currentWalletToken === 'zhixi' ? 'Game' : 'Game (ZHIXI only)';
    }
}

function syncAirdropPanel(data) {
    var buttonEl = document.getElementById('claim-airdrop-btn');
    var noteEl = document.getElementById('wallet-airdrop-note');
    var metaEl = document.getElementById('airdrop-meta');

    if (buttonEl) {
        buttonEl.disabled = !currentWalletSupportsAirdrop || walletBusy;
        buttonEl.innerText = currentWalletSupportsAirdrop ? 'Claim Airdrop' : 'Airdrop Unavailable';
    }

    if (!currentWalletSupportsAirdrop || !data || !data.airdrop) {
        if (noteEl) noteEl.innerText = currentWalletTokenSymbol + ' does not provide wallet airdrop.';
        if (metaEl) metaEl.innerText = currentWalletTokenSymbol + ' airdrop is unavailable.';
        var remainingEl = document.getElementById('airdrop-remaining');
        if (remainingEl) remainingEl.innerText = 'N/A';
        var rewardEl = document.getElementById('airdrop-reward');
        if (rewardEl) rewardEl.innerText = 'N/A';
        var halvingCountEl = document.getElementById('airdrop-halving-count');
        if (halvingCountEl) halvingCountEl.innerText = '-';
        return;
    }

    if (noteEl) {
        noteEl.innerText =
            'Reward ' + fmtToken(data.airdrop.reward) + ' ' + currentWalletTokenSymbol +
            ' | Distributed ' + fmtToken(data.airdrop.distributedExcludingAdmin || data.airdrop.distributed) +
            ' | Next halving at ' + fmtTokenOrFallback(data.airdrop.nextHalvingAt, 'N/A');
    }
    if (metaEl) {
        metaEl.innerText = noteEl ? noteEl.innerText : '';
    }
}

function renderWalletSummary(data) {
    if (!data || !data.success) return;
    applyWalletTokenMeta(data);
    currentWalletAddress = data.address || '';

    var walletAddressEl = document.getElementById('wallet-address');
    if (walletAddressEl && data.address) walletAddressEl.innerText = data.address;

    var receiveAddressEl = document.getElementById('receive-address');
    if (receiveAddressEl) receiveAddressEl.innerText = data.address || '-';
    renderWalletQr(data.address || '');

    var balEl = document.getElementById('wallet-balance') || document.getElementById('balance-val');
    if (balEl) balEl.innerText = fmtToken(data.userBalance);

    var treasuryEl = document.getElementById('treasury-balance');
    if (treasuryEl) treasuryEl.innerText = fmtToken(data.treasuryBalance);

    var airdropRemainEl = document.getElementById('airdrop-remaining');
    if (airdropRemainEl) {
        airdropRemainEl.innerText = data.airdrop ? fmtTokenOrFallback(data.airdrop.remaining, 'Unlimited') : 'N/A';
    }

    var airdropRewardEl = document.getElementById('airdrop-reward');
    if (airdropRewardEl) {
        airdropRewardEl.innerText = data.airdrop ? fmtToken(data.airdrop.reward) : 'N/A';
    }

    var airdropHalvingCountEl = document.getElementById('airdrop-halving-count');
    if (airdropHalvingCountEl) {
        airdropHalvingCountEl.innerText = data.airdrop ? String(data.airdrop.halvingCount || 0) : '-';
    }

    syncAirdropPanel(data);
    updateUI({ balance: data.userBalance });
}

function renderWalletQr(address) {
    var canvas = document.getElementById('wallet-qr-canvas');
    if (!canvas) return;
    if (!address || typeof QRCode === 'undefined' || !QRCode.toCanvas) {
        var ctx = canvas.getContext && canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    QRCode.toCanvas(canvas, address, { width: 180, margin: 2 }, function () {});
}

function copyWalletAddress() {
    if (!currentWalletAddress) {
        setWalletStatus('No wallet address available.', true);
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentWalletAddress)
            .then(function () {
                notifyWallet('Address copied.', false);
            })
            .catch(function () {
                notifyWallet('Copy failed.', true);
            });
        return;
    }

    var tmp = document.createElement('input');
    tmp.value = currentWalletAddress;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    notifyWallet('Address copied.', false);
}

function refreshWalletSummary(silent) {
    if (!silent) setWalletStatus('Loading wallet summary...', false);
    return callWallet('summary')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || 'Failed to load wallet summary');
            renderWalletSummary(data);
            if (!silent) setWalletStatus('Wallet summary updated.', false);
        })
        .catch(function (error) {
            setWalletStatus('Wallet summary failed: ' + error.message, true);
        });
}

function exportFunds() {
    var to = String(document.getElementById('export-to').value || '').trim();
    var amountText = String(document.getElementById('export-amount').value || '').trim();
    var amountNum = toSafeNumber(amountText, 0);

    if (!to) return notifyWallet('Please enter a destination address.', true);
    if (amountNum <= 0) return notifyWallet('Please enter a valid amount.', true);

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    var restoreBtn = null;
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Sending...';
    }
    restoreBtn = function () {
        if (!btn) return;
        btn.disabled = false;
        btn.innerText = 'Transfer Out';
    };

    setWalletStatus('Submitting transfer...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return callWallet('export', { to: to, amount: amountText }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || 'Transfer failed');
            setDisplayedBalance(getCurrentUserBalance() - amountNum, 45000, 'wallet_export');
            notifyWallet('Transferred ' + formatDisplayNumber(amountNum, 2) + ' ' + currentWalletTokenSymbol, false);
            setWalletTx(data.txHash || '');
            return Promise.all([refreshWalletSummary(true), refreshWalletHistory(true)]);
        });
    }).catch(function (error) {
        notifyWallet('Transfer failed: ' + error.message, true);
    }).finally(restoreBtn);
}

function withdrawToTreasury() {
    var amountText = String(document.getElementById('withdraw-amount').value || '').trim();
    var amountNum = toSafeNumber(amountText, 0);

    if (amountNum <= 0) return notifyWallet('Please enter a valid amount.', true);

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    var restoreBtn = null;
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Withdrawing...';
    }
    restoreBtn = function () {
        if (!btn) return;
        btn.disabled = false;
        btn.innerText = 'Withdraw';
    };

    setWalletStatus('Withdrawing to treasury...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return callWallet('withdraw', { amount: amountText }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || 'Withdraw failed');
            setDisplayedBalance(getCurrentUserBalance() - amountNum, 45000, 'wallet_withdraw');
            notifyWallet('Withdrawn ' + formatDisplayNumber(amountNum, 2) + ' ' + currentWalletTokenSymbol, false);
            setWalletTx(data.txHash || '');
            return Promise.all([refreshWalletSummary(true), refreshWalletHistory(true)]);
        });
    }).catch(function (error) {
        notifyWallet('Withdraw failed: ' + error.message, true);
    }).finally(restoreBtn);
}

function claimAirdrop() {
    if (!user.sessionId) return;
    if (!currentWalletSupportsAirdrop) {
        notifyWallet(currentWalletTokenSymbol + ' does not support wallet airdrop.', true);
        return;
    }

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    var restoreBtn = null;
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Claiming...';
    }
    restoreBtn = function () {
        if (!btn) return;
        btn.disabled = false;
        btn.innerText = 'Claim Airdrop';
    };

    setWalletStatus('Claiming airdrop...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'airdrop',
                token: currentWalletToken,
                sessionId: user.sessionId
            })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || 'Airdrop failed');
                setDisplayedBalance(getCurrentUserBalance() + toSafeNumber(data.reward, 0), 45000, 'wallet_airdrop');
                notifyWallet('Airdrop received: ' + fmtToken(data.reward) + ' ' + currentWalletTokenSymbol, false);
                setWalletTx(data.txHash || '');
                return Promise.all([refreshWalletSummary(true), refreshWalletHistory(true)]);
            });
    }).catch(function (error) {
        notifyWallet('Airdrop failed: ' + error.message, true);
    }).finally(restoreBtn);
}

function switchWalletToken(nextToken) {
    var normalized = normalizeWalletToken(nextToken);
    if (normalized === currentWalletToken) return;
    var meta = getWalletTokenMeta(normalized);
    currentWalletToken = normalized;
    currentWalletTokenSymbol = meta.symbol;
    currentWalletSupportsAirdrop = !!meta.supportsAirdrop;
    applyWalletTokenMeta({ token: normalized, tokenSymbol: meta.symbol, tokenLabel: meta.label, supportsAirdrop: meta.supportsAirdrop });
    setWalletStatus('Switching to ' + meta.symbol + '...', false);
    setWalletTx('');
    refreshWalletSummary(false);
    refreshWalletHistory(true);
}

function initWalletPage() {
    var selectEl = document.getElementById('wallet-token-select');
    if (selectEl) {
        selectEl.value = currentWalletToken;
        selectEl.addEventListener('change', function () {
            switchWalletToken(selectEl.value);
        });
    }

    applyWalletTokenMeta(getWalletTokenMeta(currentWalletToken));
    refreshWalletSummary(false);
    refreshWalletHistory(true);
    setInterval(function () {
        if (walletBusy) return;
        refreshWalletSummary(true);
        refreshWalletHistory(true);
    }, 30000);
}
