var walletBusy = false;
var currentWalletAddress = '';

function fmtToken(value, digits) {
    var num = toSafeNumber(value, 0);
    var places = digits === undefined ? 6 : digits;
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: places
    });
}

function fmtTokenOrUnlimited(value, digits) {
    if (value === null || value === undefined || value === '') return '無上限';
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

function renderGameHistory(items) {
    var el = document.getElementById('game-history-list');
    if (!el) return;

    if (!Array.isArray(items) || items.length === 0) {
        el.innerHTML = '<div class="history-empty">目前還沒有遊戲輸贏紀錄</div>';
        return;
    }

    el.innerHTML = items.map(function (item) {
        var net = toSafeNumber(item.netAmount, 0);
        var amountClass = net > 0 ? 'is-win' : (net < 0 ? 'is-lose' : 'is-flat');
        var meta = [];
        if (item.betAmount) meta.push('下注 ' + fmtToken(item.betAmount));
        if (item.multiplier) meta.push('倍率 ' + Number(item.multiplier).toFixed(2) + 'x');
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
        el.innerHTML = '<div class="history-empty">目前還沒有鏈上交易紀錄</div>';
        return;
    }

    el.innerHTML = items.map(function (item) {
        var isSend = item.type === 'send';
        var amountClass = isSend ? 'is-lose' : 'is-win';
        var amountText = (isSend ? '-' : '+') + fmtToken(item.amount);
        var counterParty = item.counterParty ? shortenWalletAddress(item.counterParty) : '-';
        var txLink = item.txHash ? '<a class="history-link" href="https://sepolia.etherscan.io/tx/' + encodeURIComponent(item.txHash) + '" target="_blank" rel="noopener noreferrer">查看交易</a>' : '';

        return '' +
            '<div class="history-item-card">' +
                '<div class="history-item-top">' +
                    '<div>' +
                        '<div class="history-item-title">' + (isSend ? '轉出' : '轉入') + '</div>' +
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
            address: historyAddress,
            limit: 10,
            page: 1
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '讀取交易紀錄失敗');
            return Array.isArray(data.history) ? data.history : [];
        });
}

function fetchWalletGameHistory() {
    return callWallet('game_history', { limit: 12 })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '讀取輸贏紀錄失敗');
            return Array.isArray(data.items) ? data.items : [];
        });
}

function refreshWalletHistory(silent) {
    if (!silent) setWalletStatus('同步紀錄中...', false);
    return Promise.allSettled([fetchWalletGameHistory(), fetchWalletTxHistory()])
        .then(function (results) {
            var gameResult = results[0];
            var txResult = results[1];
            var errors = [];

            if (gameResult.status === 'fulfilled') {
                renderGameHistory(gameResult.value);
            } else {
                renderGameHistory([]);
                errors.push(gameResult.reason && gameResult.reason.message ? gameResult.reason.message : '讀取輸贏紀錄失敗');
            }

            if (txResult.status === 'fulfilled') {
                renderTxHistory(txResult.value);
            } else {
                renderTxHistory([]);
                errors.push(txResult.reason && txResult.reason.message ? txResult.reason.message : '讀取交易紀錄失敗');
            }

            if (!silent) {
                setWalletStatus(errors.length > 0 ? ('部分紀錄更新失敗: ' + errors.join(' / ')) : '紀錄已更新', errors.length > 0);
            }
        });
}

function withWalletBusy(task) {
    if (walletBusy) return Promise.reject(new Error('請稍候，上一筆操作仍在處理'));
    walletBusy = true;
    return task().finally(function () {
        walletBusy = false;
    });
}

