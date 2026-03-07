var adminToolsBusy = false;
var custodyUsers = [];

function setAdminStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#ffd36a';
}

function setCustodyStatus(text, isError) {
    var el = document.getElementById('custody-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9fd0ff';
}

function withAdminBusy(task) {
    if (adminToolsBusy) return Promise.reject(new Error('請稍候，上一筆管理操作仍在處理'));
    adminToolsBusy = true;
    return task().finally(function () {
        adminToolsBusy = false;
    });
}

function maskAdminAddress(address) {
    var text = String(address || '').trim().toLowerCase();
    if (text.length < 12) return text || '-';
    return text.slice(0, 6) + '...' + text.slice(-4);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTime(value) {
    var date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return '-';
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getPasswordInputId(username) {
    return 'custody-password-' + String(username || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function callAdminApi(action, extraPayload) {
    var payload = Object.assign({
        action: action,
        sessionId: user.sessionId
    }, extraPayload || {});

    return fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function (res) { return res.json(); });
}

function renderResetResult(data) {
    var affectedEl = document.getElementById('affected-count');
    var modeEl = document.getElementById('result-mode');
    var listEl = document.getElementById('result-list');

    if (affectedEl) affectedEl.innerText = String(data.affected || 0);
    if (modeEl) modeEl.innerText = data.dryRun ? '預覽' : '正式執行';

    if (!listEl) return;
    if (!data.targets || data.targets.length === 0) {
        listEl.innerHTML = '<div class="result-empty">沒有超過 20 億 total_bet 的帳號</div>';
        return;
    }

    var html = '<div class="result-row result-head"><span>地址</span><span>下注總額</span></div>';
    data.targets.forEach(function (item) {
        var address = String(item.key || '').replace(/^total_bet:/, '');
        html += '<div class="result-row">' +
            '<span title="' + escapeHtml(address) + '">' + escapeHtml(maskAdminAddress(address)) + '</span>' +
            '<span>' + escapeHtml(formatCompactZh(item.value, 2)) + ' DLINK</span>' +
            '</div>';
    });
    listEl.innerHTML = html;
}

function previewReset() {
    setAdminStatus('正在預覽受影響名單...', false);
    withAdminBusy(function () {
        return callAdminApi('reset_total_bets', { dryRun: true }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '預覽失敗');
            renderResetResult(data);
            setAdminStatus('預覽完成，確認後可正式重製', false);
        });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
    });
}

function executeReset() {
    setAdminStatus('正在執行重製...', false);
    withAdminBusy(function () {
        return callAdminApi('reset_total_bets', { dryRun: false }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '重製失敗');
            renderResetResult(data);
            setAdminStatus('重製完成', false);
        });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
    });
}

function renderCustodyUsers() {
    var listEl = document.getElementById('custody-user-list');
    var totalEl = document.getElementById('custody-total-count');
    var visibleEl = document.getElementById('custody-visible-count');
    var filterEl = document.getElementById('custody-filter-input');
    var keyword = String(filterEl && filterEl.value || '').trim().toLowerCase();

    if (totalEl) totalEl.innerText = String(custodyUsers.length);
    if (!listEl) return;

    var filtered = custodyUsers.filter(function (item) {
        if (!keyword) return true;
        return String(item.username || '').toLowerCase().indexOf(keyword) >= 0 ||
            String(item.address || '').toLowerCase().indexOf(keyword) >= 0;
    });

    if (visibleEl) visibleEl.innerText = String(filtered.length);

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="result-empty">沒有符合條件的託管帳號</div>';
        return;
    }

    var html = '<div class="custody-user-row custody-user-head">' +
        '<span>帳號</span>' +
        '<span>地址</span>' +
        '<span>建立或更新時間</span>' +
        '<span>狀態</span>' +
        '<span>重設密碼</span>' +
        '</div>';

    filtered.forEach(function (item) {
        var username = String(item.username || '');
        var passwordInputId = getPasswordInputId(username);
        var statusParts = [];
        if (item.hasPasswordHash) statusParts.push('<span class="state-chip ok">has hash</span>');
        else statusParts.push('<span class="state-chip warn">missing hash</span>');
        if (item.hasPublicKey) statusParts.push('<span class="state-chip ok">has publicKey</span>');
        else statusParts.push('<span class="state-chip warn">missing publicKey</span>');

        html += '<div class="custody-user-row">' +
            '<span class="mono">' + escapeHtml(username) + '</span>' +
            '<span class="mono" title="' + escapeHtml(item.address || '-') + '">' + escapeHtml(maskAdminAddress(item.address || '-')) + '</span>' +
            '<span>' + escapeHtml(formatTime(item.updatedAt || item.createdAt)) + '</span>' +
            '<span class="state-chip-group">' + statusParts.join('') + '</span>' +
            '<span class="custody-action-cell">' +
                '<input id="' + escapeHtml(passwordInputId) + '" class="text-input password-input" type="text" placeholder="輸入新密碼">' +
                '<button class="btn-primary compact-btn" data-username="' + escapeHtml(username) + '" onclick="resetCustodyPassword(this.dataset.username)">重設</button>' +
            '</span>' +
            '</div>';
    });

    listEl.innerHTML = html;
}

function loadCustodyUsers() {
    return callAdminApi('list_custody_users', { limit: 500 }).then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '載入託管帳號失敗');
        custodyUsers = Array.isArray(data.users) ? data.users : [];
        renderCustodyUsers();
        setCustodyStatus('已載入 ' + custodyUsers.length + ' / ' + String(data.total || custodyUsers.length) + ' 個託管帳號', false);
    });
}

function refreshCustodyUsers() {
    setCustodyStatus('正在讀取託管帳號...', false);
    withAdminBusy(function () {
        return loadCustodyUsers();
    }).catch(function (error) {
        setCustodyStatus('錯誤: ' + error.message, true);
    });
}

function resetCustodyPassword(username) {
    var input = document.getElementById(getPasswordInputId(username));
    var newPassword = String(input && input.value || '');
    if (newPassword.length < 6) {
        setCustodyStatus('密碼至少需要 6 個字元', true);
        return;
    }

    setCustodyStatus('正在重設 ' + username + ' 的密碼...', false);
    withAdminBusy(function () {
        return callAdminApi('reset_custody_password', {
            username: username,
            newPassword: newPassword
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '重設密碼失敗');
            if (input) input.value = '';
            setCustodyStatus('已重設 ' + username + ' 的密碼', false);
            return loadCustodyUsers();
        });
    }).catch(function (error) {
        setCustodyStatus('錯誤: ' + error.message, true);
    });
}

function initAdminToolsPage() {
    setAdminStatus('目前管理頁已啟用高額下注重製與託管帳號管理', false);
    refreshCustodyUsers();
}
