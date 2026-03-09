var adminBusyState = {
    ops: false,
    custody: false,
    issue: false,
    announcement: false
};
var custodyUsers = [];
var issueReports = [];
var announcements = [];

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

function setIssueStatus(text, isError) {
    var el = document.getElementById('issue-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9bf1b9';
}

function setAnnouncementAdminStatus(text, isError) {
    var el = document.getElementById('announcement-admin-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9fd0ff';
}

function withAdminBusy(section, task) {
    if (adminBusyState[section]) return Promise.reject(new Error('請稍候，上一筆管理操作仍在處理'));
    adminBusyState[section] = true;
    return task().finally(function () {
        adminBusyState[section] = false;
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

function getIssueUpdateId(reportId) {
    return 'issue-update-' + String(reportId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getIssueStatusId(reportId) {
    return 'issue-status-' + String(reportId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getAnnouncementTitleId(announcementId) {
    return 'announcement-title-' + String(announcementId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getAnnouncementContentId(announcementId) {
    return 'announcement-content-' + String(announcementId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getAnnouncementActiveId(announcementId) {
    return 'announcement-active-' + String(announcementId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getAnnouncementPinnedId(announcementId) {
    return 'announcement-pinned-' + String(announcementId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
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
    withAdminBusy('ops', function () {
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
    withAdminBusy('ops', function () {
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
    withAdminBusy('custody', function () {
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
    withAdminBusy('custody', function () {
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

function renderIssueReports() {
    var listEl = document.getElementById('issue-report-list');
    var totalEl = document.getElementById('issue-total-count');
    var visibleEl = document.getElementById('issue-visible-count');
    var openEl = document.getElementById('issue-open-count');
    var progressEl = document.getElementById('issue-progress-count');
    var filterEl = document.getElementById('issue-filter-input');
    var statusEl = document.getElementById('issue-status-filter');
    var keyword = String(filterEl && filterEl.value || '').trim().toLowerCase();
    var statusFilter = String(statusEl && statusEl.value || '').trim().toLowerCase();

    if (totalEl) totalEl.innerText = String(issueReports.length);
    if (openEl) {
        openEl.innerText = String(issueReports.filter(function (item) { return item.status === 'open'; }).length);
    }
    if (progressEl) {
        progressEl.innerText = String(issueReports.filter(function (item) { return item.status === 'in_progress'; }).length);
    }
    if (!listEl) return;

    var filtered = issueReports.filter(function (item) {
        if (statusFilter && item.status !== statusFilter) return false;
        if (!keyword) return true;
        return [item.title, item.message, item.address, item.displayName, item.category, item.contact, item.adminUpdate]
            .join('\n')
            .toLowerCase()
            .indexOf(keyword) >= 0;
    });

    if (visibleEl) visibleEl.innerText = String(filtered.length);

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="result-empty">沒有符合條件的問題回報</div>';
        return;
    }

    var html = '';
    filtered.forEach(function (item) {
        var reportId = String(item.id || '');
        var updateId = getIssueUpdateId(reportId);
        var statusId = getIssueStatusId(reportId);
        html += '<div class="issue-report-card">' +
            '<div class="issue-report-head">' +
                '<div>' +
                    '<strong>' + escapeHtml(item.title || '未命名問題') + '</strong>' +
                    '<div class="issue-report-meta">' +
                        '<span>' + escapeHtml(item.category || 'general') + '</span>' +
                        '<span>' + escapeHtml(formatTime(item.createdAt)) + '</span>' +
                        '<span class="mono">' + escapeHtml(maskAdminAddress(item.address || '-')) + '</span>' +
                        '<span>' + escapeHtml(item.displayName || '未設定名稱') + '</span>' +
                    '</div>' +
                '</div>' +
                '<span class="state-chip ' + reportStatusClass(item.status) + '">' + reportStatusLabel(item.status) + '</span>' +
            '</div>' +
            '<div class="issue-report-message">' + escapeHtml(item.message || '').replace(/\n/g, '<br>') + '</div>' +
            '<div class="issue-report-extra">' +
                '<span>聯絡方式：' + escapeHtml(item.contact || '未提供') + '</span>' +
                '<span>模式：' + escapeHtml(item.mode || 'live') + '</span>' +
                '<span>版本：' + escapeHtml(item.appVersion || '-') + '</span>' +
            '</div>' +
            '<div class="issue-editor-grid">' +
                '<label>' +
                    '<span>處理狀態</span>' +
                    '<select id="' + escapeHtml(statusId) + '" class="text-input">' +
                        '<option value="open"' + (item.status === 'open' ? ' selected' : '') + '>待處理</option>' +
                        '<option value="in_progress"' + (item.status === 'in_progress' ? ' selected' : '') + '>處理中</option>' +
                        '<option value="resolved"' + (item.status === 'resolved' ? ' selected' : '') + '>已處理</option>' +
                    '</select>' +
                '</label>' +
                '<label class="full-span">' +
                    '<span>最新處理更新</span>' +
                    '<textarea id="' + escapeHtml(updateId) + '" class="text-input issue-update-textarea" placeholder="例如：已確認問題，預計今晚修正">' + escapeHtml(item.adminUpdate || '') + '</textarea>' +
                '</label>' +
            '</div>' +
            '<div class="issue-card-actions">' +
                '<button class="btn-primary compact-btn" data-report-id="' + escapeHtml(reportId) + '" onclick="updateIssueReport(this.dataset.reportId)">儲存更新</button>' +
            '</div>' +
            '</div>';
    });

    listEl.innerHTML = html;
}

function loadIssueReports() {
    return callAdminApi('list_issue_reports', { limit: 200 }).then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '載入問題回報失敗');
        issueReports = Array.isArray(data.reports) ? data.reports : [];
        renderIssueReports();
        setIssueStatus('已載入 ' + issueReports.length + ' 筆問題回報', false);
    });
}

function refreshIssueReports() {
    setIssueStatus('正在讀取問題回報...', false);
    withAdminBusy('issue', function () {
        return loadIssueReports();
    }).catch(function (error) {
        setIssueStatus('錯誤: ' + error.message, true);
    });
}

function updateIssueReport(reportId) {
    var statusEl = document.getElementById(getIssueStatusId(reportId));
    var updateEl = document.getElementById(getIssueUpdateId(reportId));
    var status = String(statusEl && statusEl.value || 'open');
    var adminUpdate = String(updateEl && updateEl.value || '');

    setIssueStatus('正在更新回報狀態...', false);
    withAdminBusy('issue', function () {
        return callAdminApi('update_issue_report', {
            reportId: reportId,
            status: status,
            adminUpdate: adminUpdate
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '更新回報失敗');
            setIssueStatus('已更新回報狀態', false);
            return loadIssueReports();
        });
    }).catch(function (error) {
        setIssueStatus('錯誤: ' + error.message, true);
    });
}

function renderAnnouncements() {
    var listEl = document.getElementById('announcement-admin-list');
    var totalEl = document.getElementById('announcement-total-count');
    var activeEl = document.getElementById('announcement-active-count');
    var pinnedEl = document.getElementById('announcement-pinned-count');
    if (!listEl) return;

    if (totalEl) totalEl.innerText = String(announcements.length);
    if (activeEl) activeEl.innerText = String(announcements.filter(function (item) { return item.isActive; }).length);
    if (pinnedEl) pinnedEl.innerText = String(announcements.filter(function (item) { return item.pinned; }).length);

    if (!announcements.length) {
        listEl.innerHTML = '<div class="result-empty">目前尚未發布任何公告</div>';
        return;
    }

    var html = '';
    announcements.forEach(function (item) {
        var announcementId = String(item.id || '');
        var titleId = getAnnouncementTitleId(announcementId);
        var contentId = getAnnouncementContentId(announcementId);
        var activeId = getAnnouncementActiveId(announcementId);
        var pinnedId = getAnnouncementPinnedId(announcementId);

        html += '<div class="announcement-admin-card">' +
            '<div class="announcement-admin-head">' +
                '<div>' +
                    '<strong>' + escapeHtml(item.title || '未命名公告') + '</strong>' +
                    '<div class="issue-report-meta">' +
                        '<span>' + escapeHtml(formatTime(item.updatedAt || item.createdAt)) + '</span>' +
                        '<span>' + (item.pinned ? '已置頂' : '一般排序') + '</span>' +
                        '<span>' + (item.isActive ? '啟用中' : '已停用') + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="announcement-form-grid">' +
                '<label>' +
                    '<span>標題</span>' +
                    '<input id="' + escapeHtml(titleId) + '" class="text-input" type="text" value="' + escapeHtml(item.title || '') + '">' +
                '</label>' +
                '<label class="toggle-field">' +
                    '<input id="' + escapeHtml(activeId) + '" type="checkbox"' + (item.isActive ? ' checked' : '') + '>' +
                    '<span>啟用公告</span>' +
                '</label>' +
                '<label class="toggle-field">' +
                    '<input id="' + escapeHtml(pinnedId) + '" type="checkbox"' + (item.pinned ? ' checked' : '') + '>' +
                    '<span>置頂公告</span>' +
                '</label>' +
                '<label class="full-span">' +
                    '<span>內容</span>' +
                    '<textarea id="' + escapeHtml(contentId) + '" class="text-input announcement-textarea">' + escapeHtml(item.content || '') + '</textarea>' +
                '</label>' +
            '</div>' +
            '<div class="issue-card-actions">' +
                '<button class="btn-primary compact-btn" data-announcement-id="' + escapeHtml(announcementId) + '" onclick="updateAnnouncement(this.dataset.announcementId)">儲存公告</button>' +
            '</div>' +
            '</div>';
    });

    listEl.innerHTML = html;
}

function loadAnnouncements() {
    return callAdminApi('list_announcements', { limit: 50, activeOnly: false }).then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '載入公告失敗');
        announcements = Array.isArray(data.announcements) ? data.announcements : [];
        renderAnnouncements();
        setAnnouncementAdminStatus('已載入 ' + announcements.length + ' 則公告', false);
    });
}

function refreshAnnouncements() {
    setAnnouncementAdminStatus('正在讀取公告...', false);
    withAdminBusy('announcement', function () {
        return loadAnnouncements();
    }).catch(function (error) {
        setAnnouncementAdminStatus('錯誤: ' + error.message, true);
    });
}

function publishAnnouncement() {
    var titleEl = document.getElementById('announcement-title');
    var contentEl = document.getElementById('announcement-content');
    var pinnedEl = document.getElementById('announcement-pinned');
    var title = String(titleEl && titleEl.value || '');
    var content = String(contentEl && contentEl.value || '');
    var pinned = !!(pinnedEl && pinnedEl.checked);

    setAnnouncementAdminStatus('正在發布公告...', false);
    withAdminBusy('announcement', function () {
        return callAdminApi('publish_announcement', {
            title: title,
            content: content,
            pinned: pinned,
            isActive: true
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '發布公告失敗');
            if (titleEl) titleEl.value = '';
            if (contentEl) contentEl.value = '';
            if (pinnedEl) pinnedEl.checked = false;
            setAnnouncementAdminStatus('公告已發布', false);
            return loadAnnouncements();
        });
    }).catch(function (error) {
        setAnnouncementAdminStatus('錯誤: ' + error.message, true);
    });
}

function updateAnnouncement(announcementId) {
    var titleEl = document.getElementById(getAnnouncementTitleId(announcementId));
    var contentEl = document.getElementById(getAnnouncementContentId(announcementId));
    var activeEl = document.getElementById(getAnnouncementActiveId(announcementId));
    var pinnedEl = document.getElementById(getAnnouncementPinnedId(announcementId));

    setAnnouncementAdminStatus('正在更新公告...', false);
    withAdminBusy('announcement', function () {
        return callAdminApi('update_announcement', {
            announcementId: announcementId,
            title: String(titleEl && titleEl.value || ''),
            content: String(contentEl && contentEl.value || ''),
            isActive: !!(activeEl && activeEl.checked),
            pinned: !!(pinnedEl && pinnedEl.checked)
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '更新公告失敗');
            setAnnouncementAdminStatus('公告已更新', false);
            return loadAnnouncements();
        });
    }).catch(function (error) {
        setAnnouncementAdminStatus('錯誤: ' + error.message, true);
    });
}

function initAdminToolsPage() {
    setAdminStatus('目前管理頁已啟用高額下注重製、託管帳號、問題回報與更新公告管理', false);
    refreshCustodyUsers();
    refreshIssueReports();
    refreshAnnouncements();
}
