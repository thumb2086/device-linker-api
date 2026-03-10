var inventoryState = null;
var inventoryBusy = false;
var inventoryTab = 'item';
var inventoryToastSeq = 0;

function setInventoryStatus(text, isError) {
    var el = document.getElementById('inventory-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#ffd36a';
}

function showInventoryToast(text, isError) {
    var stackEl = document.getElementById('inventory-toast-stack');
    if (!stackEl || !text) return;

    inventoryToastSeq += 1;
    var toastEl = document.createElement('div');
    toastEl.className = 'inventory-toast ' + (isError ? 'error' : 'success');
    toastEl.innerHTML =
        '<strong class="inventory-toast-title">' + (isError ? '背包通知' : '操作成功') + '</strong>' +
        '<div class="inventory-toast-copy">' + escapeInventoryHtml(text) + '</div>';
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

function inventoryApi(action, payload) {
    return fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
            action: action,
            sessionId: user.sessionId
        }, payload || {}))
    }).then(function (res) { return res.json(); });
}

function rarityLabel(rarity) {
    var map = {
        common: '普通',
        rare: '稀有',
        super_rare: '超稀有',
        epic: '史詩',
        mythic: '神話',
        legendary: '傳奇'
    };
    return map[String(rarity || '').toLowerCase()] || String(rarity || '普通');
}

function inventoryTypeLabel(item) {
    if (!item) return '物品';
    if (item.type === 'buff') return 'Buff 道具';
    if (item.type === 'chest') return '寶箱';
    if (item.type === 'key') return '補給箱';
    return item.type || '物品';
}

function escapeInventoryHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function inventoryCatalogMap(kind) {
    var items = inventoryState && inventoryState.catalog ? inventoryState.catalog[kind] : [];
    var map = {};
    (items || []).forEach(function (item) {
        if (!item || !item.id) return;
        map[item.id] = item;
    });
    return map;
}

var inventoryItemGuideMap = {
    profit_boost_small: ['效果：15 分鐘內淨盈利 x2', '上限：總加成最多 2,000 萬', '適用：單人遊戲結算'],
    profit_boost_large: ['效果：30 分鐘內淨盈利 x2', '上限：總加成最多 5 億', '適用：單人遊戲結算'],
    loss_shield_single: ['效果：失敗時返還本金 1 次', '限制：按次數保護，不設金額上限', '適用：單人遊戲結算'],
    loss_shield_triple: ['效果：失敗時返還本金 3 次', '限制：按次數保護，不設金額上限', '適用：單人遊戲結算'],
    loss_shield_timed: ['效果：15 分鐘內最多保護 3 次失敗', '限制：按次數保護，不設金額上限', '適用：單人遊戲結算'],
    luck_boost: ['效果：提高寶箱高稀有獎勵權重', '限制：不直接提高遊戲勝率', '適用：寶箱 / 額外掉落'],
    rare_chest: ['用途：開啟稀有獎勵池', '可得：子熙幣、基礎 Buff、頭像、稱號'],
    super_rare_chest: ['用途：開啟超稀有獎勵池', '可得：進階 Buff、稀有外觀、稱號'],
    epic_chest: ['用途：開啟史詩獎勵池', '可得：高價 Buff、史詩外觀、稱號'],
    mythic_chest: ['用途：開啟神話獎勵池', '可得：高價值道具、神話稱號、外觀'],
    legendary_chest: ['用途：開啟傳奇獎勵池', '可得：頂級 Buff、傳奇稱號、限定外觀'],
    basic_key: ['用途：開啟普通補給箱', '可得：基礎資源、Buff 或額外寶箱'],
    advanced_key: ['用途：開啟高級補給箱', '可得：進階 Buff、稱號或高價值資源'],
    master_key: ['用途：開啟萬用補給箱', '可得：高階稱號、傳奇資源與頂級 Buff']
};

function getInventoryItemGuideLines(item, type) {
    if (!item) return [];
    var lines = [];
    if (type === 'item') {
        var guideLines = inventoryItemGuideMap[item.id];
        if (guideLines && guideLines.length) {
            lines = guideLines.slice();
        }
    }

    if (!lines.length) {
        if (item.description || item.shopDescription) {
            lines.push(item.description || item.shopDescription);
        }
    }

    if (type === 'avatar') lines.push('類型：頭像外觀');
    if (type === 'title') lines.push('類型：成就稱號');
    return lines;
}

