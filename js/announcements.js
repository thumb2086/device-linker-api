var currentPublicAnnouncements = [];

function escapeAnnouncementHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAnnouncementTime(value) {
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

function createAnnouncementCard(item, isPreview) {
    var card = document.createElement('article');
    card.className = 'announcement-card' + (isPreview ? ' preview' : '');

    var meta = document.createElement('div');
    meta.className = 'announcement-meta';

    var tag = document.createElement('span');
    tag.className = 'announcement-tag ' + ((item.pinned ? 'activity' : 'update'));
    tag.innerText = item.pinned ? '置頂公告' : '公告';

    var date = document.createElement('span');
    date.className = 'announcement-date';
    date.innerText = formatAnnouncementTime(item.updatedAt || item.createdAt);

    meta.appendChild(tag);
    meta.appendChild(date);

    var title = document.createElement('h3');
    title.className = 'announcement-title';
    title.innerText = item.title || '未命名公告';

    var body = document.createElement('p');
    body.className = 'announcement-body' + (isPreview ? ' preview' : '');
    body.innerHTML = escapeAnnouncementHtml(item.content || '').replace(/\n/g, '<br>');

    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(body);

    return card;
}

function setAnnouncementPageStatus(text, isError) {
    var el = document.getElementById('announcement-page-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7d7d' : '#9fd0ff';
}

function fetchPublicAnnouncements(limit) {
    return fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'get_announcements',
            activeOnly: true,
            limit: limit || 20
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (!data || !data.success) {
                throw new Error((data && data.error) || '載入公告失敗');
            }
            currentPublicAnnouncements = Array.isArray(data.announcements) ? data.announcements : [];
            return currentPublicAnnouncements;
        });
}

function renderAnnouncements(containerId, items, limit) {
    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
        container.innerHTML = '<div class="result-empty">目前沒有有效公告</div>';
        return;
    }

    var displayItems = typeof limit === 'number' ? items.slice(0, limit) : items.slice();
    displayItems.forEach(function (item) {
        container.appendChild(createAnnouncementCard(item, typeof limit === 'number'));
    });
}

function initAnnouncementPreview() {
    var panel = document.getElementById('auth-announcements');
    if (!panel) return;
    panel.classList.remove('hidden');
    fetchPublicAnnouncements(3)
        .then(function (items) {
            renderAnnouncements('announcement-preview-list', items, 3);
        })
        .catch(function () {
            renderAnnouncements('announcement-preview-list', [], 3);
        });
}

function initAnnouncementPage() {
    setAnnouncementPageStatus('讀取公告中...', false);
    fetchPublicAnnouncements(50)
        .then(function (items) {
            renderAnnouncements('announcement-page-list', items);
            setAnnouncementPageStatus('已載入 ' + items.length + ' 則有效公告', false);
        })
        .catch(function (error) {
            renderAnnouncements('announcement-page-list', []);
            setAnnouncementPageStatus('錯誤: ' + error.message, true);
        });
}
