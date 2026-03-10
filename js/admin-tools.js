var adminBusyState = {
    ops: false,
    custody: false,
    issue: false,
    announcement: false,
    reward: false,
    txHealth: false
};
var custodyUsers = [];
var issueReports = [];
var announcements = [];
var rewardCatalog = null;
var rewardCampaigns = [];
var rewardGrantLogs = [];
var custodyLoaded = false;
var custodyExpanded = false;
var announcementsLoaded = false;
var announcementsExpanded = false;
var rewardLoaded = false;
var rewardExpanded = false;
var txHealthLoaded = false;
var txHealthExpanded = false;
var txHealthSourcesExpanded = false;
var issueLoaded = false;
var issueExpanded = false;
var opsExpanded = false;
var adminToastTimerSeq = 0;

function showAdminToast(text, isError) {
    var stackEl = document.getElementById('admin-toast-stack');
    if (!stackEl || !text) return;

    adminToastTimerSeq += 1;
    var toastEl = document.createElement('div');
    toastEl.className = 'admin-toast ' + (isError ? 'error' : 'success');
    toastEl.innerHTML =
        '<strong class="admin-toast-title">' + (isError ? '操作失敗' : '操作成功') + '</strong>' +
        '<div class="admin-toast-copy">' + escapeHtml(text) + '</div>';
    stackEl.appendChild(toastEl);

    requestAnimationFrame(function () {
        toastEl.classList.add('visible');
    });

    window.setTimeout(function () {
        toastEl.classList.remove('visible');
        window.setTimeout(function () {
            if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
        }, 220);
    }, isError ? 4200 : 2600);
}

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

function setRewardAdminStatus(text, isError) {
    var el = document.getElementById('reward-admin-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9bf1b9';
}

function setTxHealthStatus(text, isError) {
    var el = document.getElementById('tx-health-status-msg');
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

function toDateTimeLocalValue(value) {
    if (!value) return '';
    var date = new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) {
        return String(value || '').slice(0, 16);
    }
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + 'T' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes());
}

