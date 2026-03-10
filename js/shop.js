var shopState = null;
var shopBusy = false;
var shopTab = 'shop';
var shopToastSeq = 0;
var shopTitleCategory = 'all';

function setShopStatus(text, isError) {
    var el = document.getElementById('rewards-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#ffd36a';
}

function showShopToast(text, isError) {
    var stackEl = document.getElementById('rewards-toast-stack');
    if (!stackEl || !text) return;

    var toastEl = document.createElement('div');
    toastEl.className = 'rewards-toast ' + (isError ? 'error' : 'success');
    toastEl.innerHTML =
        '<strong class="rewards-toast-title">' + (isError ? '操作失敗' : '操作成功') + '</strong>' +
        '<div class="rewards-toast-copy">' + escapeShopHtml(text) + '</div>';
    stackEl.appendChild(toastEl);

    requestAnimationFrame(function () { toastEl.classList.add('visible'); });

    window.setTimeout(function () {
        toastEl.classList.remove('visible');
        window.setTimeout(function () { if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl); }, 220);
    }, isError ? 4200 : 2600);
}

function shopApi(action, payload) {
    return fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
            action: action,
            sessionId: user.sessionId
        }, payload || {}))
    }).then(function (res) { return res.json(); });
}

function escapeShopHtml(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rarityLabel(rarity) {
    var map = { common: '普通', rare: '稀有', super_rare: '超稀有', epic: '史詩', mythic: '神話', legendary: '傳奇' };
    return map[String(rarity || '').toLowerCase()] || String(rarity || '普通');
}

function titleCategoryLabel(category) {
    var map = { all: '全部', featured: '精選', achievement: '成就', event: '活動', vip: 'VIP', special: '特別' };
    return map[String(category || '').toLowerCase()] || String(category || '全部');
}

function formatShopDateTime(value) {
    if (!value) return '';
    var date = new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) return String(value || '');
    return date.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function switchShopTab(tabName) {
    shopTab = String(tabName || 'shop');
    document.querySelectorAll('.rewards-nav-btn').forEach(function (button) {
        button.classList.toggle('active', button.getAttribute('data-tab') === shopTab);
    });
    document.querySelectorAll('.rewards-panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === shopTab);
    });
}

