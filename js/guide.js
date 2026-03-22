import { getVipTierOptions } from '../lib/vip.js';

function formatZhAmount(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return '0';

    const units = [
        { value: 10000000000000000, label: '京' },
        { value: 1000000000000, label: '兆' },
        { value: 100000000, label: '億' },
        { value: 10000, label: '萬' }
    ];

    for (let index = 0; index < units.length; index += 1) {
        const unit = units[index];
        if (amount >= unit.value && amount % unit.value === 0) {
            return amount / unit.value + ' ' + unit.label;
        }
    }

    return amount.toLocaleString('zh-TW');
}

function buildThresholdLabel(tiers, tier, index) {
    if (index === 0) {
        const nextTier = tiers[index + 1];
        return nextTier ? '未滿 ' + formatZhAmount(nextTier.threshold) : '未滿門檻';
    }
    return formatZhAmount(tier.threshold);
}

function buildTierRows(tiers) {
    return tiers.map(function (tier, index) {
        return (
            '<div class="guide-row">' +
                '<span>' + tier.label + '</span>' +
                '<strong>' + buildThresholdLabel(tiers, tier, index) + '</strong>' +
            '</div>'
        );
    }).join('');
}

function buildMaxBetRows(tiers) {
    return tiers.map(function (tier) {
        return (
            '<div class="guide-row">' +
                '<span>' + tier.label + '</span>' +
                '<strong>' + formatZhAmount(tier.maxBet) + ' 子熙幣</strong>' +
            '</div>'
        );
    }).join('');
}

function renderVipGuide() {
    const tiers = getVipTierOptions();
    const tierListEl = document.getElementById('vip-tier-guide-list');
    const maxBetListEl = document.getElementById('vip-maxbet-guide-list');
    if (!tierListEl || !maxBetListEl) return;

    tierListEl.innerHTML = buildTierRows(tiers);
    maxBetListEl.innerHTML = buildMaxBetRows(tiers);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVipGuide, { once: true });
} else {
    renderVipGuide();
}
