function formatVipCompact(value) {
    if (typeof formatCompactZh === 'function') {
        return formatCompactZh(value, 2);
    }
    return String(value || 0);
}

function initVipPage(data) {
    renderVipPage(data && data.yjcVip ? data.yjcVip : null);
}

function renderVipPage(yjcVip) {
    var data = yjcVip || {};
    var tier = data.tier || {};
    var balance = Number(data.balance || 0);
    if (!Number.isFinite(balance) || balance < 0) balance = 0;

    var tierLabelEl = document.getElementById('vip-tier-label');
    var tierDescEl = document.getElementById('vip-tier-desc');
    var balanceEl = document.getElementById('vip-yjc-balance');
    var balanceMetaEl = document.getElementById('vip-yjc-meta');
    var roomAccessEl = document.getElementById('vip-room-access');
    var roomMetaEl = document.getElementById('vip-room-meta');

    var tierLabel = tier.label || '一般會員';
    var roomText = '公共大廳、公共桌';
    var roomMeta = '尚未解鎖 VIP 大廳與 VIP 桌，可先前往活動與商店兌換佑戩幣。';
    var desc = '目前尚未達到 YJC VIP 房門檻。';

    if (tier.key === 'vip1') {
        roomText = 'VIP 大廳、VIP 一號桌';
        roomMeta = '已解鎖 VIP 大廳與 VIP 一號桌，可直接進入對應房間。';
        desc = '已解鎖 VIP 1，可使用 VIP 聊天室與一號桌權限。';
    } else if (tier.key === 'vip2') {
        roomText = 'VIP 大廳、VIP 一號桌、二號桌';
        roomMeta = '已解鎖 VIP 2，享有 VIP 大廳、二號桌與零手續費規則。';
        desc = '已達最高 VIP 房門檻，可進入 VIP 二號桌。';
    }

    if (data.available === false && data.source === 'missing_contract') {
        desc = '佑戩幣合約尚未部署，目前僅顯示規則說明。';
        roomMeta = '待合約部署後，會自動恢復鏈上 VIP 判定。';
        balanceMetaEl.innerText = '目前合約未部署，YJC 餘額同步暫停。';
    } else if (balanceMetaEl) {
        balanceMetaEl.innerText = '每 100,000,000 子熙幣可兌換 1 YJC。';
    }

    if (tierLabelEl) tierLabelEl.innerText = tierLabel;
    if (tierDescEl) tierDescEl.innerText = desc;
    if (balanceEl) balanceEl.innerText = formatVipCompact(Math.floor(balance));
    if (roomAccessEl) roomAccessEl.innerText = roomText;
    if (roomMetaEl) roomMetaEl.innerText = roomMeta;
}