function renderInventoryGuide(catalog) {
    var listEl = document.getElementById('inventory-guide-list');
    if (!listEl || !catalog) return;

    var allEntries = [];
    (catalog.shopItems || []).forEach(function(it) { allEntries.push({ item: it, type: 'item', label: '道具' }); });
    (catalog.avatars || []).forEach(function(it) { allEntries.push({ item: it, type: 'avatar', label: '頭像' }); });
    (catalog.titles || []).forEach(function(it) { allEntries.push({ item: it, type: 'title', label: '稱號' }); });

    if (!allEntries.length) {
        listEl.innerHTML = '<div class="guide-empty">目前沒有可顯示的說明</div>';
        return;
    }

    listEl.innerHTML = allEntries.map(function (entry) {
        var item = entry.item;
        var lines = getInventoryItemGuideLines(item, entry.type);
        if (!lines.length) return '';

        return '<div class="guide-card">' +
            '<div class="guide-card-head"><strong>' + escapeInventoryHtml(item.name) + '</strong><span class="guide-card-type">' + escapeInventoryHtml(entry.label) + '</span></div>' +
            '<div class="guide-card-detail-list">' +
                lines.map(function(line) { return '<div class="guide-card-detail">' + escapeInventoryHtml(line) + '</div>'; }).join('') +
            '</div>' +
            '</div>';
    }).join('');
}

function renderInventoryGroup(listId, items, emptyText) {
    var listEl = document.getElementById(listId);
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="inventory-empty">' + escapeInventoryHtml(emptyText) + '</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var actionBtn = '';
        if (item.type === 'buff') {
            actionBtn = '<button class="btn-primary compact-btn" onclick="useInventoryItem(\'' + escapeInventoryHtml(item.itemId) + '\')">啟用</button>';
        } else if (item.type === 'chest' || item.type === 'key') {
            actionBtn = '<button class="btn-primary compact-btn" onclick="openInventoryChest(\'' + escapeInventoryHtml(item.itemId) + '\')">開啟</button>';
        }
        return '<div class="inventory-card">' +
            '<div class="inventory-card-head"><strong>' + escapeInventoryHtml(item.name) + '</strong><span class="inventory-rarity">' + escapeInventoryHtml(rarityLabel(item.rarity)) + '</span></div>' +
            '<div class="inventory-card-meta desc">' + escapeInventoryHtml(item.description || '此道具暫無功能說明。') + '</div>' +
            '<div class="inventory-card-meta">持有數量：' + formatDisplayNumber(item.qty, 0) + '</div>' +
            '<div class="inventory-card-actions">' + actionBtn + '</div>' +
            '</div>';
    }).join('');
}

function renderInventory(items) {
    var boxItems = [];
    var buffItems = [];
    var otherItems = [];

    (items || []).forEach(function (item) {
        if (item.type === 'chest' || item.type === 'key') boxItems.push(item);
        else if (item.type === 'buff') buffItems.push(item);
        else otherItems.push(item);
    });

    renderInventoryGroup('inventory-box-list', boxItems, '尚未持有可開啟箱子');
    renderInventoryGroup('inventory-buff-list', buffItems, '尚未持有 Buff 道具');
    renderInventoryGroup('inventory-other-list', otherItems, '目前沒有其他道具');
}

