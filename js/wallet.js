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

function setWalletStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff6666' : '#ffd36a';
}

function setWalletTx(txHash) {
    var txEl = document.getElementById('tx-log');
    if (!txEl) return;
    txEl.innerHTML = txHash ? txLinkHTML(txHash) : '';
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
        airdropRemainEl.innerText = fmtToken(data.airdrop.remaining);
    }

    var airdropMetaEl = document.getElementById('airdrop-meta');
    if (airdropMetaEl && data.airdrop) {
        airdropMetaEl.innerText = '已發放: ' + fmtToken(data.airdrop.distributed) +
            ' / 上限: ' + fmtToken(data.airdrop.cap);
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
                setWalletStatus('已複製錢包地址', false);
            })
            .catch(function () {
                setWalletStatus('複製失敗，請手動複製地址', true);
            });
        return;
    }

    var tmp = document.createElement('input');
    tmp.value = currentWalletAddress;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    setWalletStatus('已複製錢包地址', false);
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
    setWalletStatus('匯出資金中...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return callWallet('export', { to: to, amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '匯出失敗');
            setWalletStatus('匯出成功：-' + amount + ' 子熙幣', false);
            setWalletTx(data.txHash || '');
            return refreshWalletSummary(true);
        });
    }).catch(function (e) {
        setWalletStatus('錯誤: ' + e.message, true);
    });
}

function withdrawToTreasury() {
    var amount = String(document.getElementById('withdraw-amount').value || '').trim();
    setWalletStatus('匯回金庫中...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return callWallet('withdraw', { amount: amount }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '匯回失敗');
            setWalletStatus('匯回成功：-' + amount + ' 子熙幣', false);
            setWalletTx(data.txHash || '');
            return refreshWalletSummary(true);
        });
    }).catch(function (e) {
        setWalletStatus('錯誤: ' + e.message, true);
    });
}

function claimAirdrop() {
    if (!user.address) return;

    setWalletStatus('領取空投中...', false);
    setWalletTx('');

    withWalletBusy(function () {
        return fetch('/api/airdrop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: user.address })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || '空投領取失敗');
                setWalletStatus('空投成功：+' + fmtToken(data.reward) + ' 子熙幣', false);
                setWalletTx(data.txHash || '');
                return refreshWalletSummary(true);
            });
    }).catch(function (e) {
        setWalletStatus('錯誤: ' + e.message, true);
    });
}

function initWalletPage() {
    refreshWalletSummary(false);
    setInterval(function () {
        if (walletBusy) return;
        refreshWalletSummary(true);
    }, 30000);
}
