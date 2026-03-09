var rewardsState = null;
var rewardsBusy = false;
var rewardsTab = 'campaign';
var rewardsToastSeq = 0;
var rewardTitleShopCategory = 'all';

function setRewardsStatus(text, isError) {
    var el = document.getElementById('rewards-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#ffd36a';
}

function showRewardsToast(text, isError) {
    var stackEl = document.getElementById('rewards-toast-stack');
    if (!stackEl || !text) return;

    rewardsToastSeq += 1;
    var toastEl = document.createElement('div');
    toastEl.className = 'rewards-toast ' + (isError ? 'error' : 'success');
    toastEl.innerHTML =
        '<strong class="rewards-toast-title">' + (isError ? '操作失敗' : '操作成功') + '</strong>' +
        '<div class="rewards-toast-copy">' + escapeRewardsHtml(text) + '</div>';
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

function rewardsApi(action, payload) {
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

function rewardTitleCategoryLabel(category) {
    var map = {
        all: '全部',
        featured: '精選',
        achievement: '成就',
        event: '活動',
        vip: 'VIP',
        special: '特別'
    };
    return map[String(category || '').toLowerCase()] || String(category || '全部');
}

var rewardItemGuideMap = {
    profit_boost_small: [
        '效果：15 分鐘內淨盈利 x2',
        '上限：總加成最多 2,000 萬',
        '適用：單人遊戲結算'
    ],
    profit_boost_large: [
        '效果：30 分鐘內淨盈利 x2',
        '上限：總加成最多 5 億',
        '適用：單人遊戲結算'
    ],
    loss_shield_single: [
        '效果：失敗時返還本金 1 次',
        '限制：按次數保護，不設金額上限',
        '適用：單人遊戲結算'
    ],
    loss_shield_triple: [
        '效果：失敗時返還本金 3 次',
        '限制：按次數保護，不設金額上限',
        '適用：單人遊戲結算'
    ],
    loss_shield_timed: [
        '效果：15 分鐘內最多保護 3 次失敗',
        '限制：按次數保護，不設金額上限',
        '適用：單人遊戲結算'
    ],
    luck_boost: [
        '效果：提高寶箱高稀有獎勵權重',
        '限制：不直接提高遊戲勝率',
        '適用：寶箱 / 額外掉落'
    ],
    rare_chest: [
        '用途：開啟稀有獎勵池',
        '可得：子熙幣、基礎 Buff、頭像、稱號'
    ],
    super_rare_chest: [
        '用途：開啟超稀有獎勵池',
        '可得：進階 Buff、稀有外觀、稱號'
    ],
    epic_chest: [
        '用途：開啟史詩獎勵池',
        '可得：高價 Buff、史詩外觀、稱號'
    ],
    mythic_chest: [
        '用途：開啟神話獎勵池',
        '可得：高價值道具、神話稱號、外觀'
    ],
    legendary_chest: [
        '用途：開啟傳奇獎勵池',
        '可得：頂級 Buff、傳奇稱號、限定外觀'
    ],
    basic_key: [
        '用途：開啟普通補給箱',
        '可得：基礎資源、Buff 或額外寶箱'
    ],
    advanced_key: [
        '用途：開啟高級補給箱',
        '可得：進階 Buff、稱號或高價值資源'
    ],
    master_key: [
        '用途：開啟萬用補給箱',
        '可得：高階稱號、傳奇資源與頂級 Buff'
    ]
};

function rewardTypeLabel(item) {
    if (!item) return '物品';
    if (item.type === 'buff') return 'Buff 道具';
    if (item.type === 'chest') return '寶箱';
    if (item.type === 'key') return '補給箱';
    return item.type || '物品';
}

function escapeRewardsHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderIdentity(profile) {
    var avatarEl = document.getElementById('identity-avatar');
    var titleEl = document.getElementById('identity-title');
    var avatarNameEl = document.getElementById('identity-avatar-name');
    if (avatarEl) avatarEl.innerText = profile && profile.avatar ? profile.avatar.icon : '🪙';
    if (titleEl) titleEl.innerText = profile && profile.title ? profile.title.name : 'VIP 自動稱號';
    if (avatarNameEl) avatarNameEl.innerText = profile && profile.avatar ? profile.avatar.name : '經典籌碼';
}

function parseRewardDateMs(value, fallback) {
    if (!value) return fallback;
    var ts = Date.parse(String(value || ''));
    return Number.isFinite(ts) ? ts : fallback;
}

function isCampaignActiveNow(item) {
    if (!item || item.isActive === false) return false;
    var now = Date.now();
    var startAt = parseRewardDateMs(item.startAt, Number.NEGATIVE_INFINITY);
    var endAt = parseRewardDateMs(item.endAt, Number.POSITIVE_INFINITY);
    return startAt <= now && endAt >= now;
}

function formatRewardDateTime(value) {
    if (!value) return '';
    var date = new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) return String(value || '');
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function rewardCatalogMap(kind) {
    var items = rewardsState && rewardsState.catalog ? rewardsState.catalog[kind] : [];
    var map = {};
    (items || []).forEach(function (item) {
        if (!item || !item.id) return;
        map[item.id] = item;
    });
    return map;
}

function rewardItemSummary(bundle) {
    var labels = [];
    var itemMap = rewardCatalogMap('shopItems');
    var avatarMap = rewardCatalogMap('avatars');
    var titleMap = rewardCatalogMap('titles');
    if (bundle && Array.isArray(bundle.items)) {
        labels = labels.concat(bundle.items.map(function (entry) {
            var itemId = String(entry.id || '-');
            var label = itemMap[itemId] && itemMap[itemId].name ? itemMap[itemId].name : itemId;
            return label + ' x' + String(entry.qty || 1);
        }));
    }
    if (bundle && Array.isArray(bundle.avatars)) {
        labels = labels.concat(bundle.avatars.map(function (entry) {
            var avatarId = String(entry || '');
            return avatarMap[avatarId] && avatarMap[avatarId].name ? avatarMap[avatarId].name : avatarId;
        }));
    }
    if (bundle && Array.isArray(bundle.titles)) {
        labels = labels.concat(bundle.titles.map(function (entry) {
            var titleId = typeof entry === 'string' ? entry : String(entry && entry.id || '');
            return titleMap[titleId] && titleMap[titleId].name ? titleMap[titleId].name : (titleId || '-');
        }));
    }
    if (bundle && bundle.tokens) {
        labels.push(formatCompactZh(bundle.tokens, 2) + ' 子熙幣');
    }
    return labels;
}

function getRewardItemGuideLines(item) {
    if (!item) return [];
    var guideLines = rewardItemGuideMap[item.id];
    if (guideLines && guideLines.length) return guideLines.slice();
    var lines = [];
    if (item.description) lines.push(item.description);
    if (item.type) lines.push('類型：' + rewardTypeLabel(item));
    return lines;
}

function renderRewardItemDetailsHtml(item) {
    var lines = getRewardItemGuideLines(item);
    if (!lines.length) return '';
    return '<div class="reward-card-detail-list">' + lines.map(function (line) {
        return '<div class="reward-card-detail">' + escapeRewardsHtml(line) + '</div>';
    }).join('') + '</div>';
}

function renderItemGuide(items) {
    var listEl = document.getElementById('item-guide-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">目前沒有可顯示的物品說明</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><strong>' + escapeRewardsHtml(item.name) + '</strong><span class="reward-rarity">' + escapeRewardsHtml(rewardTypeLabel(item)) + '</span></div>' +
            renderRewardItemDetailsHtml(item) +
            '</div>';
    }).join('');
}

function renderCampaigns(items) {
    var listEl = document.getElementById('campaign-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">目前沒有可領取活動</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<strong>' + escapeRewardsHtml(item.title) + '</strong>' +
                '<span class="reward-rarity">活動</span>' +
            '</div>' +
            '<div class="reward-card-copy">' + escapeRewardsHtml(item.description || '限時登入領取') + '</div>' +
            '<div class="reward-card-meta">時間：' + escapeRewardsHtml(formatRewardDateTime(item.startAt) || '即刻開始') + ' ~ ' + escapeRewardsHtml(formatRewardDateTime(item.endAt) || '不限結束') + '</div>' +
            '<div class="reward-card-meta">獎勵：' + escapeRewardsHtml(rewardItemSummary(item.rewards).join(' / ') || '未設定') + '</div>' +
            '<div class="reward-card-actions">' +
                '<button class="btn-primary compact-btn" onclick="claimRewardCampaign(\'' + escapeRewardsHtml(item.id) + '\')">立即領取</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function renderShop(items) {
    var listEl = document.getElementById('shop-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">商店目前沒有商品</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var icon = item.type === 'chest' ? '🎁' : item.type === 'key' ? '🗝️' : '✨';
        var typeLabel = item.type === 'key' ? '補給箱' : item.type;
        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<div class="reward-card-title">' +
                    '<span class="reward-icon">' + icon + '</span>' +
                    '<div><strong>' + escapeRewardsHtml(item.name) + '</strong><div class="reward-card-meta">' + escapeRewardsHtml(typeLabel) + '</div></div>' +
                '</div>' +
                '<span class="reward-rarity">' + escapeRewardsHtml(rarityLabel(item.rarity)) + '</span>' +
            '</div>' +
            '<div class="reward-card-copy">' + escapeRewardsHtml(item.description || '') + '</div>' +
            renderRewardItemDetailsHtml(item) +
            '<div class="reward-card-meta">售價：' + formatCompactZh(item.price, 2) + ' 子熙幣</div>' +
            '<div class="reward-card-actions">' +
                '<button class="btn-primary compact-btn" onclick="buyRewardItem(\'' + escapeRewardsHtml(item.id) + '\')">購買</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function renderTitleShop(items) {
    var listEl = document.getElementById('title-shop-list');
    var filterEl = document.getElementById('title-shop-filter');
    if (!listEl) return;
    var sellableTitles = (items || []).filter(function (item) {
        return !!item && item.shopEnabled === true && Number(item.shopPrice || 0) > 0;
    });

    var categories = [{ value: 'all', label: '全部' }];
    var seenCategories = { all: true };
    sellableTitles.forEach(function (item) {
        var key = String(item.shopCategory || 'featured');
        if (seenCategories[key]) return;
        seenCategories[key] = true;
        categories.push({ value: key, label: rewardTitleCategoryLabel(key) });
    });
    if (!seenCategories[rewardTitleShopCategory]) {
        rewardTitleShopCategory = 'all';
    }
    if (filterEl) {
        filterEl.innerHTML = categories.map(function (item) {
            return '<button class="reward-filter-chip' + (rewardTitleShopCategory === item.value ? ' active' : '') + '" onclick="setRewardTitleShopCategory(\'' + escapeRewardsHtml(item.value) + '\')">' + escapeRewardsHtml(item.label) + '</button>';
        }).join('');
    }

    if (!sellableTitles.length) {
        listEl.innerHTML = '<div class="reward-empty">目前沒有上架稱號</div>';
        return;
    }

    sellableTitles = sellableTitles
        .filter(function (item) {
            return rewardTitleShopCategory === 'all' || String(item.shopCategory || 'featured') === rewardTitleShopCategory;
        })
        .sort(function (left, right) {
            var priorityDiff = Number(right.shopPriority || 0) - Number(left.shopPriority || 0);
            if (priorityDiff !== 0) return priorityDiff;
            var saleDiff = Number(!!right.saleActive) - Number(!!left.saleActive);
            if (saleDiff !== 0) return saleDiff;
            var priceDiff = Number(left.effectiveShopPrice || left.shopPrice || 0) - Number(right.effectiveShopPrice || right.shopPrice || 0);
            if (priceDiff !== 0) return priceDiff;
            return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant');
        });

    if (!sellableTitles.length) {
        listEl.innerHTML = '<div class="reward-empty">這個分類目前沒有上架稱號</div>';
        return;
    }

    listEl.innerHTML = sellableTitles.map(function (item) {
        var saleMeta = '';
        if (item.saleActive) {
            saleMeta = '<div class="reward-card-price sale"><span class="price-now">' + formatCompactZh(item.effectiveShopPrice, 2) + ' 子熙幣</span><span class="price-old">' + formatCompactZh(item.shopPrice, 2) + ' 子熙幣</span></div>';
        } else {
            saleMeta = '<div class="reward-card-price"><span class="price-now">' + formatCompactZh(item.effectiveShopPrice || item.shopPrice, 2) + ' 子熙幣</span></div>';
        }
        var saleWindow = '';
        if (item.saleActive || item.saleStartAt || item.saleEndAt) {
            saleWindow = '<div class="reward-card-meta">折扣時間：' + escapeRewardsHtml(formatRewardDateTime(item.saleStartAt) || '立即開始') + ' ~ ' + escapeRewardsHtml(formatRewardDateTime(item.saleEndAt) || '不限結束') + '</div>';
        }
        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<div class="reward-card-title">' +
                    '<span class="reward-icon">🏷️</span>' +
                    '<div><strong>' + escapeRewardsHtml(item.name) + '</strong><div class="reward-card-meta">' + escapeRewardsHtml(rarityLabel(item.rarity)) + ' 稱號</div></div>' +
                '</div>' +
                '<span class="reward-rarity">' + escapeRewardsHtml(item.saleActive ? '限時折扣' : (item.showOnLeaderboard ? '榜單可顯示' : '個人收藏')) + '</span>' +
            '</div>' +
            '<div class="reward-card-copy">' + escapeRewardsHtml(item.shopDescription || item.description || '永久稱號，購買後會直接加入稱號收藏。') + '</div>' +
            '<div class="reward-card-meta">分類：' + escapeRewardsHtml(rewardTitleCategoryLabel(item.shopCategory || 'featured')) + ' / 來源：' + escapeRewardsHtml(item.source || 'shop') + '</div>' +
            saleMeta +
            saleWindow +
            '<div class="reward-card-actions">' +
                '<button class="btn-primary compact-btn" onclick="buyRewardTitle(\'' + escapeRewardsHtml(item.id) + '\')">購買稱號</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function setRewardTitleShopCategory(category) {
    rewardTitleShopCategory = String(category || 'all');
    renderTitleShop(rewardsState && rewardsState.catalog ? rewardsState.catalog.titles : []);
}

function renderInventoryGroup(listId, items, emptyText) {
    var listEl = document.getElementById(listId);
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">' + escapeRewardsHtml(emptyText) + '</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var catalogItem = rewardCatalogMap('shopItems')[item.itemId] || item;
        var actionBtn = '';
        if (item.type === 'buff') {
            actionBtn = '<button class="btn-primary compact-btn" onclick="useRewardItem(\'' + escapeRewardsHtml(item.itemId) + '\')">啟用</button>';
        } else if (item.type === 'chest' || item.type === 'key') {
            actionBtn = '<button class="btn-primary compact-btn" onclick="openRewardChest(\'' + escapeRewardsHtml(item.itemId) + '\')">開啟</button>';
        }
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><strong>' + escapeRewardsHtml(item.name) + '</strong><span class="reward-rarity">' + escapeRewardsHtml(rarityLabel(item.rarity)) + '</span></div>' +
            '<div class="reward-card-copy">' + escapeRewardsHtml(item.description || '') + '</div>' +
            renderRewardItemDetailsHtml(catalogItem) +
            '<div class="reward-card-meta">持有數量：' + formatDisplayNumber(item.qty, 0) + '</div>' +
            '<div class="reward-card-actions">' + actionBtn + '</div>' +
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
        listEl.innerHTML = '<div class="reward-empty">尚未擁有其他頭像</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var isSelected = profile && profile.selectedAvatarId === item.id;
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><div class="reward-card-title"><span class="reward-icon">' + escapeRewardsHtml(item.icon) + '</span><strong>' + escapeRewardsHtml(item.name) + '</strong></div><span class="reward-rarity">' + escapeRewardsHtml(rarityLabel(item.rarity)) + '</span></div>' +
            '<div class="reward-card-meta">來源：' + escapeRewardsHtml(item.source || 'unknown') + '</div>' +
            '<div class="reward-card-actions">' +
                '<button class="' + (isSelected ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="equipRewardAvatar(\'' + escapeRewardsHtml(item.id) + '\')">' + (isSelected ? '使用中' : '裝備') + '</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function renderTitles(items, profile) {
    var listEl = document.getElementById('title-list');
    if (!listEl) return;
    var titleCards = [];
    titleCards.push('<div class="reward-card">' +
        '<div class="reward-card-head"><strong>VIP 自動稱號</strong><span class="reward-rarity">預設</span></div>' +
        '<div class="reward-card-meta">卸下目前稱號後，會回到依 VIP 等級自動顯示的稱號。</div>' +
        '<div class="reward-card-actions">' +
            '<button class="' + (!profile || !profile.selectedTitleId ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="equipRewardTitle(\'\')">' + (!profile || !profile.selectedTitleId ? '目前使用中' : '卸下稱號') + '</button>' +
        '</div>' +
        '</div>');

    if (items && items.length) {
        titleCards = titleCards.concat(items.map(function (item) {
        var isSelected = profile && profile.selectedTitleId === item.id;
        var expireText = item.expiresAt ? ('到期：' + item.expiresAt) : '永久稱號';
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><strong>' + escapeRewardsHtml(item.name) + '</strong><span class="reward-rarity">' + escapeRewardsHtml(rarityLabel(item.rarity)) + '</span></div>' +
            '<div class="reward-card-meta">來源：' + escapeRewardsHtml(item.source || 'unknown') + ' / ' + escapeRewardsHtml(expireText) + '</div>' +
            (item.shopDescription ? '<div class="reward-card-copy">' + escapeRewardsHtml(item.shopDescription) + '</div>' : '') +
            '<div class="reward-card-actions">' +
                '<button class="' + (isSelected ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="equipRewardTitle(\'' + escapeRewardsHtml(item.id) + '\')">' + (isSelected ? '使用中' : '裝備') + '</button>' +
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
        listEl.innerHTML = '<div class="reward-empty">目前沒有啟用中的 Buff</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var remainingUsesText = (item.remainingUses === null || item.remainingUses === undefined) ? '無次數限制' : String(item.remainingUses);
        var buffName = item.effectType === 'profit_boost'
            ? '獲利翻倍'
            : (item.effectType === 'loss_shield'
                ? '免損護盾'
                : (item.effectType === 'luck_boost' ? '幸運增幅' : item.effectType));
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><strong>' + escapeRewardsHtml(buffName) + '</strong><span class="reward-rarity">啟用中</span></div>' +
            '<div class="reward-card-meta">到期：' + escapeRewardsHtml(item.expiresAt || '不限時') + '</div>' +
            '<div class="reward-card-meta">剩餘次數：' + escapeRewardsHtml(remainingUsesText) + '</div>' +
            '</div>';
    }).join('');
}

function switchRewardsTab(tabName) {
    rewardsTab = String(tabName || 'campaign');
    document.querySelectorAll('.rewards-nav-btn').forEach(function (button) {
        button.classList.toggle('active', button.getAttribute('data-tab') === rewardsTab);
    });
    document.querySelectorAll('.rewards-panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === rewardsTab);
    });
}

function renderRewardResultEntries(title, entries) {
    var titleEl = document.getElementById('reward-result-title');
    var listEl = document.getElementById('reward-result-list');
    var modalEl = document.getElementById('reward-result-modal');
    if (!titleEl || !listEl || !modalEl) return;

    titleEl.innerText = title || '獎勵到手';
    if (!entries || !entries.length) {
        listEl.innerHTML = '<div class="reward-result-item">已完成，本次沒有可顯示獎勵</div>';
    } else {
        listEl.innerHTML = entries.map(function (entry) {
            return '<div class="reward-result-item">' + escapeRewardsHtml(entry) + '</div>';
        }).join('');
    }
    modalEl.classList.remove('hidden');
}

function closeRewardResultModal() {
    var modalEl = document.getElementById('reward-result-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function showRewardResultModal(title, bundle) {
    renderRewardResultEntries(title, rewardItemSummary(bundle));
}

function showPurchaseModal(item) {
    if (!item) return;
    renderRewardResultEntries('商品已入庫', [item.name + ' x1']);
}

function applyRewardsState(data) {
    rewardsState = data || null;
    if (!data || !data.profile) return;
    renderIdentity(data.profile);
    renderCampaigns(data.campaigns || []);
    renderItemGuide(data.catalog && data.catalog.shopItems ? data.catalog.shopItems : []);
    renderShop(data.catalog && data.catalog.shopItems ? data.catalog.shopItems : []);
    renderTitleShop(data.catalog && data.catalog.titles ? data.catalog.titles : []);
    renderInventory(data.profile.inventory || []);
    renderAvatars(data.profile.avatars || [], data.profile);
    renderTitles(data.profile.titles || [], data.profile);
    renderBuffs(data.profile.activeBuffs || []);
    switchRewardsTab(rewardsTab);
}

function refreshRewardsCenter() {
    if (rewardsBusy) return;
    rewardsBusy = true;
    setRewardsStatus('同步獎勵中心中...', false);
    rewardsApi('summary')
        .then(function (summaryData) {
            if (!summaryData || !summaryData.success) throw new Error((summaryData && summaryData.error) || '獎勵中心同步失敗');
            applyRewardsState(summaryData);
            setRewardsStatus('獎勵中心已更新', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
        })
        .finally(function () {
            rewardsBusy = false;
        });
}

function buyRewardItem(itemId) {
    setRewardsStatus('購買商品中...', false);
    rewardsApi('buy', { shopItemId: itemId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '購買失敗');
            applyRewardsState(data);
            refreshBalance();
            showPurchaseModal(data.purchased);
            setRewardsStatus('商品已入庫', false);
            showRewardsToast('商品已入庫', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function buyRewardTitle(titleId) {
    setRewardsStatus('購買稱號中...', false);
    rewardsApi('buy_title', { titleId: titleId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '購買稱號失敗');
            applyRewardsState(data);
            refreshBalance();
            showPurchaseModal(data.purchasedTitle);
            switchRewardsTab('title');
            setRewardsStatus('稱號已加入收藏', false);
            showRewardsToast('稱號已加入收藏', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function useRewardItem(itemId) {
    setRewardsStatus('啟用道具中...', false);
    rewardsApi('use_item', { itemId: itemId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '啟用失敗');
            if (rewardsState) rewardsState.profile = data.profile;
            applyRewardsState(rewardsState);
            switchRewardsTab('buff');
            setRewardsStatus('道具已啟用', false);
            showRewardsToast('道具已啟用', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function openRewardChest(itemId) {
    setRewardsStatus('開啟獎勵箱中...', false);
    rewardsApi('open_chest', { chestItemId: itemId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '開啟失敗');
            if (rewardsState) rewardsState.profile = data.profile;
            applyRewardsState(rewardsState);
            refreshBalance();
            switchRewardsTab('inventory');
            showRewardResultModal(data.chestName || '獎勵已取得', data.rewards);
            setRewardsStatus('獎勵已開啟', false);
            showRewardsToast('獎勵已開啟', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function equipRewardAvatar(avatarId) {
    rewardsApi('equip_avatar', { avatarId: avatarId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '裝備頭像失敗');
            if (rewardsState) rewardsState.profile = data.profile;
            applyRewardsState(rewardsState);
            switchRewardsTab('avatar');
            setRewardsStatus('頭像已裝備', false);
            showRewardsToast('頭像已裝備', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function equipRewardTitle(titleId) {
    rewardsApi('equip_title', { titleId: titleId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '裝備稱號失敗');
            if (rewardsState) rewardsState.profile = data.profile;
            applyRewardsState(rewardsState);
            switchRewardsTab('title');
            setRewardsStatus('稱號已裝備', false);
            showRewardsToast(titleId ? '稱號已裝備' : '已切回 VIP 自動稱號', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function claimRewardCampaign(campaignId) {
    setRewardsStatus('領取活動獎勵中...', false);
    rewardsApi('claim_campaign', { campaignId: campaignId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '領取失敗');
            if (rewardsState) rewardsState.profile = data.profile;
            applyRewardsState(rewardsState);
            refreshBalance();
            switchRewardsTab('campaign');
            showRewardResultModal(data.campaign && data.campaign.title ? data.campaign.title : '活動獎勵', data.campaign && data.campaign.rewards ? data.campaign.rewards : {});
            setRewardsStatus('活動獎勵已領取', false);
            showRewardsToast('活動獎勵已領取', false);
            refreshRewardsCenter();
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function initRewardsCenterPage() {
    switchRewardsTab('campaign');
    refreshRewardsCenter();
}
