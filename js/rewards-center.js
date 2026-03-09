var rewardsState = null;
var rewardsBusy = false;

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

function renderCampaigns(items) {
    var listEl = document.getElementById('campaign-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">目前沒有可領取活動</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var rewardLabels = [];
        if (item.rewards && Array.isArray(item.rewards.items)) {
            rewardLabels = rewardLabels.concat(item.rewards.items.map(function (entry) {
                return entry.id + ' x' + entry.qty;
            }));
        }
        if (item.rewards && Array.isArray(item.rewards.avatars)) {
            rewardLabels = rewardLabels.concat(item.rewards.avatars);
        }
        if (item.rewards && Array.isArray(item.rewards.titles)) {
            rewardLabels = rewardLabels.concat(item.rewards.titles.map(function (entry) {
                return (entry && entry.id) || entry;
            }));
        }
        if (item.rewards && item.rewards.tokens) {
            rewardLabels.push(formatCompactZh(item.rewards.tokens, 2) + ' 子熙幣');
        }

        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<strong>' + escapeRewardsHtml(item.title) + '</strong>' +
                '<span class="reward-rarity">活動</span>' +
            '</div>' +
            '<div class="reward-card-copy">' + escapeRewardsHtml(item.description || '限時登入領取') + '</div>' +
            '<div class="reward-card-meta">時間：' + escapeRewardsHtml(item.startAt || '-') + ' ~ ' + escapeRewardsHtml(item.endAt || '-') + '</div>' +
            '<div class="reward-card-meta">獎勵：' + escapeRewardsHtml(rewardLabels.join(' / ') || '未設定') + '</div>' +
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
        return '<div class="reward-card">' +
            '<div class="reward-card-head">' +
                '<div class="reward-card-title">' +
                    '<span class="reward-icon">' + (item.type === 'chest' ? '🎁' : item.type === 'key' ? '🗝️' : '✨') + '</span>' +
                    '<div><strong>' + escapeRewardsHtml(item.name) + '</strong><div class="reward-card-meta">' + escapeRewardsHtml(item.type) + '</div></div>' +
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

function renderInventory(items) {
    var listEl = document.getElementById('inventory-list');
    if (!listEl) return;
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">目前背包是空的</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var actionBtn = '';
        if (item.type === 'buff') {
            actionBtn = '<button class="btn-primary compact-btn" onclick="useRewardItem(\'' + escapeRewardsHtml(item.itemId) + '\')">啟用</button>';
        } else if (item.type === 'chest') {
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
    if (!items || !items.length) {
        listEl.innerHTML = '<div class="reward-empty">尚未持有可裝備稱號</div>';
        return;
    }

    listEl.innerHTML = items.map(function (item) {
        var isSelected = profile && profile.selectedTitleId === item.id;
        var expireText = item.expiresAt ? ('到期：' + item.expiresAt) : '永久稱號';
        return '<div class="reward-card">' +
            '<div class="reward-card-head"><strong>' + escapeRewardsHtml(item.name) + '</strong><span class="reward-rarity">' + escapeRewardsHtml(rarityLabel(item.rarity)) + '</span></div>' +
            '<div class="reward-card-meta">來源：' + escapeRewardsHtml(item.source || 'unknown') + ' / ' + escapeRewardsHtml(expireText) + '</div>' +
            '<div class="reward-card-actions">' +
                '<button class="' + (isSelected ? 'btn-secondary' : 'btn-primary') + ' compact-btn" onclick="equipRewardTitle(\'' + escapeRewardsHtml(item.id) + '\')">' + (isSelected ? '使用中' : '裝備') + '</button>' +
            '</div>' +
            '</div>';
    }).join('');
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
}

function refreshRewardsCenter() {
    if (rewardsBusy) return;
    rewardsBusy = true;
    setRewardsStatus('同步獎勵中心中...', false);
    rewardsApi('summary')
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '獎勵中心同步失敗');
            applyRewardsState(data);
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
            setRewardsStatus('道具已啟用', false);
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
        });
}

function openRewardChest(itemId) {
    setRewardsStatus('開啟寶箱中...', false);
    rewardsApi('open_chest', { chestItemId: itemId })
        .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.error) || '開箱失敗');
            if (rewardsState) rewardsState.profile = data.profile;
            applyRewardsState(rewardsState);
            refreshBalance();
            setRewardsStatus('寶箱已開啟：' + (data.rewardRarity || 'reward'), false);
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
            setRewardsStatus('活動獎勵已領取', false);
            refreshRewardsCenter();
        })
        .catch(function (error) {
            setRewardsStatus('錯誤: ' + error.message, true);
        });
}

function initRewardsCenterPage() {
    refreshRewardsCenter();
}
