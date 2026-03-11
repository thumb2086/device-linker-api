var adminBusyState = {
    ops: false,
    custody: false,
    issue: false,
    announcement: false,
    reward: false,
    txHealth: false,
    txQueue: false,
    blacklist: false,
    winBias: false,
    maintenance: false
};
var custodyUsers = [];
var issueReports = [];
var announcements = [];
var blacklistRecords = [];
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
var txQueueLoaded = false;
var txQueueExpanded = false;
var issueLoaded = false;
var issueExpanded = false;
var blacklistExpanded = false;
var blacklistLoaded = false;
var winBiasExpanded = false;
var opsExpanded = false;
var maintenanceExpanded = false;
var maintenanceLoaded = false;
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

function setBlacklistStatus(text, isError) {
    var el = document.getElementById('blacklist-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#ffd36a';
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

function setTxQueueStatus(text, isError) {
    var el = document.getElementById('tx-queue-status-msg');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9fd0ff';
}

function setMaintenanceStatus(text, isError) {
    var el = document.getElementById('maintenance-status-msg');
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

function callAdminApi(action, extraPayload, options) {
    var payload = Object.assign({
        action: action,
        sessionId: user.sessionId
    }, extraPayload || {});

    var controller = null;
    var timeoutId = null;
    var timeoutMs = options && Number(options.timeoutMs || 0);
    if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timeoutId = window.setTimeout(function () {
            controller.abort();
        }, timeoutMs);
    }

    return fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
    }).then(function (res) { return res.json(); })
        .finally(function () {
            if (timeoutId) window.clearTimeout(timeoutId);
        });
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
            limit: 25,
            maxScanMs: 1500,
            maxEvents: 2000,
            timeoutMs: 3500
        }, { timeoutMs: 8000 }).then(function (data) {
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
        var isAbort = error && (error.name === 'AbortError' || String(error.message || '').toLowerCase().indexOf('abort') >= 0);
        var message = isAbort ? '載入逾時，請稍後重試' : (error.message || '載入交易看板失敗');
        setTxHealthStatus('錯誤: ' + message, true);
        showAdminToast(message, true);
    });
}

function renderTxQueueStatus(snapshot) {
    var data = snapshot || {};
    var pendingEl = document.getElementById('tx-queue-pending');
    var servingEl = document.getElementById('tx-queue-serving');
    var nextEl = document.getElementById('tx-queue-next');
    var lockEl = document.getElementById('tx-queue-lock');
    var listEl = document.getElementById('tx-queue-list');

    if (pendingEl) pendingEl.innerText = String(data.pendingCount || 0);
    if (servingEl) servingEl.innerText = String(data.serving || 0);
    if (nextEl) nextEl.innerText = String(data.next || 0);

    if (lockEl) {
        if (!data.lock) {
            lockEl.innerHTML = '<div class="result-empty">目前沒有交易正在上鏈</div>';
        } else {
            lockEl.innerHTML = '<div class="announcement-admin-card">' +
                '<div class="announcement-admin-head">' +
                    '<div>' +
                        '<strong>' + escapeHtml(data.lock.source || 'unknown') + '</strong>' +
                        '<div class="issue-report-meta">' +
                            '<span>acquired ' + escapeHtml(formatTime(data.lock.acquiredAt)) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<span class="state-chip info">上鏈中</span>' +
                '</div>' +
                '</div>';
        }
    }

    if (!listEl) return;
    if (!data.queue || data.queue.length === 0) {
        listEl.innerHTML = '<div class="result-empty">目前沒有等待中的交易</div>';
        return;
    }

    listEl.innerHTML = data.queue.map(function (item) {
        return '<div class="announcement-admin-card">' +
            '<div class="announcement-admin-head">' +
                '<div>' +
                    '<strong>ticket ' + escapeHtml(String(item.ticket || '-')) + '</strong>' +
                    '<div class="issue-report-meta">' +
                        '<span>' + escapeHtml(item.source || 'unknown') + '</span>' +
                        '<span>' + escapeHtml(formatTime(item.createdAt)) + '</span>' +
                    '</div>' +
                '</div>' +
                '<span class="state-chip warn">排隊中</span>' +
            '</div>' +
            '</div>';
    }).join('');
}