function renderAvatars(items, profile) {
    var listEl = document.getElementById('avatar-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="inventory-empty">尚未擁有其他頭像</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var isSelected = profile && profile.selectedAvatarId === item.id;
        return '<div class="inventory-card">' +
            '<div class="inventory-card-head"><div class="inventory-card-title"><span class="inventory-icon">' + escapeInventoryHtml(item.icon) + '</span><strong>' + escapeInventoryHtml(item.name) + '</strong></div><span class="inventory-rarity">' + escapeInventoryHtml(rarityLabel(item.rarity)) + '</span></div>' +
            '<div class="inventory-card-meta desc">' + escapeInventoryHtml(item.description || '個人外觀裝飾，可於聊天與榜單顯示。') + '</div>' +
            '<div class="inventory-card-meta">來源：' + escapeInventoryHtml(item.source || 'unknown') + '</div>' +
            '<div class="inventory-card-actions">' +
                '<button class="' + (isSelected ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="equipInventoryAvatar(\'' + escapeInventoryHtml(item.id) + '\')">' + (isSelected ? '使用中' : '裝備') + '</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function renderTitles(items, profile) {
    var listEl = document.getElementById('title-list');
    if (!listEl) return;
    var titleCards = [];
    titleCards.push('<div class="inventory-card">' +
        '<div class="inventory-card-head"><strong>VIP 自動稱號</strong><span class="inventory-rarity">預設</span></div>' +
        '<div class="inventory-card-meta desc">系統根據您當前的 VIP 等級自動分配的榮譽稱號。</div>' +
        '<div class="inventory-card-meta">卸下目前稱號後，會回到依 VIP 等級自動顯示的稱號。</div>' +
        '<div class="inventory-card-actions">' +
            '<button class="' + (!profile || !profile.selectedTitleId ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="equipInventoryTitle(\'\')">' + (!profile || !profile.selectedTitleId ? '目前使用中' : '卸下稱號') + '</button>' +
        '</div>' +
        '</div>');

    if (items && items.length) {
        titleCards = titleCards.concat(items.map(function (item) {
            var isSelected = profile && profile.selectedTitleId === item.id;
            var expireText = item.expiresAt ? ('到期：' + item.expiresAt) : '永久稱號';
            return '<div class="inventory-card">' +
                '<div class="inventory-card-head"><strong>' + escapeInventoryHtml(item.name) + '</strong><span class="inventory-rarity">' + escapeInventoryHtml(rarityLabel(item.rarity)) + '</span></div>' +
                '<div class="inventory-card-meta desc">' + escapeInventoryHtml(item.description || '成就與榮譽的象徵。') + '</div>' +
                '<div class="inventory-card-meta">來源：' + escapeInventoryHtml(item.source || 'unknown') + ' / ' + escapeInventoryHtml(expireText) + '</div>' +
                '<div class="inventory-card-actions">' +
                    '<button class="' + (isSelected ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="equipInventoryTitle(\'' + escapeInventoryHtml(item.id) + '\')">' + (isSelected ? '使用中' : '裝備') + '</button>' +
                '</div>' +
                '</div>';
        }));
    }
    listEl.innerHTML = titleCards.join('');
}

function renderBuffs(items) {
    var listEl = document.getElementById('buff-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="inventory-empty">目前沒有啟用中的 Buff</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var remainingUsesText = (item.remainingUses === null || item.remainingUses === undefined) ? '無次數限制' : String(item.remainingUses);
        var buffName = item.effectType === 'profit_boost' ? '獲利翻倍' : (item.effectType === 'loss_shield' ? '免損護盾' : (item.effectType === 'luck_boost' ? '幸運增幅' : item.effectType));
        return '<div class="inventory-card">' +
            '<div class="inventory-card-head"><strong>' + escapeInventoryHtml(buffName) + '</strong><span class="inventory-rarity">啟用中</span></div>' +
            '<div class="inventory-card-meta">到期：' + escapeInventoryHtml(item.expiresAt || '不限時') + '</div>' +
            '<div class="inventory-card-meta">剩餘次數：' + escapeInventoryHtml(remainingUsesText) + '</div>' +
            '</div>';
    }).join('');
}

function switchInventoryTab(tabName) {
    inventoryTab = String(tabName || 'item');
    document.querySelectorAll('.inventory-nav-btn').forEach(function (button) {
        button.classList.toggle('active', button.getAttribute('data-tab') === inventoryTab);
    });
    document.querySelectorAll('.inventory-panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === inventoryTab);
    });
}

function applyInventoryState(data) {
    inventoryState = data || null;
    if (!data || !data.profile) return;
    renderIdentity(data.profile);
    renderInventory(data.profile.inventory || []);
    renderAvatars(data.profile.avatars || [], data.profile);
    renderTitles(data.profile.titles || [], data.profile);
    renderBuffs(data.profile.activeBuffs || []);
}

function refreshInventory() {
    if (inventoryBusy) return;
    inventoryBusy = true;
    setInventoryStatus('同步背包中...', false);
    inventoryApi('summary')
        .then(function (summaryData) {
            if (!summaryData || !summaryData.success) throw new Error((summaryData && summaryData.error) || '背包同步失敗');
            applyInventoryState(summaryData);
            setInventoryStatus('背包已更新', false);
        })
        .catch(function (error) {
            setInventoryStatus('錯誤: ' + error.message, true);
        })
        .finally(function () {
            inventoryBusy = false;
        });
}

function useInventoryItem(itemId) {
    setInventoryStatus('啟用道具中...', false);

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

    inventoryApi('use_item', { itemId: itemId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '啟用失敗');
            if (inventoryState) inventoryState.profile = data.profile;
            applyInventoryState(inventoryState);
            switchInventoryTab('buff');
            setInventoryStatus('道具已啟用', false);
            showInventoryToast('道具已啟用', false);
        })
        .catch(function (error) {
            setInventoryStatus('錯誤: ' + error.message, true);
            showInventoryToast(error.message, true);
        });
}

function openInventoryChest(itemId) {
    setInventoryStatus('開啟獎勵箱中...', false);

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

    inventoryApi('open_chest', { chestItemId: itemId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '開啟失敗');
            if (inventoryState) inventoryState.profile = data.profile;
            applyInventoryState(inventoryState);
            refreshBalance();
            switchInventoryTab('item');
            showRewardResultModal(data.chestName || '獎勵已取得', data.rewards);
            setInventoryStatus('獎勵已開啟', false);
            showInventoryToast('獎勵已開啟', false);
        })
        .catch(function (error) {
            setInventoryStatus('錯誤: ' + error.message, true);
            showInventoryToast(error.message, true);
        });
}

function equipInventoryAvatar(avatarId) {
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

    inventoryApi('equip_avatar', { avatarId: avatarId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '裝備頭像失敗');
            if (inventoryState) inventoryState.profile = data.profile;
            applyInventoryState(inventoryState);
            setInventoryStatus('頭像已裝備', false);
            showInventoryToast('頭像已裝備', false);
        })
        .catch(function (error) {
            setInventoryStatus('錯誤: ' + error.message, true);
            showInventoryToast(error.message, true);
        });
}