function getIsoDateTimeValue(inputId) {
    var el = document.getElementById(inputId);
    var raw = String(el && el.value || '').trim();
    if (!raw) return '';
    var date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return raw;
    return date.toISOString();
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

function getCampaignFieldId(campaignId, field) {
    return 'campaign-' + String(field || '').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + String(campaignId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getRewardTitleFieldId(titleId, field) {
    return 'reward-title-' + String(field || '').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + String(titleId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
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

function callRewardsAdminApi(action, extraPayload) {
    var payload = Object.assign({
        action: action,
        sessionId: user.sessionId
    }, extraPayload || {});

    return fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function (res) { return res.json(); });
}

function renderTxHealthDashboard(dashboard) {
    var data = dashboard || {};
    var totalEl = document.getElementById('tx-health-total');
    var successRateEl = document.getElementById('tx-health-success-rate');
    var failureRateEl = document.getElementById('tx-health-failure-rate');
    var successCountEl = document.getElementById('tx-health-success-count');
    var failureCountEl = document.getElementById('tx-health-failure-count');
    var windowEl = document.getElementById('tx-health-window');
    var topErrorsEl = document.getElementById('tx-health-top-errors');
    var recentListEl = document.getElementById('tx-health-recent-list');
    var sourceGroupsEl = document.getElementById('tx-health-source-groups');

    if (totalEl) totalEl.innerText = String(data.totalCount || 0);
    if (successRateEl) successRateEl.innerText = String((Number(data.successRate || 0)).toFixed(2)) + '%';
    if (failureRateEl) failureRateEl.innerText = String((Number(data.failureRate || 0)).toFixed(2)) + '%';
    if (successCountEl) successCountEl.innerText = String(data.successCount || 0);
    if (failureCountEl) failureCountEl.innerText = String(data.failureCount || 0);
    if (windowEl) windowEl.innerText = String(data.hours || 24) + 'h';

    if (topErrorsEl) {
        if (!data.topErrors || !data.topErrors.length) {
            topErrorsEl.innerHTML = '<div class="result-empty">目前沒有失敗錯誤統計</div>';
        } else {
            topErrorsEl.innerHTML = data.topErrors.map(function (item) {
                return '<div class="announcement-admin-card">' +
                    '<div class="announcement-admin-head">' +
                        '<strong>' + escapeHtml(item.message || '未知錯誤') + '</strong>' +
                        '<span class="state-chip warn">' + escapeHtml(String(item.count || 0)) + ' 次</span>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }
    }

    if (sourceGroupsEl) {
        if (!data.sourceGroups || !data.sourceGroups.length) {
            sourceGroupsEl.innerHTML = '<div class="result-empty">目前沒有來源分類資料</div>';
        } else {
            sourceGroupsEl.innerHTML = data.sourceGroups.map(function (item) {
                return '<div class="announcement-admin-card">' +
                    '<div class="announcement-admin-head">' +
                        '<div>' +
                            '<strong>' + escapeHtml(item.source || 'unknown') + '</strong>' +
                            '<div class="issue-report-meta">' +
                                '<span>總數 ' + escapeHtml(String(item.totalCount || 0)) + '</span>' +
                                '<span>成功 ' + escapeHtml(String(item.successCount || 0)) + '</span>' +
                                '<span>失敗 ' + escapeHtml(String(item.failureCount || 0)) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<span class="state-chip ' + (Number(item.failureCount || 0) > 0 ? 'warn' : 'ok') + '">' + escapeHtml(String(Number(item.failureRate || 0).toFixed(2))) + '% 失敗率</span>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }
    }

    if (recentListEl) {
        if (!data.recent || !data.recent.length) {
            recentListEl.innerHTML = '<div class="result-empty">目前沒有近期交易紀錄</div>';
        } else {
            recentListEl.innerHTML = data.recent.map(function (item) {
                var statusLabel = item.status === 'success' ? '成功' : '失敗';
                var detail = item.status === 'success'
                    ? ('txHash: ' + (item.txHash || '-'))
                    : (item.error || '未知錯誤');
                return '<div class="announcement-admin-card">' +
                    '<div class="announcement-admin-head">' +
                        '<div>' +
                            '<strong>' + escapeHtml(item.method || item.kind || 'unknown') + '</strong>' +
                            '<div class="issue-report-meta">' +
                                '<span>' + escapeHtml(formatTime(item.createdAt)) + '</span>' +
                                '<span>' + escapeHtml(item.kind || 'unknown') + '</span>' +
                                '<span>attempt ' + escapeHtml(String(item.attempts || 1)) + '</span>' +
                                (item.nonce ? ('<span>nonce ' + escapeHtml(String(item.nonce)) + '</span>') : '') +
                            '</div>' +
                        '</div>' +
                        '<span class="state-chip ' + (item.status === 'failure' ? 'warn' : 'ok') + '">' + escapeHtml(statusLabel) + '</span>' +
                    '</div>' +
                    '<div class="tx-health-detail mono">' + escapeHtml(detail) + '</div>' +
                    '</div>';
            }).join('');
        }
    }
}

function refreshTxHealthDashboard() {
    setTxHealthStatus('同步交易看板中...', false);
    withAdminBusy('txHealth', function () {
        return callAdminApi('get_tx_health_dashboard', {
            hours: String((document.getElementById('tx-health-hours') || {}).value || '24'),
            limit: 25
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '載入交易看板失敗');
            renderTxHealthDashboard(data.dashboard || {});
            txHealthLoaded = true;
            if (data.dashboard && data.dashboard.truncated) {
                setTxHealthStatus('交易看板已更新（部分資料）', false);
            } else {
                setTxHealthStatus('交易看板已更新', false);
            }
        });
    }).catch(function (error) {
        setTxHealthStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function toggleTxHealthSection() {
    var body = document.getElementById('tx-health-section-body');
    var btn = document.getElementById('tx-health-toggle-btn');
    if (!body || !btn) return;

    txHealthExpanded = !txHealthExpanded;
    body.classList.toggle('hidden', !txHealthExpanded);
    btn.innerText = txHealthExpanded ? '收合交易看板' : '展開交易看板';

    if (txHealthExpanded && !txHealthLoaded) {
        refreshTxHealthDashboard();
    }
}

function toggleTxHealthSources() {
    var body = document.getElementById('tx-health-source-body');
    var btn = document.getElementById('tx-health-source-toggle-btn');
    if (!body || !btn) return;

    txHealthSourcesExpanded = !txHealthSourcesExpanded;
    body.classList.toggle('hidden', !txHealthSourcesExpanded);
    btn.innerText = txHealthSourcesExpanded ? '收合來源分類' : '展開來源分類';
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
            showAdminToast('預覽完成，已更新受影響名單', false);
        });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function executeReset() {
    setAdminStatus('正在執行重製...', false);
    withAdminBusy('ops', function () {
        return callAdminApi('reset_total_bets', { dryRun: false }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '重製失敗');
            renderResetResult(data);
            setAdminStatus('重製完成', false);
            showAdminToast('高額下注帳號重製完成', false);
        });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
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
        return loadCustodyUsers().then(function () {
            custodyLoaded = true;
        });
    }).catch(function (error) {
        setCustodyStatus('錯誤: ' + error.message, true);
    });
}

function toggleCustodySection() {
    var body = document.getElementById('custody-section-body');
    var btn = document.getElementById('custody-toggle-btn');
    if (!body || !btn) return;

    custodyExpanded = !custodyExpanded;
    body.classList.toggle('hidden', !custodyExpanded);
    btn.innerText = custodyExpanded ? '收合託管帳號' : '展開託管帳號';

    if (custodyExpanded && !custodyLoaded) {
        refreshCustodyUsers();
    }
}

function resetCustodyPassword(username) {
    var input = document.getElementById(getPasswordInputId(username));
    var newPassword = String(input && input.value || '');
    if (newPassword.length < 6) {
        setCustodyStatus('密碼至少需要 6 個字元', true);
        showAdminToast('密碼至少需要 6 個字元', true);
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
            showAdminToast('已重設 ' + username + ' 的密碼', false);
            return loadCustodyUsers();
        });
    }).catch(function (error) {
        setCustodyStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
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
        return loadIssueReports().then(function () {
            issueLoaded = true;
        });
    }).catch(function (error) {
        setIssueStatus('錯誤: ' + error.message, true);
    });
}

function toggleIssueSection() {
    var body = document.getElementById('issues-section-body');
    var btn = document.getElementById('issue-toggle-btn');
    if (!body || !btn) return;

    issueExpanded = !issueExpanded;
    body.classList.toggle('hidden', !issueExpanded);
    btn.innerText = issueExpanded ? '收合問題回報' : '展開問題回報';

    if (issueExpanded && !issueLoaded) {
        refreshIssueReports();
    }
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
            showAdminToast('問題回報狀態已更新', false);
            return loadIssueReports();
        });
    }).catch(function (error) {
        setIssueStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
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
        return loadAnnouncements().then(function () {
            announcementsLoaded = true;
        });
    }).catch(function (error) {
        setAnnouncementAdminStatus('錯誤: ' + error.message, true);
    });
}

function toggleAnnouncementSection() {
    var body = document.getElementById('announcements-section-body');
    var btn = document.getElementById('announcement-toggle-btn');
    if (!body || !btn) return;

    announcementsExpanded = !announcementsExpanded;
    body.classList.toggle('hidden', !announcementsExpanded);
    btn.innerText = announcementsExpanded ? '收合公告中心' : '展開公告中心';

    if (announcementsExpanded && !announcementsLoaded) {
        refreshAnnouncements();
    }
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
            showAdminToast('公告已發布', false);
            return loadAnnouncements();
        });
    }).catch(function (error) {
        setAnnouncementAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
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
            showAdminToast('公告已更新', false);
            return loadAnnouncements();
        });
    }).catch(function (error) {
        setAnnouncementAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function summarizeRewardBundle(bundle) {
    var parts = [];
    if (bundle && Array.isArray(bundle.items)) {
        bundle.items.forEach(function (item) {
            parts.push(String(item.id || '-') + ' x' + String(item.qty || 1));
        });
    }
    if (bundle && Array.isArray(bundle.avatars)) {
        bundle.avatars.forEach(function (avatarId) {
            parts.push(String(avatarId || ''));
        });
    }
    if (bundle && Array.isArray(bundle.titles)) {
        bundle.titles.forEach(function (title) {
            var titleId = typeof title === 'string' ? title : String(title && title.id || '');
            var expiresAt = typeof title === 'object' && title ? String(title.expiresAt || '') : '';
            parts.push(titleId + (expiresAt ? '（至 ' + formatTime(expiresAt) + '）' : '（永久）'));
        });
    }
    if (bundle && bundle.tokens) {
        parts.push(formatCompactZh(bundle.tokens, 2) + ' 子熙幣');
    }
    return parts.join(' / ') || '未設定';
}

function buildRewardSelectOptionsHtml(items, emptyLabel, selectedValue) {
    var html = '<option value="">' + escapeHtml(emptyLabel || '不選擇') + '</option>';
    (items || []).forEach(function (item) {
        var isSelected = String(item.id || '') === String(selectedValue || '');
        html += '<option value="' + escapeHtml(item.id) + '"' + (isSelected ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>';
    });
    return html;
}

function buildVipSelectOptionsHtml(items, selectedValue) {
    var html = '<option value="">不限 VIP</option>';
    (items || []).forEach(function (item) {
        var value = String(item && item.label || '');
        if (!value || value === '普通會員') return;
        html += '<option value="' + escapeHtml(value) + '"' + (value === String(selectedValue || '') ? ' selected' : '') + '>' + escapeHtml(value) + '</option>';
    });
    return html;
}

function buildSimpleSelectOptionsHtml(items, selectedValue) {
    return (items || []).map(function (item) {
        var value = String(item && item.value || '');
        var label = String(item && item.label || value);
        return '<option value="' + escapeHtml(value) + '"' + (value === String(selectedValue || '') ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }).join('');
}

function getRewardTitleCategoryOptions() {
    return [
        { value: 'featured', label: '精選' },
        { value: 'achievement', label: '成就' },
        { value: 'event', label: '活動' },
        { value: 'vip', label: 'VIP' },
        { value: 'special', label: '特別' }
    ];
}

function renderRewardSelectOptions(selectId, items, emptyLabel) {
    var el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = buildRewardSelectOptionsHtml(items, emptyLabel, '');
}

function getPrimaryRewardItem(bundle) {
    if (!bundle || !Array.isArray(bundle.items) || !bundle.items.length) return null;
    return bundle.items[0];
}

function getPrimaryRewardAvatar(bundle) {
    if (!bundle || !Array.isArray(bundle.avatars) || !bundle.avatars.length) return '';
    return String(bundle.avatars[0] || '');
}

function getPrimaryRewardTitle(bundle) {
    if (!bundle || !Array.isArray(bundle.titles) || !bundle.titles.length) return null;
    var first = bundle.titles[0];
    if (typeof first === 'string') {
        return { id: first, expiresAt: '' };
    }
    return {
        id: String(first && first.id || ''),
        expiresAt: String(first && first.expiresAt || '')
    };
}

function renderRewardAdminSelects() {
    if (!rewardCatalog) return;
    var titleCountEl = document.getElementById('reward-title-count');
    renderRewardSelectOptions('reward-grant-item', rewardCatalog.shopItems, '不發道具');
    renderRewardSelectOptions('reward-grant-avatar', rewardCatalog.avatars, '不發頭像');
    renderRewardSelectOptions('reward-grant-title', rewardCatalog.titles, '不發稱號');
    renderRewardSelectOptions('campaign-item', rewardCatalog.shopItems, '不發道具');
    renderRewardSelectOptions('campaign-avatar', rewardCatalog.avatars, '不發頭像');
    renderRewardSelectOptions('campaign-title-id', rewardCatalog.titles, '不發稱號');
    if (titleCountEl) titleCountEl.innerText = String((rewardCatalog.titles || []).length);
    var vipEl = document.getElementById('campaign-min-vip');
    if (vipEl) {
        vipEl.innerHTML = buildVipSelectOptionsHtml(rewardCatalog.vipLevels, '');
    }
    var titleRarityEl = document.getElementById('reward-title-rarity');
    if (titleRarityEl) {
        titleRarityEl.innerHTML = buildSimpleSelectOptionsHtml([
            { value: 'rare', label: '稀有' },
            { value: 'epic', label: '史詩' },
            { value: 'mythic', label: '神話' },
            { value: 'legendary', label: '傳奇' }
        ], 'epic');
    }
    var titleSourceEl = document.getElementById('reward-title-source');
    if (titleSourceEl) {
        titleSourceEl.innerHTML = buildSimpleSelectOptionsHtml([
            { value: 'admin', label: '管理員' },
            { value: 'campaign', label: '活動' },
            { value: 'system', label: '系統' },
            { value: 'shop', label: '商店' }
        ], 'admin');
    }
    var titleCategoryEl = document.getElementById('reward-title-category');
    if (titleCategoryEl) {
        titleCategoryEl.innerHTML = buildSimpleSelectOptionsHtml(getRewardTitleCategoryOptions(), 'featured');
    }
    var existingTitleCategoryEl = document.getElementById('reward-existing-title-category');
    if (existingTitleCategoryEl) {
        existingTitleCategoryEl.innerHTML = buildSimpleSelectOptionsHtml(getRewardTitleCategoryOptions(), 'featured');
    }
    var existingTitleSelectEl = document.getElementById('reward-existing-title-id');
    if (existingTitleSelectEl) {
        existingTitleSelectEl.innerHTML = buildRewardSelectOptionsHtml(rewardCatalog && rewardCatalog.titles, '選擇既有稱號', '');
    }
}

function getRewardCatalogTitle(titleId) {
    var titles = rewardCatalog && Array.isArray(rewardCatalog.titles) ? rewardCatalog.titles : [];
    for (var i = 0; i < titles.length; i += 1) {
        if (String(titles[i] && titles[i].id || '') === String(titleId || '')) return titles[i];
    }
    return null;
}

function renderRewardTitlePricing() {
    var listEl = document.getElementById('reward-title-pricing-list');
    if (!listEl) return;
    var titles = rewardCatalog && Array.isArray(rewardCatalog.titles) ? rewardCatalog.titles.slice() : [];
    titles.sort(function (left, right) {
        return String(left && left.name || '').localeCompare(String(right && right.name || ''), 'zh-Hant');
    });

    if (!titles.length) {
        listEl.innerHTML = '<div class="result-empty">尚未有可設定的稱號</div>';
        return;
    }

    listEl.innerHTML = titles.map(function (title) {
        var enabledId = getRewardTitleFieldId(title.id, 'shop_enabled');
        var priceId = getRewardTitleFieldId(title.id, 'shop_price');
        var categoryId = getRewardTitleFieldId(title.id, 'shop_category');
        var priorityId = getRewardTitleFieldId(title.id, 'shop_priority');
        var salePriceId = getRewardTitleFieldId(title.id, 'sale_price');
        var saleStartId = getRewardTitleFieldId(title.id, 'sale_start');
        var saleEndId = getRewardTitleFieldId(title.id, 'sale_end');
        var descId = getRewardTitleFieldId(title.id, 'shop_desc');
        return '<div class="announcement-admin-card">' +
            '<div class="announcement-admin-head">' +
                '<div>' +
                    '<strong>' + escapeHtml(title.name || title.id || '未命名稱號') + '</strong>' +
                    '<div class="issue-report-meta reward-title-meta">' +
                        '<span>ID：' + escapeHtml(title.id || '-') + '</span>' +
                        '<span>' + escapeHtml(title.source || 'admin') + '</span>' +
                        '<span>' + escapeHtml(title.rarity || 'epic') + '</span>' +
                        '<span>' + escapeHtml(title.showOnLeaderboard ? '排行榜顯示' : '僅個人頁顯示') + '</span>' +
                        '<span>分類：' + escapeHtml(title.shopCategory || 'featured') + '</span>' +
                        '<span>排序：' + escapeHtml(String(title.shopPriority || 0)) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="announcement-form-grid">' +
                '<label><span>稱號售價</span><input id="' + escapeHtml(priceId) + '" class="text-input" type="number" min="0" step="1" value="' + escapeHtml(String(title.shopPrice || 0)) + '"></label>' +
                '<label><span>商店分類</span><select id="' + escapeHtml(categoryId) + '" class="text-input">' + buildSimpleSelectOptionsHtml(getRewardTitleCategoryOptions(), title.shopCategory || 'featured') + '</select></label>' +
                '<label><span>商店排序</span><input id="' + escapeHtml(priorityId) + '" class="text-input" type="number" min="0" step="1" value="' + escapeHtml(String(title.shopPriority || 0)) + '"></label>' +
                '<label class="toggle-field"><input id="' + escapeHtml(enabledId) + '" type="checkbox"' + (title.shopEnabled ? ' checked' : '') + '><span>上架到稱號商店</span></label>' +
                '<label><span>限時折扣價</span><input id="' + escapeHtml(salePriceId) + '" class="text-input" type="number" min="0" step="1" value="' + escapeHtml(String(title.salePrice || 0)) + '"></label>' +
                '<label><span>折扣開始時間</span><input id="' + escapeHtml(saleStartId) + '" class="text-input" type="datetime-local" value="' + escapeHtml(toDateTimeLocalValue(title.saleStartAt || '')) + '"></label>' +
                '<label><span>折扣結束時間</span><input id="' + escapeHtml(saleEndId) + '" class="text-input" type="datetime-local" value="' + escapeHtml(toDateTimeLocalValue(title.saleEndAt || '')) + '"></label>' +
                '<label class="full-span"><span>商店說明</span><textarea id="' + escapeHtml(descId) + '" class="text-input announcement-textarea" placeholder="玩家在稱號商店看到的說明">' + escapeHtml(title.shopDescription || '') + '</textarea></label>' +
            '</div>' +
            '<div class="issue-card-actions">' +
                '<button class="btn-primary compact-btn" data-title-id="' + escapeHtml(title.id) + '" onclick="saveRewardTitlePricing(this.dataset.titleId)">儲存定價</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function loadExistingRewardTitleForSale(titleId) {
    var title = getRewardCatalogTitle(titleId);
    if (!title) return;
    var priceEl = document.getElementById('reward-existing-title-price');
    var categoryEl = document.getElementById('reward-existing-title-category');
    var priorityEl = document.getElementById('reward-existing-title-priority');
    var enabledEl = document.getElementById('reward-existing-title-shop-enabled');
    var salePriceEl = document.getElementById('reward-existing-title-sale-price');
    var saleStartEl = document.getElementById('reward-existing-title-sale-start-at');
    var saleEndEl = document.getElementById('reward-existing-title-sale-end-at');
    var descEl = document.getElementById('reward-existing-title-shop-description');
    if (priceEl) priceEl.value = String(title.shopPrice || 0);
    if (categoryEl) categoryEl.value = String(title.shopCategory || 'featured');
    if (priorityEl) priorityEl.value = String(title.shopPriority || 0);
    if (enabledEl) enabledEl.checked = !!title.shopEnabled;
    if (salePriceEl) salePriceEl.value = String(title.salePrice || 0);
    if (saleStartEl) saleStartEl.value = toDateTimeLocalValue(title.saleStartAt || '');
    if (saleEndEl) saleEndEl.value = toDateTimeLocalValue(title.saleEndAt || '');
    if (descEl) descEl.value = String(title.shopDescription || '');
}

function renderRewardCampaigns() {
    var listEl = document.getElementById('reward-campaign-list');
    var countEl = document.getElementById('reward-campaign-count');
    if (countEl) countEl.innerText = String(rewardCampaigns.length);
    if (!listEl) return;

    if (!rewardCampaigns.length) {
        listEl.innerHTML = '<div class="result-empty">目前沒有活動</div>';
        return;
    }

    var html = '';
    rewardCampaigns.forEach(function (item) {
        var titleId = getCampaignFieldId(item.id, 'title');
        var descId = getCampaignFieldId(item.id, 'description');
        var startId = getCampaignFieldId(item.id, 'start');
        var endId = getCampaignFieldId(item.id, 'end');
        var activeId = getCampaignFieldId(item.id, 'active');
        var claimLimitId = getCampaignFieldId(item.id, 'claim_limit');
        var minVipId = getCampaignFieldId(item.id, 'min_vip');
        var itemId = getCampaignFieldId(item.id, 'item');
        var itemQtyId = getCampaignFieldId(item.id, 'item_qty');
        var avatarId = getCampaignFieldId(item.id, 'avatar');
        var rewardTitleId = getCampaignFieldId(item.id, 'reward_title');
        var titleExpiresId = getCampaignFieldId(item.id, 'title_expires_at');
        var tokenAmountId = getCampaignFieldId(item.id, 'token_amount');
        var rewardItem = getPrimaryRewardItem(item.rewards);
        var rewardAvatar = getPrimaryRewardAvatar(item.rewards);
        var rewardTitle = getPrimaryRewardTitle(item.rewards);
        html += '<div class="announcement-admin-card">' +
            '<div class="announcement-admin-head">' +
                '<div>' +
                    '<strong>' + escapeHtml(item.title || '未命名活動') + '</strong>' +
                    '<div class="issue-report-meta">' +
                        '<span>' + escapeHtml(item.isActive ? '啟用中' : '已停用') + '</span>' +
                        '<span>每人可領 ' + escapeHtml(String(item.claimLimitPerUser || 1)) + ' 次</span>' +
                        '<span>' + escapeHtml(summarizeRewardBundle(item.rewards)) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="announcement-form-grid">' +
                '<label><span>標題</span><input id="' + escapeHtml(titleId) + '" class="text-input" type="text" value="' + escapeHtml(item.title || '') + '"></label>' +
                '<label><span>每人可領次數</span><input id="' + escapeHtml(claimLimitId) + '" class="text-input" type="number" min="1" step="1" value="' + escapeHtml(String(item.claimLimitPerUser || 1)) + '"></label>' +
                '<label><span>開始時間</span><input id="' + escapeHtml(startId) + '" class="text-input" type="datetime-local" value="' + escapeHtml(toDateTimeLocalValue(item.startAt || '')) + '"></label>' +
                '<label><span>結束時間</span><input id="' + escapeHtml(endId) + '" class="text-input" type="datetime-local" value="' + escapeHtml(toDateTimeLocalValue(item.endAt || '')) + '"></label>' +
                '<label><span>最低 VIP</span><select id="' + escapeHtml(minVipId) + '" class="text-input">' + buildVipSelectOptionsHtml(rewardCatalog && rewardCatalog.vipLevels, item.minVipLevel || '') + '</select></label>' +
                '<label class="toggle-field"><input id="' + escapeHtml(activeId) + '" type="checkbox"' + (item.isActive ? ' checked' : '') + '><span>啟用活動</span></label>' +
                '<label class="full-span"><span>描述</span><textarea id="' + escapeHtml(descId) + '" class="text-input announcement-textarea">' + escapeHtml(item.description || '') + '</textarea></label>' +
                '<label><span>活動道具</span><select id="' + escapeHtml(itemId) + '" class="text-input">' + buildRewardSelectOptionsHtml(rewardCatalog && rewardCatalog.shopItems, '不發道具', rewardItem && rewardItem.id) + '</select></label>' +
                '<label><span>道具數量</span><input id="' + escapeHtml(itemQtyId) + '" class="text-input" type="number" min="1" step="1" value="' + escapeHtml(String(rewardItem && rewardItem.qty || 1)) + '"></label>' +
                '<label><span>活動頭像</span><select id="' + escapeHtml(avatarId) + '" class="text-input">' + buildRewardSelectOptionsHtml(rewardCatalog && rewardCatalog.avatars, '不發頭像', rewardAvatar) + '</select></label>' +
                '<label><span>活動稱號</span><select id="' + escapeHtml(rewardTitleId) + '" class="text-input">' + buildRewardSelectOptionsHtml(rewardCatalog && rewardCatalog.titles, '不發稱號', rewardTitle && rewardTitle.id) + '</select></label>' +
                '<label><span>稱號到期時間</span><input id="' + escapeHtml(titleExpiresId) + '" class="text-input" type="datetime-local" value="' + escapeHtml(toDateTimeLocalValue(rewardTitle && rewardTitle.expiresAt || '')) + '"></label>' +
                '<label><span>額外子熙幣</span><input id="' + escapeHtml(tokenAmountId) + '" class="text-input" type="number" min="0" step="1" value="' + escapeHtml(String(item.rewards && item.rewards.tokens || 0)) + '"></label>' +
            '</div>' +
            '<div class="issue-card-actions">' +
                '<button class="btn-primary compact-btn" data-campaign-id="' + escapeHtml(item.id) + '" onclick="saveRewardCampaign(this.dataset.campaignId)">儲存活動</button>' +
            '</div>' +
            '</div>';
    });
    listEl.innerHTML = html;
}

function renderRewardGrantLogs() {
    var listEl = document.getElementById('reward-grant-log-list');
    var countEl = document.getElementById('reward-grant-count');
    if (countEl) countEl.innerText = String(rewardGrantLogs.length);
    if (!listEl) return;

    if (!rewardGrantLogs.length) {
        listEl.innerHTML = '<div class="result-empty">尚未有發放紀錄</div>';
        return;
    }

    var html = '<div class="result-row result-head"><span>時間</span><span>地址</span><span>內容</span></div>';
    rewardGrantLogs.forEach(function (item) {
        html += '<div class="result-row">' +
            '<span>' + escapeHtml(formatTime(item.createdAt)) + '</span>' +
            '<span class="mono" title="' + escapeHtml(item.address || '-') + '">' + escapeHtml(maskAdminAddress(item.address || '-')) + '</span>' +
            '<span>' + escapeHtml(summarizeRewardBundle(item.bundle)) + '</span>' +
            '</div>';
    });
    listEl.innerHTML = html;
}

function loadRewardAdmin() {
    return Promise.all([
        callRewardsAdminApi('summary'),
        callRewardsAdminApi('admin_list_campaigns'),
        callRewardsAdminApi('admin_list_grant_logs', { limit: 20 })
    ]).then(function (results) {
        var summaryData = results[0];
        var campaignData = results[1];
        var logData = results[2];
        if (!summaryData || !summaryData.success) throw new Error((summaryData && summaryData.error) || '載入獎勵目錄失敗');
        if (!campaignData || !campaignData.success) throw new Error((campaignData && campaignData.error) || '載入活動失敗');
        if (!logData || !logData.success) throw new Error((logData && logData.error) || '載入發放紀錄失敗');
        rewardCatalog = summaryData.catalog || null;
        rewardCampaigns = Array.isArray(campaignData.campaigns) ? campaignData.campaigns : [];
        rewardGrantLogs = Array.isArray(logData.logs) ? logData.logs : [];
        renderRewardAdminSelects();
        renderRewardTitlePricing();
        renderRewardCampaigns();
        renderRewardGrantLogs();
        var existingTitleSelectEl = document.getElementById('reward-existing-title-id');
        if (existingTitleSelectEl) {
            if (!existingTitleSelectEl.value && existingTitleSelectEl.options.length > 1) {
                existingTitleSelectEl.value = existingTitleSelectEl.options[1].value;
            }
            loadExistingRewardTitleForSale(existingTitleSelectEl.value);
        }
        setRewardAdminStatus('稱號與活動資料已同步', false);
    });
}

function refreshRewardAdmin() {
    setRewardAdminStatus('同步稱號與活動資料中...', false);
    withAdminBusy('reward', function () {
        return loadRewardAdmin().then(function () {
            rewardLoaded = true;
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
    });
}

function toggleRewardSection() {
    var body = document.getElementById('rewards-section-body');
    var btn = document.getElementById('reward-toggle-btn');
    if (!body || !btn) return;

    rewardExpanded = !rewardExpanded;
    body.classList.toggle('hidden', !rewardExpanded);
    btn.innerText = rewardExpanded ? '收合稱號活動管理' : '展開稱號活動管理';

    if (rewardExpanded && !rewardLoaded) {
        refreshRewardAdmin();
    }
}

function grantRewardBundleAdmin() {
    setRewardAdminStatus('發放獎勵中...', false);
    withAdminBusy('reward', function () {
        return callRewardsAdminApi('admin_grant_rewards', {
            address: String(document.getElementById('reward-grant-address').value || ''),
            itemId: String(document.getElementById('reward-grant-item').value || ''),
            itemQty: String(document.getElementById('reward-grant-item-qty').value || '1'),
            avatarId: String(document.getElementById('reward-grant-avatar').value || ''),
            titleId: String(document.getElementById('reward-grant-title').value || ''),
            expiresAt: getIsoDateTimeValue('reward-grant-expires-at'),
            tokenAmount: String(document.getElementById('reward-grant-token-amount').value || '0'),
            note: String(document.getElementById('reward-grant-note').value || '')
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '發放失敗');
            document.getElementById('reward-grant-address').value = '';
            document.getElementById('reward-grant-item').value = '';
            document.getElementById('reward-grant-item-qty').value = '1';
            document.getElementById('reward-grant-avatar').value = '';
            document.getElementById('reward-grant-title').value = '';
            document.getElementById('reward-grant-expires-at').value = '';
            document.getElementById('reward-grant-token-amount').value = '0';
            document.getElementById('reward-grant-note').value = '';
            setRewardAdminStatus('發放完成', false);
            showAdminToast('獎勵已發放', false);
            return loadRewardAdmin();
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function publishRewardTitle() {
    setRewardAdminStatus('新增稱號中...', false);
    withAdminBusy('reward', function () {
        return callRewardsAdminApi('admin_upsert_title', {
            titleName: String(document.getElementById('reward-title-name').value || ''),
            titleCatalogId: String(document.getElementById('reward-title-id').value || ''),
            titleRarity: String(document.getElementById('reward-title-rarity').value || 'epic'),
            titleSource: String(document.getElementById('reward-title-source').value || 'admin'),
            showOnLeaderboard: !!document.getElementById('reward-title-leaderboard').checked,
            adminGrantable: true,
            shopEnabled: !!document.getElementById('reward-title-shop-enabled').checked,
            shopPrice: String(document.getElementById('reward-title-price').value || '0'),
            shopDescription: String(document.getElementById('reward-title-shop-description').value || ''),
            shopCategory: String(document.getElementById('reward-title-category').value || 'featured'),
            shopPriority: String(document.getElementById('reward-title-priority').value || '0'),
            salePrice: String(document.getElementById('reward-title-sale-price').value || '0'),
            saleStartAt: getIsoDateTimeValue('reward-title-sale-start-at'),
            saleEndAt: getIsoDateTimeValue('reward-title-sale-end-at')
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '新增稱號失敗');
            document.getElementById('reward-title-name').value = '';
            document.getElementById('reward-title-id').value = '';
            document.getElementById('reward-title-rarity').value = 'epic';
            document.getElementById('reward-title-source').value = 'admin';
            document.getElementById('reward-title-category').value = 'featured';
            document.getElementById('reward-title-priority').value = '0';
            document.getElementById('reward-title-leaderboard').checked = true;
            document.getElementById('reward-title-shop-enabled').checked = false;
            document.getElementById('reward-title-price').value = '0';
            document.getElementById('reward-title-sale-price').value = '0';
            document.getElementById('reward-title-sale-start-at').value = '';
            document.getElementById('reward-title-sale-end-at').value = '';
            document.getElementById('reward-title-shop-description').value = '';
            setRewardAdminStatus('稱號已新增，可直接用於發放與活動', false);
            showAdminToast('自訂稱號已新增', false);
            return loadRewardAdmin();
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function saveRewardTitlePricing(titleId) {
    var title = getRewardCatalogTitle(titleId);
    if (!title) {
        setRewardAdminStatus('錯誤: 找不到稱號資料', true);
        showAdminToast('找不到稱號資料', true);
        return;
    }

    setRewardAdminStatus('更新稱號定價中...', false);
    withAdminBusy('reward', function () {
        return callRewardsAdminApi('admin_upsert_title', {
            titleId: title.id,
            titleName: title.name,
            titleRarity: title.rarity || 'epic',
            titleSource: title.source || 'admin',
            adminGrantable: title.adminGrantable !== false,
            showOnLeaderboard: !!title.showOnLeaderboard,
            shopEnabled: !!(document.getElementById(getRewardTitleFieldId(titleId, 'shop_enabled')) || {}).checked,
            shopPrice: String((document.getElementById(getRewardTitleFieldId(titleId, 'shop_price')) || {}).value || '0'),
            shopDescription: String((document.getElementById(getRewardTitleFieldId(titleId, 'shop_desc')) || {}).value || ''),
            shopCategory: String((document.getElementById(getRewardTitleFieldId(titleId, 'shop_category')) || {}).value || 'featured'),
            shopPriority: String((document.getElementById(getRewardTitleFieldId(titleId, 'shop_priority')) || {}).value || '0'),
            salePrice: String((document.getElementById(getRewardTitleFieldId(titleId, 'sale_price')) || {}).value || '0'),
            saleStartAt: getIsoDateTimeValue(getRewardTitleFieldId(titleId, 'sale_start')),
            saleEndAt: getIsoDateTimeValue(getRewardTitleFieldId(titleId, 'sale_end'))
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '更新稱號定價失敗');
            setRewardAdminStatus('稱號定價已更新', false);
            showAdminToast('稱號定價已更新', false);
            return loadRewardAdmin();
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function saveExistingRewardTitleSale() {
    var titleId = String((document.getElementById('reward-existing-title-id') || {}).value || '');
    var title = getRewardCatalogTitle(titleId);
    if (!title) {
        setRewardAdminStatus('錯誤: 請先選擇既有稱號', true);
        showAdminToast('請先選擇既有稱號', true);
        return;
    }

    setRewardAdminStatus('套用既有稱號上架設定中...', false);
    withAdminBusy('reward', function () {
        return callRewardsAdminApi('admin_upsert_title', {
            titleId: title.id,
            titleName: title.name,
            titleRarity: title.rarity || 'epic',
            titleSource: title.source || 'admin',
            adminGrantable: title.adminGrantable !== false,
            showOnLeaderboard: !!title.showOnLeaderboard,
            shopEnabled: !!(document.getElementById('reward-existing-title-shop-enabled') || {}).checked,
            shopPrice: String((document.getElementById('reward-existing-title-price') || {}).value || '0'),
            shopDescription: String((document.getElementById('reward-existing-title-shop-description') || {}).value || ''),
            shopCategory: String((document.getElementById('reward-existing-title-category') || {}).value || 'featured'),
            shopPriority: String((document.getElementById('reward-existing-title-priority') || {}).value || '0'),
            salePrice: String((document.getElementById('reward-existing-title-sale-price') || {}).value || '0'),
            saleStartAt: getIsoDateTimeValue('reward-existing-title-sale-start-at'),
            saleEndAt: getIsoDateTimeValue('reward-existing-title-sale-end-at')
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '套用既有稱號上架失敗');
            setRewardAdminStatus('既有稱號上架設定已更新', false);
            showAdminToast('既有稱號上架設定已更新', false);
            return loadRewardAdmin().then(function () {
                var selectEl = document.getElementById('reward-existing-title-id');
                if (selectEl) {
                    selectEl.value = title.id;
                    loadExistingRewardTitleForSale(title.id);
                }
            });
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function publishRewardCampaign() {
    setRewardAdminStatus('建立活動中...', false);
    withAdminBusy('reward', function () {
        return callRewardsAdminApi('admin_upsert_campaign', {
            title: String(document.getElementById('campaign-title').value || ''),
            description: String(document.getElementById('campaign-description').value || ''),
            startAt: getIsoDateTimeValue('campaign-start-at'),
            endAt: getIsoDateTimeValue('campaign-end-at'),
            claimLimitPerUser: String(document.getElementById('campaign-claim-limit').value || '1'),
            minVipLevel: String(document.getElementById('campaign-min-vip').value || ''),
            isActive: !!document.getElementById('campaign-active').checked,
            itemId: String(document.getElementById('campaign-item').value || ''),
            itemQty: String(document.getElementById('campaign-item-qty').value || '1'),
            avatarId: String(document.getElementById('campaign-avatar').value || ''),
            titleId: String(document.getElementById('campaign-title-id').value || ''),
            titleExpiresAt: getIsoDateTimeValue('campaign-title-expires-at'),
            tokenAmount: String(document.getElementById('campaign-token-amount').value || '0')
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '建立活動失敗');
            document.getElementById('campaign-title').value = '';
            document.getElementById('campaign-description').value = '';
            document.getElementById('campaign-start-at').value = '';
            document.getElementById('campaign-end-at').value = '';
            document.getElementById('campaign-claim-limit').value = '1';
            document.getElementById('campaign-min-vip').value = '';
            document.getElementById('campaign-active').checked = true;
            document.getElementById('campaign-item').value = '';
            document.getElementById('campaign-item-qty').value = '1';
            document.getElementById('campaign-avatar').value = '';
            document.getElementById('campaign-title-id').value = '';
            document.getElementById('campaign-title-expires-at').value = '';
            document.getElementById('campaign-token-amount').value = '0';
            setRewardAdminStatus('活動已建立', false);
            showAdminToast('限時活動已建立', false);
            return loadRewardAdmin();
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function saveRewardCampaign(campaignId) {
    setRewardAdminStatus('更新活動中...', false);
    withAdminBusy('reward', function () {
        return callRewardsAdminApi('admin_upsert_campaign', {
            campaignId: campaignId,
            title: String(document.getElementById(getCampaignFieldId(campaignId, 'title')).value || ''),
            description: String(document.getElementById(getCampaignFieldId(campaignId, 'description')).value || ''),
            startAt: getIsoDateTimeValue(getCampaignFieldId(campaignId, 'start')),
            endAt: getIsoDateTimeValue(getCampaignFieldId(campaignId, 'end')),
            claimLimitPerUser: String(document.getElementById(getCampaignFieldId(campaignId, 'claim_limit')).value || '1'),
            minVipLevel: String(document.getElementById(getCampaignFieldId(campaignId, 'min_vip')).value || ''),
            isActive: !!document.getElementById(getCampaignFieldId(campaignId, 'active')).checked,
            itemId: String(document.getElementById(getCampaignFieldId(campaignId, 'item')).value || ''),
            itemQty: String(document.getElementById(getCampaignFieldId(campaignId, 'item_qty')).value || '1'),
            avatarId: String(document.getElementById(getCampaignFieldId(campaignId, 'avatar')).value || ''),
            titleId: String(document.getElementById(getCampaignFieldId(campaignId, 'reward_title')).value || ''),
            titleExpiresAt: getIsoDateTimeValue(getCampaignFieldId(campaignId, 'title_expires_at')),
            tokenAmount: String(document.getElementById(getCampaignFieldId(campaignId, 'token_amount')).value || '0')
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '更新活動失敗');
            setRewardAdminStatus('活動已更新', false);
            showAdminToast('活動已更新', false);
            return loadRewardAdmin();
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function toggleOpsSection() {
    var body = document.getElementById('ops-section-body');
    var btn = document.getElementById('ops-toggle-btn');
    if (!body || !btn) return;

    opsExpanded = !opsExpanded;
    body.classList.toggle('hidden', !opsExpanded);
    btn.innerText = opsExpanded ? '收合高額下注重製' : '展開高額下注重製';
}

function initAdminToolsPage() {
    setAdminStatus('目前管理頁已啟用公告、稱號活動發放、交易失敗率看板、問題回報、託管帳號與高額下注重製', false);
}