function refreshTxQueueStatus() {
    setTxQueueStatus('同步排隊狀態中...', false);
    withAdminBusy('txQueue', function () {
        return callAdminApi('get_tx_queue_status', {
            limit: 50
        }, { timeoutMs: 8000 }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '載入排隊狀態失敗');
            renderTxQueueStatus(data.snapshot || {});
            txQueueLoaded = true;
            setTxQueueStatus('排隊狀態已更新', false);
        });
    }).catch(function (error) {
        setTxQueueStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function toggleTxQueueSection() {
    var body = document.getElementById('tx-queue-section-body');
    var btn = document.getElementById('tx-queue-toggle-btn');
    if (!body || !btn) return;

    txQueueExpanded = !txQueueExpanded;
    body.classList.toggle('hidden', !txQueueExpanded);
    btn.innerText = txQueueExpanded ? '收合排隊狀態' : '展開排隊狀態';

    if (txQueueExpanded && !txQueueLoaded) {
        refreshTxQueueStatus();
    }
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
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
    renderRewardSelectOptions('reward-avatar-selector', rewardCatalog.avatars, '建立新頭像');
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
    var avatarRarityEl = document.getElementById('reward-avatar-rarity');
    if (avatarRarityEl) {
        avatarRarityEl.innerHTML = buildSimpleSelectOptionsHtml([
            { value: 'common', label: '普通' },
            { value: 'rare', label: '稀有' },
            { value: 'epic', label: '史詩' },
            { value: 'mythic', label: '神話' },
            { value: 'legendary', label: '傳奇' }
        ], 'common');
    }
    var avatarSourceEl = document.getElementById('reward-avatar-source');
    if (avatarSourceEl) {
        avatarSourceEl.innerHTML = buildSimpleSelectOptionsHtml([
            { value: 'admin', label: '管理員' },
            { value: 'campaign', label: '活動' },
            { value: 'shop', label: '商店' },
            { value: 'chest', label: '寶箱' },
            { value: 'default', label: '預設' }
        ], 'admin');
    }
    var titleSelectorEl = document.getElementById('reward-title-selector');
    if (titleSelectorEl) {
        titleSelectorEl.innerHTML = buildRewardSelectOptionsHtml(rewardCatalog && rewardCatalog.titles, '建立新稱號', '');
    }
    var campaignSelectorEl = document.getElementById('reward-campaign-selector');
    if (campaignSelectorEl) {
        campaignSelectorEl.innerHTML = buildRewardSelectOptionsHtml(rewardCampaigns.map(function(c) { return { id: c.id, name: c.title }; }), '建立新活動', '');
    }
    var campaignCountEl = document.getElementById('reward-campaign-count');
    if (campaignCountEl) {
        campaignCountEl.innerText = String(rewardCampaigns.length);
    }
}

function getRewardCatalogTitle(titleId) {
    var titles = rewardCatalog && Array.isArray(rewardCatalog.titles) ? rewardCatalog.titles : [];
    for (var i = 0; i < titles.length; i += 1) {
        if (String(titles[i] && titles[i].id || '') === String(titleId || '')) return titles[i];
    }
    return null;
}

function getRewardCatalogAvatar(avatarId) {
    var avatars = rewardCatalog && Array.isArray(rewardCatalog.avatars) ? rewardCatalog.avatars : [];
    for (var i = 0; i < avatars.length; i += 1) {
        if (String(avatars[i] && avatars[i].id || '') === String(avatarId || '')) return avatars[i];
    }
    return null;
}

function onAdminTitleSelected(titleId) {
    if (!titleId) {
        clearAdminTitleForm();
        return;
    }
    var title = getRewardCatalogTitle(titleId);
    if (!title) return;

    document.getElementById('reward-title-name').value = title.name || '';
    document.getElementById('reward-title-id').value = title.id || '';
    document.getElementById('reward-title-rarity').value = title.rarity || 'epic';
    document.getElementById('reward-title-source').value = title.source || 'admin';
    document.getElementById('reward-title-leaderboard').checked = !!title.showOnLeaderboard;
    document.getElementById('reward-title-shop-enabled').checked = !!title.shopEnabled;
    document.getElementById('reward-title-price').value = String(title.shopPrice || 0);
    document.getElementById('reward-title-category').value = title.shopCategory || 'featured';
    document.getElementById('reward-title-priority').value = String(title.shopPriority || 0);
    document.getElementById('reward-title-sale-price').value = String(title.salePrice || 0);
    document.getElementById('reward-title-sale-start-at').value = toDateTimeLocalValue(title.saleStartAt || '');
    document.getElementById('reward-title-sale-end-at').value = toDateTimeLocalValue(title.saleEndAt || '');
    document.getElementById('reward-title-description').value = title.description || '';
    document.getElementById('reward-title-shop-description').value = title.shopDescription || '';
}

function clearAdminTitleForm() {
    document.getElementById('reward-title-selector').value = '';
    document.getElementById('reward-title-name').value = '';
    document.getElementById('reward-title-id').value = '';
    document.getElementById('reward-title-rarity').value = 'epic';
    document.getElementById('reward-title-source').value = 'admin';
    document.getElementById('reward-title-leaderboard').checked = true;
    document.getElementById('reward-title-shop-enabled').checked = false;
    document.getElementById('reward-title-price').value = '0';
    document.getElementById('reward-title-category').value = 'featured';
    document.getElementById('reward-title-priority').value = '0';
    document.getElementById('reward-title-sale-price').value = '0';
    document.getElementById('reward-title-sale-start-at').value = '';
    document.getElementById('reward-title-sale-end-at').value = '';
    document.getElementById('reward-title-description').value = '';
    document.getElementById('reward-title-shop-description').value = '';
}

function onAdminAvatarSelected(avatarId) {
    if (!avatarId) {
        clearAdminAvatarForm();
        return;
    }
    var avatar = getRewardCatalogAvatar(avatarId);
    if (!avatar) return;

    document.getElementById('reward-avatar-name').value = avatar.name || '';
    document.getElementById('reward-avatar-id').value = avatar.id || '';
    document.getElementById('reward-avatar-icon').value = avatar.icon || '👤';
    document.getElementById('reward-avatar-rarity').value = avatar.rarity || 'common';
    document.getElementById('reward-avatar-source').value = avatar.source || 'admin';
    document.getElementById('reward-avatar-description').value = avatar.description || '';
}

function clearAdminAvatarForm() {
    document.getElementById('reward-avatar-selector').value = '';
    document.getElementById('reward-avatar-name').value = '';
    document.getElementById('reward-avatar-id').value = '';
    document.getElementById('reward-avatar-icon').value = '';
    document.getElementById('reward-avatar-rarity').value = 'common';
    document.getElementById('reward-avatar-source').value = 'admin';
    document.getElementById('reward-avatar-description').value = '';
}

function onAdminCampaignSelected(campaignId) {
    if (!campaignId) {
        clearAdminCampaignForm();
        return;
    }
    var campaign = null;
    for (var i = 0; i < rewardCampaigns.length; i += 1) {
        if (String(rewardCampaigns[i].id) === String(campaignId)) {
            campaign = rewardCampaigns[i];
            break;
        }
    }
    if (!campaign) return;

    var rewardItem = getPrimaryRewardItem(campaign.rewards);
    var rewardAvatar = getPrimaryRewardAvatar(campaign.rewards);
    var rewardTitle = getPrimaryRewardTitle(campaign.rewards);

    document.getElementById('campaign-id-hidden').value = campaign.id || '';
    document.getElementById('campaign-title').value = campaign.title || '';
    document.getElementById('campaign-description').value = campaign.description || '';
    document.getElementById('campaign-start-at').value = toDateTimeLocalValue(campaign.startAt || '');
    document.getElementById('campaign-end-at').value = toDateTimeLocalValue(campaign.endAt || '');
    document.getElementById('campaign-claim-limit').value = String(campaign.claimLimitPerUser || 1);
    document.getElementById('campaign-min-vip').value = campaign.minVipLevel || '';
    document.getElementById('campaign-active').checked = !!campaign.isActive;
    document.getElementById('campaign-item').value = rewardItem ? rewardItem.id : '';
    document.getElementById('campaign-item-qty').value = rewardItem ? String(rewardItem.qty) : '1';
    document.getElementById('campaign-avatar').value = rewardAvatar || '';
    document.getElementById('campaign-title-id').value = rewardTitle ? rewardTitle.id : '';
    document.getElementById('campaign-title-expires-at').value = toDateTimeLocalValue(rewardTitle && rewardTitle.expiresAt || '');
    document.getElementById('campaign-token-amount').value = String(campaign.rewards && campaign.rewards.tokens || 0);
}

function clearAdminCampaignForm() {
    document.getElementById('reward-campaign-selector').value = '';
    document.getElementById('campaign-id-hidden').value = '';
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
        renderRewardGrantLogs();
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
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
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
    setRewardAdminStatus('儲存稱號設定中...', false);
    withAdminBusy('reward', function () {
        var titleId = document.getElementById('reward-title-id').value;
        return callRewardsAdminApi('admin_upsert_title', {
            titleName: String(document.getElementById('reward-title-name').value || ''),
            titleCatalogId: String(titleId || ''),
            titleRarity: String(document.getElementById('reward-title-rarity').value || 'epic'),
            titleSource: String(document.getElementById('reward-title-source').value || 'admin'),
            showOnLeaderboard: !!document.getElementById('reward-title-leaderboard').checked,
            adminGrantable: true,
            shopEnabled: !!document.getElementById('reward-title-shop-enabled').checked,
            shopPrice: String(document.getElementById('reward-title-price').value || '0'),
            description: String(document.getElementById('reward-title-description').value || ''),
            shopDescription: String(document.getElementById('reward-title-shop-description').value || ''),
            shopCategory: String(document.getElementById('reward-title-category').value || 'featured'),
            shopPriority: String(document.getElementById('reward-title-priority').value || '0'),
            salePrice: String(document.getElementById('reward-title-sale-price').value || '0'),
            saleStartAt: getIsoDateTimeValue('reward-title-sale-start-at'),
            saleEndAt: getIsoDateTimeValue('reward-title-sale-end-at')
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '儲存稱號失敗');
            setRewardAdminStatus('稱號設定已儲存', false);
            showAdminToast('稱號設定已儲存', false);
            return loadRewardAdmin().then(function() {
                if (data.title && data.title.id) {
                    document.getElementById('reward-title-selector').value = data.title.id;
                    onAdminTitleSelected(data.title.id);
                }
            });
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function publishRewardAvatar() {
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
    setRewardAdminStatus('儲存頭像設定中...', false);
    withAdminBusy('reward', function () {
        var avatarId = document.getElementById('reward-avatar-id').value;
        return callRewardsAdminApi('admin_upsert_avatar', {
            avatarName: String(document.getElementById('reward-avatar-name').value || ''),
            avatarCatalogId: String(avatarId || ''),
            avatarIcon: String(document.getElementById('reward-avatar-icon').value || '👤'),
            avatarRarity: String(document.getElementById('reward-avatar-rarity').value || 'common'),
            avatarSource: String(document.getElementById('reward-avatar-source').value || 'admin'),
            avatarDescription: String(document.getElementById('reward-avatar-description').value || '')
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '儲存頭像失敗');
            setRewardAdminStatus('頭像設定已儲存', false);
            showAdminToast('頭像設定已儲存', false);
            return loadRewardAdmin().then(function() {
                if (data.avatar && data.avatar.id) {
                    document.getElementById('reward-avatar-selector').value = data.avatar.id;
                    onAdminAvatarSelected(data.avatar.id);
                }
            });
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function publishRewardCampaign() {
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
    setRewardAdminStatus('儲存活動設定中...', false);
    withAdminBusy('reward', function () {
        var campaignId = document.getElementById('campaign-id-hidden').value;
        return callRewardsAdminApi('admin_upsert_campaign', {
            campaignId: campaignId || undefined,
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
            if (!data || !data.success) throw new Error((data && data.error) || '儲存活動失敗');
            setRewardAdminStatus('活動已儲存', false);
            showAdminToast('限時活動已儲存', false);
            return loadRewardAdmin().then(function() {
                if (data.campaign && data.campaign.id) {
                    document.getElementById('reward-campaign-selector').value = data.campaign.id;
                    onAdminCampaignSelected(data.campaign.id);
                }
            });
        });
    }).catch(function (error) {
        setRewardAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function renderBlacklist() {
    var listEl = document.getElementById('blacklist-list');
    var totalEl = document.getElementById('blacklist-total-count');
    if (!listEl) return;

    if (totalEl) totalEl.innerText = String(blacklistRecords.length);

    if (blacklistRecords.length === 0) {
        listEl.innerHTML = '<div class="result-empty">目前沒有黑名單紀錄</div>';
        return;
    }

    var html = '<div class="custody-user-row custody-user-head">' +
        '<span>地址</span>' +
        '<span>原因</span>' +
        '<span>加入時間</span>' +
        '<span>操作員</span>' +
        '<span>操作</span>' +
        '</div>';

    blacklistRecords.forEach(function (item) {
        html += '<div class="custody-user-row">' +
            '<span class="mono" title="' + escapeHtml(item.address) + '">' + escapeHtml(maskAdminAddress(item.address)) + '</span>' +
            '<span>' + escapeHtml(item.reason || '-') + '</span>' +
            '<span>' + escapeHtml(formatTime(item.createdAt)) + '</span>' +
            '<span class="mono" title="' + escapeHtml(item.operator) + '">' + escapeHtml(maskAdminAddress(item.operator)) + '</span>' +
            '<span><button class="btn-secondary compact-btn" data-address="' + escapeHtml(item.address) + '" onclick="removeFromBlacklist(this.dataset.address)">移除</button></span>' +
            '</div>';
    });

    listEl.innerHTML = html;
}

function loadBlacklist() {
    return callAdminApi('list_blacklist').then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '載入黑名單失敗');
        blacklistRecords = Array.isArray(data.blacklist) ? data.blacklist : [];
        renderBlacklist();
        setBlacklistStatus('已載入 ' + blacklistRecords.length + ' 筆黑名單紀錄', false);
    });
}

function refreshBlacklist() {
    setBlacklistStatus('正在讀取黑名單...', false);
    withAdminBusy('blacklist', function () {
        return loadBlacklist().then(function () {
            blacklistLoaded = true;
        });
    }).catch(function (error) {
        setBlacklistStatus('錯誤: ' + error.message, true);
    });
}

function loadMaintenance() {
    return callAdminApi('get_maintenance').then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '載入維護設定失敗');
        var enabledEl = document.getElementById('maintenance-enabled');
        var titleEl = document.getElementById('maintenance-title');
        var messageEl = document.getElementById('maintenance-message');
        if (enabledEl) enabledEl.checked = !!data.enabled;
        if (titleEl) titleEl.value = data.title || '';
        if (messageEl) messageEl.value = data.message || '';
        setMaintenanceStatus('已載入維護設定', false);
    });
}

function refreshMaintenance() {
    setMaintenanceStatus('正在讀取維護設定...', false);
    withAdminBusy('maintenance', function () {
        return loadMaintenance().then(function () {
            maintenanceLoaded = true;
        });
    }).catch(function (error) {
        setMaintenanceStatus('錯誤: ' + error.message, true);
    });
}

function saveMaintenance() {
    var enabledEl = document.getElementById('maintenance-enabled');
    var titleEl = document.getElementById('maintenance-title');
    var messageEl = document.getElementById('maintenance-message');
    var payload = {
        enabled: !!(enabledEl && enabledEl.checked),
        title: titleEl ? titleEl.value : '',
        message: messageEl ? messageEl.value : ''
    };
    setMaintenanceStatus('正在儲存維護設定...', false);
    withAdminBusy('maintenance', function () {
        return callAdminApi('set_maintenance', payload);
    }).then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || '儲存維護設定失敗');
        maintenanceLoaded = true;
        setMaintenanceStatus(data.enabled ? '維護模式已啟用' : '維護模式已關閉', false);
        showAdminToast(data.enabled ? '維護模式已啟用' : '維護模式已關閉', false);
    }).catch(function (error) {
        setMaintenanceStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function toggleMaintenanceSection() {
    var body = document.getElementById('maintenance-section-body');
    var btn = document.getElementById('maintenance-toggle-btn');
    if (!body || !btn) return;

    maintenanceExpanded = !maintenanceExpanded;
    body.classList.toggle('hidden', !maintenanceExpanded);
    btn.innerText = maintenanceExpanded ? '收合維護模式' : '展開維護模式';

    if (maintenanceExpanded && !maintenanceLoaded) {
        refreshMaintenance();
    }
}

function toggleBlacklistSection() {
    var body = document.getElementById('blacklist-section-body');
    var btn = document.getElementById('blacklist-toggle-btn');
    if (!body || !btn) return;

    blacklistExpanded = !blacklistExpanded;
    body.classList.toggle('hidden', !blacklistExpanded);
    btn.innerText = blacklistExpanded ? '收合黑名單管理' : '展開黑名單管理';

    if (blacklistExpanded && !blacklistLoaded) {
        refreshBlacklist();
    }
}

function addToBlacklist() {
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
    var addressEl = document.getElementById('blacklist-address');
    var reasonEl = document.getElementById('blacklist-reason');
    var address = String(addressEl && addressEl.value || '').trim();
    var reason = String(reasonEl && reasonEl.value || '').trim();

    if (!address) {
        setBlacklistStatus('請輸入要加入黑名單的地址', true);
        return;
    }

    setBlacklistStatus('正在加入黑名單...', false);
    withAdminBusy('blacklist', function () {
        return callAdminApi('add_to_blacklist', {
            address: address,
            reason: reason
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '加入黑名單失敗');
            if (addressEl) addressEl.value = '';
            if (reasonEl) reasonEl.value = '';
            setBlacklistStatus('已加入黑名單', false);
            showAdminToast('地址已加入黑名單', false);
            return loadBlacklist();
        });
    }).catch(function (error) {
        setBlacklistStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function removeFromBlacklist(address) {
    if (!confirm('確定要將 ' + address + ' 從黑名單移除嗎？')) return;

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

    setBlacklistStatus('正在移除黑名單...', false);
    withAdminBusy('blacklist', function () {
        return callAdminApi('remove_from_blacklist', {
            address: address
        }).then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '移除失敗');
            setBlacklistStatus('已從黑名單移除', false);
            showAdminToast('地址已從黑名單移除', false);
            return loadBlacklist();
        });
    }).catch(function (error) {
        setBlacklistStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function toggleWinBiasSection() {
    var body = document.getElementById('win-bias-section-body');
    var btn = document.getElementById('win-bias-toggle-btn');
    if (!body || !btn) return;

    winBiasExpanded = !winBiasExpanded;
    body.classList.toggle('hidden', !winBiasExpanded);
    btn.innerText = winBiasExpanded ? '收合勝率干預' : '展開勝率干預';
}

function queryWinBias() {
    var address = String(document.getElementById('win-bias-address').value || '').trim();
    if (!address) {
        showAdminToast('請輸入地址', true);
        return;
    }

    setAdminStatus('正在查詢勝率設定...', false);
    withAdminBusy('winBias', function () {
        return callAdminApi('get_user_win_bias', { address: address })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || '查詢失敗');
                var val = data.bias !== null ? data.bias : 0.08;
                document.getElementById('win-bias-value').value = String(val);
                document.getElementById('win-bias-status-msg').innerText = '目前設定：' + (data.bias !== null ? val : '系統預設 (0.08)');
                setAdminStatus('查詢完成', false);
            });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function saveWinBias() {
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
    var address = String(document.getElementById('win-bias-address').value || '').trim();
    var bias = Number(document.getElementById('win-bias-value').value);
    if (!address) {
        showAdminToast('請輸入地址', true);
        return;
    }

    setAdminStatus('正在儲存勝率設定...', false);
    withAdminBusy('winBias', function () {
        return callAdminApi('set_user_win_bias', { address: address, bias: bias })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || '儲存失敗');
                document.getElementById('win-bias-status-msg').innerText = '強制干預設定已儲存：' + bias;
                setAdminStatus('儲存完成', false);
                showAdminToast('勝率設定已更新', false);
            });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
        showAdminToast(error.message, true);
    });
}

function resetWinBias() {
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }
    var address = String(document.getElementById('win-bias-address').value || '').trim();
    if (!address) {
        showAdminToast('請輸入地址', true);
        return;
    }

    setAdminStatus('正在恢復預設勝率...', false);
    withAdminBusy('winBias', function () {
        return callAdminApi('set_user_win_bias', { address: address, bias: null })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || '恢復失敗');
                document.getElementById('win-bias-value').value = '0.08';
                document.getElementById('win-bias-status-msg').innerText = '已恢復系統預設';
                setAdminStatus('恢復完成', false);
                showAdminToast('已取消對該地址的勝率干預', false);
            });
    }).catch(function (error) {
        setAdminStatus('錯誤: ' + error.message, true);
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
