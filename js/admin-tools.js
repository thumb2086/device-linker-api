var adminToolsBusy = false;

function setAdminStatus(text, isError) {
    var el = document.getElementById('status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#ffd36a';
}

function withAdminBusy(task) {
    if (adminToolsBusy) return Promise.reject(new Error('請稍候，上一筆操作仍在處理'));
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

function renderResetResult(data) {
    var affectedEl = document.getElementById('affected-count');
    var modeEl = document.getElementById('result-mode');
    var listEl = document.getElementById('result-list');

    if (affectedEl) affectedEl.innerText = String(data.affected || 0);
    if (modeEl) modeEl.innerText = data.dryRun ? '預覽' : '已重製';

    if (!listEl) return;
    if (!data.targets || data.targets.length === 0) {
        listEl.innerHTML = '<div class="result-empty">沒有超過 20 億的累積押注紀錄</div>';
        return;
    }

    var html = '<div class="result-row result-head"><span>地址</span><span>原始累積押注</span></div>';
    data.targets.forEach(function (item) {
        var address = String(item.key || '').replace(/^total_bet:/, '');
        html += '<div class="result-row">' +
            '<span title="' + address + '">' + maskAdminAddress(address) + '</span>' +
            '<span>' + formatCompactZh(item.value, 2) + ' 子熙幣</span>' +
            '</div>';
    });
    listEl.innerHTML = html;
}

function callAdminReset(dryRun) {
    return fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'reset_total_bets',
            sessionId: user.sessionId,
            dryRun: dryRun
        })
    }).then(function (res) { return res.json(); });
}

function previewReset() {
    setAdminStatus('預覽受影響名單中...', false);
    withAdminBusy(function () {
        return callAdminReset(true).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '預覽失敗');
            renderResetResult(data);
            setAdminStatus('預覽完成，請確認名單後再正式重製', false);
        });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
    });
}

function executeReset() {
    setAdminStatus('正式重製中...', false);
    withAdminBusy(function () {
        return callAdminReset(false).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '重製失敗');
            renderResetResult(data);
            setAdminStatus('已完成重製，只有超過 20 億的帳號被歸零', false);
        });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
    });
}

function initAdminToolsPage() {
    setAdminStatus('目前只接受管理錢包登入操作，無需再輸入權杖', false);
}