function renderShopItems(items) {
    var listEl = document.getElementById('shop-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">商店目前沒有商品</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var icon = item.type === 'chest' ? '🎁' : item.type === 'key' ? '🗝️' : '✨';
        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<div class="reward-card-title">' +
                    '<span class="reward-icon">' + icon + '</span>' +
                    '<div><strong>' + escapeShopHtml(item.name) + '</strong><div class="reward-card-meta">' + escapeShopHtml(item.type) + '</div></div>' +
                '</div>' +
                '<span class="reward-rarity">' + escapeShopHtml(rarityLabel(item.rarity)) + '</span>' +
            '</div>' +
            '<div class="reward-card-meta desc">' + escapeShopHtml(item.description || '此道具暫無功能說明。') + '</div>' +
            '<div class="reward-card-meta">售價：' + formatCompactZh(item.price, 2) + ' 子熙幣</div>' +
            '<div class="reward-card-actions">' +
                '<button class="btn-primary compact-btn" onclick="buyShopItem(\'' + escapeShopHtml(item.id) + '\')">購買</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function renderTitleShop(items) {
    var listEl = document.getElementById('title-shop-list');
    var filterEl = document.getElementById('title-shop-filter');
    if (!listEl) return;

    var ownedTitleMap = {};
    (((shopState || {}).profile || {}).titles || []).forEach(function (t) { if (t && t.id) ownedTitleMap[t.id] = true; });

    var sellableTitles = (items || []).filter(function (item) {
        return !!item && item.shopEnabled === true && Number(item.shopPrice || 0) > 0 && !ownedTitleMap[item.id];
    });

    var categories = [{ value: 'all', label: '全部' }];
    var seenCats = { all: true };
    sellableTitles.forEach(function (t) {
        var cat = String(t.shopCategory || 'featured');
        if (!seenCats[cat]) { seenCats[cat] = true; categories.push({ value: cat, label: titleCategoryLabel(cat) }); }
    });

    if (filterEl) {
        filterEl.innerHTML = categories.map(function (c) {
            return '<button class="reward-filter-chip' + (shopTitleCategory === c.value ? ' active' : '') + '" onclick="setShopTitleCategory(\'' + escapeShopHtml(c.value) + '\')">' + escapeShopHtml(c.label) + '</button>';
        }).join('');
    }

    sellableTitles = sellableTitles.filter(function (t) { return shopTitleCategory === 'all' || String(t.shopCategory || 'featured') === shopTitleCategory; });

    if (!sellableTitles.length) {
        listEl.innerHTML = '<div class="reward-empty">目前沒有上架稱號</div>';
        return;
    }

    listEl.innerHTML = sellableTitles.map(function (item) {
        var priceHtml = item.saleActive ?
            '<div class="reward-card-price sale"><span class="price-now">' + formatCompactZh(item.effectiveShopPrice, 2) + ' 子熙幣</span><span class="price-old">' + formatCompactZh(item.shopPrice, 2) + ' 子熙幣</span></div>' :
            '<div class="reward-card-price"><span class="price-now">' + formatCompactZh(item.shopPrice, 2) + ' 子熙幣</span></div>';

        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<div class="reward-card-title"><span class="reward-icon">🏷️</span><strong>' + escapeShopHtml(item.name) + '</strong></div>' +
                '<span class="reward-rarity">' + escapeShopHtml(rarityLabel(item.rarity)) + '</span>' +
            '</div>' +
            '<div class="reward-card-meta desc">' + escapeShopHtml(item.shopDescription || item.description || '成就與榮譽的象徵。') + '</div>' +
            priceHtml +
            '<div class="reward-card-actions"><button class="btn-primary compact-btn" onclick="buyShopTitle(\'' + escapeShopHtml(item.id) + '\')">購買稱號</button></div>' +
            '</div>';
    }).join('');
}

function setShopTitleCategory(cat) {
    shopTitleCategory = cat;
    renderTitleShop(shopState && shopState.catalog ? shopState.catalog.titles : []);
}

function renderShopGuide(catalog) {
    var listEl = document.getElementById('reward-guide-list');
    if (!listEl || !catalog) return;
    var all = [];
    (catalog.shopItems || []).forEach(function(it) { all.push({ item: it, label: '道具' }); });
    (catalog.titles || []).forEach(function(it) { all.push({ item: it, label: '稱號' }); });

    listEl.innerHTML = all.map(function (entry) {
        return '<div class="guide-card">' +
            '<div class="guide-card-head"><strong>' + escapeShopHtml(entry.item.name) + '</strong><span class="guide-card-type">' + escapeShopHtml(entry.label) + '</span></div>' +
            '<div class="guide-card-detail">' + escapeShopHtml(entry.item.shopDescription || entry.item.description || '暫無說明') + '</div>' +
            '</div>';
    }).join('');
}

function refreshShop() {
    if (shopBusy) return;
    shopBusy = true;
    setShopStatus('同步商店資訊中...', false);
    shopApi('summary')
        .then(function (data) {
            if (!data || !data.success) throw new Error(data.error || '同步失敗');
            shopState = data;
            renderShopItems(data.catalog.shopItems);
            renderTitleShop(data.catalog.titles);
            setShopStatus('商店已更新', false);
        })
        .catch(function (e) { setShopStatus('錯誤: ' + e.message, true); })
        .finally(function () { shopBusy = false; });
}

function buyShopItem(id) {
    setShopStatus('購買中...', false);
    shopApi('buy', { shopItemId: id })
        .then(function (data) {
            if (!data || !data.success) throw new Error(data.error || '購買失敗');
            refreshBalance();
            showResultModal(data.purchased.name);
            refreshShop();
            showShopToast('購買成功', false);
        })
        .catch(function (e) { showShopToast(e.message, true); });
}

function buyShopTitle(id) {
    setShopStatus('購買稱號中...', false);
    shopApi('buy_title', { titleId: id })
        .then(function (data) {
            if (!data || !data.success) throw new Error(data.error || '購買失敗');
            refreshBalance();
            showResultModal(data.purchasedTitle.name);
            refreshShop();
            showShopToast('稱號已購買', false);
        })
        .catch(function (e) { showShopToast(e.message, true); });
}

function showResultModal(name) {
    document.getElementById('reward-result-list').innerHTML = '<div class="reward-result-item">' + escapeShopHtml(name) + ' x1</div>';
    document.getElementById('reward-result-modal').classList.remove('hidden');
}

function closeRewardResultModal() {
    document.getElementById('reward-result-modal').classList.add('hidden');
}

function initShopPage() {
    refreshShop();
}