function equipInventoryTitle(titleId) {
    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

    inventoryApi('equip_title', { titleId: titleId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '裝備稱號失敗');
            if (inventoryState) inventoryState.profile = data.profile;
            applyInventoryState(inventoryState);
            setInventoryStatus('稱號已裝備', false);
            showInventoryToast(titleId ? '稱號已裝備' : '已切回 VIP 自動稱號', false);
        })
        .catch(function (error) {
            setInventoryStatus('錯誤: ' + error.message, true);
            showInventoryToast(error.message, true);
        });
}

function showRewardResultModal(title, bundle) {
    var titleEl = document.getElementById('reward-result-title');
    var listEl = document.getElementById('reward-result-list');
    var modalEl = document.getElementById('reward-result-modal');
    if (!titleEl || !listEl || !modalEl) return;

    titleEl.innerText = title || '獎勵到手';
    var entries = [];
    if (bundle && Array.isArray(bundle.items)) {
        bundle.items.forEach(function(it) { entries.push(it.id + ' x' + it.qty); });
    }
    if (bundle && Array.isArray(bundle.avatars)) {
        bundle.avatars.forEach(function(it) { entries.push('頭像：' + it); });
    }
    if (bundle && Array.isArray(bundle.titles)) {
        bundle.titles.forEach(function(it) { entries.push('稱號：' + (it.id || it)); });
    }
    if (bundle && bundle.tokens) {
        entries.push(bundle.tokens + ' 子熙幣');
    }

    if (!entries.length) {
        listEl.innerHTML = '<div class="reward-result-item">已完成，本次沒有可顯示獎勵</div>';
    } else {
        listEl.innerHTML = entries.map(function (entry) {
            return '<div class="reward-result-item">' + escapeInventoryHtml(entry) + '</div>';
        }).join('');
    }
    modalEl.classList.remove('hidden');
}

function closeRewardResultModal() {
    var modalEl = document.getElementById('reward-result-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function initInventoryPage() {
    refreshInventory();
}
