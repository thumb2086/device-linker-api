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
        vip: '等級',
        special: '特別'
    };
    return map[String(category || '').toLowerCase()] || String(category || '全部');
}

function escapeRewardsHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseRewardDateMs(value, fallback) {
    if (!value) return fallback;
    var ts = Date.parse(String(value || ''));
    return Number.isFinite(ts) ? ts : fallback;
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

function renderCampaigns(items) {
    var listEl = document.getElementById('campaign-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">目前沒有可領取活動</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var limitReached = !!item.claimLimitReached;
        var claimedText = '已領 ' + String(item.claimCount || 0) + ' / ' + String(item.claimLimitPerUser || 1) + ' 次';
        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<strong>' + escapeRewardsHtml(item.title) + '</strong>' +
                '<span class="reward-rarity' + (limitReached ? ' reward-rarity-muted' : '') + '">' + escapeRewardsHtml(limitReached ? '已達上限' : '活動') + '</span>' +
            '</div>' +
            '<div class="reward-card-copy">' + escapeRewardsHtml(item.description || '限時登入領取') + '</div>' +
            '<div class="reward-card-meta">時間：' + escapeRewardsHtml(formatRewardDateTime(item.startAt) || '即刻開始') + ' ~ ' + escapeRewardsHtml(formatRewardDateTime(item.endAt) || '不限結束') + '</div>' +
            '<div class="reward-card-meta">' + escapeRewardsHtml(claimedText) + '</div>' +
            '<div class="reward-card-meta">獎勵：' + escapeRewardsHtml(rewardItemSummary(item.rewards).join(' / ') || '未設定') + '</div>' +
            '<div class="reward-card-actions">' +
                '<button class="' + (limitReached ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="' + (limitReached ? 'return false' : ('claimRewardCampaign(\'' + escapeRewardsHtml(item.id) + '\')')) + '"' + (limitReached ? ' disabled' : '') + '>' + (limitReached ? '已達上限' : '立即領取') + '</button>' +
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
            '<div class="reward-card-meta desc">' + escapeRewardsHtml(item.description || '此道具暫無功能說明。') + '</div>' +
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
    var ownedTitleMap = {};
    (((rewardsState || {}).profile || {}).titles || []).forEach(function (item) {
        if (item && item.id) ownedTitleMap[item.id] = true;
    });
    var sellableTitles = (items || []).filter(function (item) {
        return !!item && item.shopEnabled === true && Number(item.shopPrice || 0) > 0 && !ownedTitleMap[item.id];
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
            '<div class="reward-card-meta desc">' + escapeRewardsHtml(item.shopDescription || item.description || '成就與榮譽的象徵。') + '</div>' +
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

function showRewardResultModal(title, bundle, extraEntries) {
    var entries = rewardItemSummary(bundle);
    if (Array.isArray(extraEntries) && extraEntries.length) {
        entries = entries.concat(extraEntries);
    }
    renderRewardResultEntries(title, entries);
}

function showPurchaseModal(item) {
    if (!item) return;
    renderRewardResultEntries('商品已入庫', [item.name + ' x1']);
}


function renderYjcExchange(yjcVip) {
    var cardEl = document.getElementById('yjc-exchange-card');
    var balanceEl = document.getElementById('yjc-balance-label');
    if (!cardEl || !balanceEl) return;
    var data = yjcVip || {};
    var balance = Number(data.balance || 0);
    if (!Number.isFinite(balance) || balance < 0) balance = 0;
    cardEl.style.display = 'grid';
    balanceEl.innerText = '目前佑戩幣：' + formatCompactZh(Math.floor(balance), 2);
    if (data.available === false && data.source === 'missing_contract') {
        cardEl.style.display = 'none';
    }
}

function exchangeYjc() {
    var inputEl = document.getElementById('yjc-zxc-amount');
    var amount = Number(inputEl && inputEl.value || 0);
    if (!Number.isFinite(amount) || amount < 100000000) {
        setRewardsStatus('兌換至少需要 100,000,000 子熙幣', true);
        showRewardsToast('兌換至少需要 100,000,000 子熙幣', true);
        return;
    }

    setRewardsStatus('佑戩幣兌換中...', false);
    rewardsApi('exchange_yjc', { zxcAmount: amount })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '佑戩幣兌換失敗');
            applyRewardsState(data);
            refreshBalance();
            setRewardsStatus('兌換成功：+' + String(data.yjcAmount || 0) + ' 佑戩幣', false);
            showRewardsToast('兌換成功：+' + String(data.yjcAmount || 0) + ' 佑戩幣', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function applyRewardsState(data) {
    rewardsState = data || null;
    if (!data || !data.profile) return;
    renderIdentity(data.profile);
    renderCampaigns(data.campaigns || []);
    renderShop(data.catalog && data.catalog.shopItems ? data.catalog.shopItems : []);
    renderTitleShop(data.catalog && data.catalog.titles ? data.catalog.titles : []);
    renderYjcExchange(data.yjcVip);
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

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

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

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

    rewardsApi('buy_title', { titleId: titleId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '購買稱號失敗');
            applyRewardsState(data);
            refreshBalance();
            showPurchaseModal(data.purchasedTitle);
            setRewardsStatus('稱號已加入收藏', false);
            showRewardsToast('稱號已加入收藏', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
            showRewardsToast(error.message, true);
        });
}

function claimRewardCampaign(campaignId) {
    setRewardsStatus('領取活動獎勵中...', false);

    var btn = event && event.target && event.target.tagName === 'BUTTON' ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = '處理中'; }

    rewardsApi('claim_campaign', { campaignId: campaignId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '領取失敗');
            if (rewardsState) rewardsState.profile = data.profile;
            applyRewardsState(rewardsState);
            refreshBalance();
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
