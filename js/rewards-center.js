var rewardsState = null;
var rewardsBusy = false;
var rewardsTab = 'campaign';

function setRewardsStatus(text, isError) {
    var el = document.getElementById('rewards-status');
    if (!el) return;
    el.innerText = text || '';
    el.style.color = isError ? '#ff7b7b' : '#ffd36a';
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
            '<div class="reward-card-meta">時間：' + escapeRewardsHtml(item.startAt || '即刻開始') + ' ~ ' + escapeRewardsHtml(item.endAt || '不限結束') + '</div>' +
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
            '<div class="reward-card-meta">售價：' + formatCompactZh(item.price, 2) + ' 子熙幣</div>' +
            '<div class="reward-card-actions">' +
                '<button class="btn-primary compact-btn" onclick="buyRewardItem(\'' + escapeRewardsHtml(item.id) + '\')">購買</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function renderInventoryGroup(listId, items, emptyText) {
    var listEl = document.getElementById(listId);
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">' + escapeRewardsHtml(emptyText) + '</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var actionBtn = '';
        if (item.type === 'buff') {
            actionBtn = '<button class="btn-primary compact-btn" onclick="useRewardItem(\'' + escapeRewardsHtml(item.itemId) + '\')">啟用</button>';
        } else if (item.type === 'chest' || item.type === 'key') {
            actionBtn = '<button class="btn-primary compact-btn" onclick="openRewardChest(\'' + escapeRewardsHtml(item.itemId) + '\')">開啟</button>';
        }
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><strong>' + escapeRewardsHtml(item.name) + '</strong><span class="reward-rarity">' + escapeRewardsHtml(rarityLabel(item.rarity)) + '</span></div>' +
            '<div class="reward-card-copy">' + escapeRewardsHtml(item.description || '') + '</div>' +
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
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><strong>' + escapeRewardsHtml(item.effectType) + '</strong><span class="reward-rarity">啟用中</span></div>' +
            '<div class="reward-card-meta">到期：' + escapeRewardsHtml(item.expiresAt || '不限時') + '</div>' +
            '<div class="reward-card-meta">剩餘次數：' + escapeRewardsHtml(String(item.remainingUses || 0)) + '</div>' +
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
    renderShop(data.catalog && data.catalog.shopItems ? data.catalog.shopItems : []);
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
    Promise.all([
        rewardsApi('summary'),
        rewardsApi('list_campaigns')
    ])
        .then(function (results) {
            var summaryData = results[0];
            var campaignData = results[1];
            if (!summaryData || !summaryData.success) throw new Error((summaryData && summaryData.error) || '獎勵中心同步失敗');
            if (!campaignData || !campaignData.success) throw new Error((campaignData && campaignData.error) || '活動資料同步失敗');
            summaryData.campaigns = (campaignData.campaigns || []).filter(isCampaignActiveNow);
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
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
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
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
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
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
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
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
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
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
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
            refreshRewardsCenter();
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
        });
}

function initRewardsCenterPage() {
    switchRewardsTab('campaign');
    refreshRewardsCenter();
}