function callWallet(action, payload) {
    var body = {
        sessionId: user.sessionId,
        action: action
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

function renderWalletSummary(data) {
    if (!data || !data.success) return;
    currentWalletAddress = data.address || '';

    var walletAddressEl = document.getElementById('wallet-address');
    if (walletAddressEl && data.address) walletAddressEl.innerText = data.address;

    var receiveAddressEl = document.getElementById('receive-address');
    if (receiveAddressEl) receiveAddressEl.innerText = data.address || '-';
    renderWalletQr(data.address || '');

    var balEl = document.getElementById('wallet-balance');
    if (balEl) balEl.innerText = fmtToken(data.userBalance);

    var treasuryEl = document.getElementById('treasury-balance');
    if (treasuryEl) treasuryEl.innerText = fmtToken(data.treasuryBalance);

    var airdropRemainEl = document.getElementById('airdrop-remaining');
    if (airdropRemainEl && data.airdrop) {
        airdropRemainEl.innerText = fmtTokenOrUnlimited(data.airdrop.remaining);
    }

    var airdropRewardEl = document.getElementById('airdrop-reward');
    if (airdropRewardEl && data.airdrop) {
        airdropRewardEl.innerText = fmtToken(data.airdrop.reward);
    }

    var airdropHalvingCountEl = document.getElementById('airdrop-halving-count');
    if (airdropHalvingCountEl && data.airdrop) {
        airdropHalvingCountEl.innerText = String(data.airdrop.halvingCount || 0);
    }

    var airdropMetaEl = document.getElementById('airdrop-meta');
    if (airdropMetaEl && data.airdrop) {
        airdropMetaEl.innerText =
            '目前每次可領: ' + fmtToken(data.airdrop.reward) +
            ' | 已空投總量: ' + fmtToken(data.airdrop.distributedExcludingAdmin || data.airdrop.distributed) +
            ' / 上限: ' + fmtTokenOrUnlimited(data.airdrop.cap) +
            ' | 下次減半門檻: ' + fmtToken(data.airdrop.nextHalvingAt);
    }

    updateUI({ balance: data.userBalance });
}

function renderWalletQr(address) {
    var canvas = document.getElementById('wallet-qr-canvas');
    if (!canvas || !address) return;
    if (typeof QRCode === 'undefined' || !QRCode.toCanvas) return;

    QRCode.toCanvas(canvas, address, { width: 180, margin: 2 }, function () {});
}

function copyWalletAddress() {
    if (!currentWalletAddress) {
        setWalletStatus('地址尚未載入完成', true);
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentWalletAddress)
            .then(function () {
                notifyWallet('已複製錢包地址', false);
            })
            .catch(function () {
                notifyWallet('複製失敗，請手動複製地址', true);
            });
        return;
    }

    var tmp = document.createElement('input');
    tmp.value = currentWalletAddress;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    notifyWallet('已複製錢包地址', false);
}

function refreshWalletSummary(silent) {
    if (!silent) setWalletStatus('同步錢包資料中...', false);
    return callWallet('summary')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '讀取錢包資料失敗');
            renderWalletSummary(data);
            if (!silent) setWalletStatus('錢包資料已更新', false);
        })
        .catch(function (e) {
            setWalletStatus('錯誤: ' + e.message, true);
        });
}

function exportFunds() {
    var to = String(document.getElementById('export-to').value || '').trim();
    var amount = String(document.getElementById('export-amount').value || '').trim();
    var amountNum = toSafeNumber(amount, 0);
    setWalletStatus('匯出資金中...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return callWallet('export', { to: to, amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '匯出失敗');
            setDisplayedBalance(getCurrentUserBalance() - amountNum, 45000, 'wallet_export');
            notifyWallet('匯出成功：-' + formatDisplayNumber(amount, 2) + ' 子熙幣', false);
            setWalletTx(data.txHash || '');
            return Promise.all([refreshWalletSummary(true), refreshWalletHistory(true)]);
        });
    }).catch(function (e) {
        notifyWallet('錯誤: ' + e.message, true);
    });
}

function withdrawToTreasury() {
    var amount = String(document.getElementById('withdraw-amount').value || '').trim();
    var amountNum = toSafeNumber(amount, 0);
    setWalletStatus('匯回金庫中...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return callWallet('withdraw', { amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '匯回失敗');
            setDisplayedBalance(getCurrentUserBalance() - amountNum, 45000, 'wallet_withdraw');
            notifyWallet('匯回成功：-' + formatDisplayNumber(amount, 2) + ' 子熙幣', false);
            setWalletTx(data.txHash || '');
            return Promise.all([refreshWalletSummary(true), refreshWalletHistory(true)]);
        });
    }).catch(function (e) {
        notifyWallet('錯誤: ' + e.message, true);
    });
}

function claimAirdrop() {
    if (!user.sessionId) return;

    setWalletStatus('領取空投中...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'airdrop',
                sessionId: user.sessionId 
            })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || '空投領取失敗');
                setDisplayedBalance(getCurrentUserBalance() + toSafeNumber(data.reward, 0), 45000, 'wallet_airdrop');
                notifyWallet('空投成功：+' + fmtToken(data.reward) + ' 子熙幣', false);
                setWalletTx(data.txHash || '');
                return Promise.all([refreshWalletSummary(true), refreshWalletHistory(true)]);
            });
    }).catch(function (e) {
        notifyWallet('錯誤: ' + e.message, true);
    });
}

function initWalletPage() {
    refreshWalletSummary(false);
    refreshWalletHistory(true);
    setInterval(function () {
        if (walletBusy) return;
        refreshWalletSummary(true);
        refreshWalletHistory(true);
    }, 30000);
}
