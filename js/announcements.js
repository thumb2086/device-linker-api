function createAnnouncementCard(item, isPreview) {
    var card = document.createElement('article');
    card.className = 'announcement-card' + (isPreview ? ' preview' : '');

    var meta = document.createElement('div');
    meta.className = 'announcement-meta';

    var tag = document.createElement('span');
    tag.className = 'announcement-tag ' + (item.tag || 'notice');
    tag.innerText = item.tagLabel || '公告';

    var date = document.createElement('span');
    date.className = 'announcement-date';
    date.innerText = item.date || '';

    meta.appendChild(tag);
    meta.appendChild(date);

    var title = document.createElement('h3');
    title.className = 'announcement-title';
    title.innerText = item.title || '';

    var body = document.createElement('p');
    body.className = 'announcement-body' + (isPreview ? ' preview' : '');
    body.innerText = item.body || '';

    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(body);

    return card;
}

function renderAnnouncements(containerId, limit) {
    var container = document.getElementById(containerId);
    if (!container || !Array.isArray(ANNOUNCEMENTS)) return;

    container.innerHTML = '';
    var items = typeof limit === 'number' ? ANNOUNCEMENTS.slice(0, limit) : ANNOUNCEMENTS.slice();

    items.forEach(function (item) {
        container.appendChild(createAnnouncementCard(item, typeof limit === 'number'));
    });
}

function initAnnouncementPreview() {
    var panel = document.getElementById('auth-announcements');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderAnnouncements('announcement-preview-list', 3);
}

function initAnnouncementPage() {
    renderAnnouncements('announcement-page-list');
}
