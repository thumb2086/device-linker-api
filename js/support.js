var myIssueReports = [];
var currentAnnouncements = [];
var supportBusy = false;

function setSupportStatus(text, isError) {
    var el = document.getElementById('support-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9bf1b9';
}

function setAnnouncementStatus(text, isError) {
    var el = document.getElementById('announcement-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9fd0ff';
}

function withSupportBusy(task) {
    if (supportBusy) return Promise.reject(new Error('請稍候，上一筆操作尚未完成'));
    supportBusy = true;
    return task().finally(function () {
        supportBusy = false;
    });
}

function escapeSupportHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatSupportTime(value) {
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

function reportStatusLabel(status) {
    switch (String(status || 'open')) {
        case 'resolved':
            return '已處理';
        case 'in_progress':
            return '處理中';
        default:
            return '待處理';
    }
}

function reportStatusClass(status) {
    switch (String(status || 'open')) {
        case 'resolved':
            return 'ok';
        case 'in_progress':
            return 'info';
        default:
            return 'warn';
    }
}

function callSupportApi(action, extraPayload) {
    var payload = Object.assign({
        action: action,
        sessionId: user.sessionId
    }, extraPayload || {});

    return fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function (res) { return res.json(); });
}

function renderAnnouncements() {
    var listEl = document.getElementById('announcement-list');
    if (!listEl) return;

    var activeItems = currentAnnouncements.filter(function (item) {
        return item && item.isActive !== false;
    });

    if (activeItems.length === 0) {
        listEl.innerHTML = '<div class="result-empty">目前沒有有效公告</div>';
        return;
    }

    var html = '';
    activeItems.forEach(function (item) {
        html += '<div class="announcement-card">' +
            '<div class="announcement-head">' +
                '<strong>' + escapeSupportHtml(item.title) + '</strong>' +
                '<span>' + escapeSupportHtml(formatSupportTime(item.updatedAt || item.createdAt)) + '</span>' +
            '</div>' +
            '<div class="announcement-content">' + escapeSupportHtml(item.content).replace(/\n/g, '<br>') + '</div>' +
            '</div>';
    });

    listEl.innerHTML = html;
}

function renderMyReports() {
    var listEl = document.getElementById('my-report-list');
    if (!listEl) return;

    if (!myIssueReports.length) {
        listEl.innerHTML = '<div class="result-empty">目前尚未提交任何回報</div>';
        return;
    }

    var html = '';
    myIssueReports.forEach(function (item) {
        html += '<div class="report-card">' +
            '<div class="report-card-head">' +
                '<div>' +
                    '<strong>' + escapeSupportHtml(item.title) + '</strong>' +
                    '<div class="report-meta">' + escapeSupportHtml(item.category || 'general') + ' ・ ' + escapeSupportHtml(formatSupportTime(item.createdAt)) + '</div>' +
                '</div>' +
                '<span class="state-chip ' + reportStatusClass(item.status) + '">' + reportStatusLabel(item.status) + '</span>' +
            '</div>' +
            '<div class="report-body">' + escapeSupportHtml(item.message).replace(/\n/g, '<br>') + '</div>' +
            '<div class="report-update-block">' +
                '<span>最新處理更新</span>' +
                '<p>' + (item.adminUpdate ? escapeSupportHtml(item.adminUpdate).replace(/\n/g, '<br>') : '管理員尚未更新處理內容') + '</p>' +
            '</div>' +
            '</div>';
    });

    listEl.innerHTML = html;
}

function loadAnnouncements() {
    return callSupportApi('get_announcements', {
        activeOnly: true,
        limit: 20
    }).then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '載入公告失敗');
        currentAnnouncements = Array.isArray(data.announcements) ? data.announcements : [];
        renderAnnouncements();
        setAnnouncementStatus('已載入 ' + currentAnnouncements.length + ' 則有效公告', false);
    });
}

function loadMyReports() {
    return callSupportApi('list_my_issue_reports', { limit: 50 }).then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '載入回報紀錄失敗');
        myIssueReports = Array.isArray(data.reports) ? data.reports : [];
        renderMyReports();
    });
}

function refreshSupportPage() {
    setAnnouncementStatus('正在讀取公告...', false);
    setSupportStatus('正在同步回報紀錄...', false);
    withSupportBusy(function () {
        return Promise.all([loadAnnouncements(), loadMyReports()]).then(function () {
            setSupportStatus('同步完成', false);
        });
    }).catch(function (error) {
        setSupportStatus('錯誤: ' + error.message, true);
        setAnnouncementStatus('錯誤: ' + error.message, true);
    });
}

function submitIssueReport() {
    var categoryEl = document.getElementById('report-category');
    var titleEl = document.getElementById('report-title');
    var messageEl = document.getElementById('report-message');
    var contactEl = document.getElementById('report-contact');
    var pageEl = document.getElementById('report-page-url');

    var payload = {
        category: categoryEl ? categoryEl.value : 'general',
        title: titleEl ? titleEl.value : '',
        message: messageEl ? messageEl.value : '',
        contact: contactEl ? contactEl.value : '',
        pageUrl: pageEl ? pageEl.value : window.location.href,
        userAgent: navigator.userAgent || ''
    };

    setSupportStatus('正在送出問題回報...', false);
    withSupportBusy(function () {
        return callSupportApi('submit_issue_report', payload).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '送出回報失敗');
            if (titleEl) titleEl.value = '';
            if (messageEl) messageEl.value = '';
            if (contactEl) contactEl.value = '';
            setSupportStatus('問題回報已送出，管理員可在後台查看', false);
            return loadMyReports();
        });
    }).catch(function (error) {
        setSupportStatus('錯誤: ' + error.message, true);
    });
}

function initSupportPage() {
    var pageEl = document.getElementById('report-page-url');
    if (pageEl) pageEl.value = window.location.href;
    setAnnouncementStatus('正在讀取公告...', false);
    setSupportStatus('目前可提交問題回報，並查看最新處理進度', false);
    refreshSupportPage();
}
