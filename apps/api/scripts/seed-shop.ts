import { rewardCatalogRepo } from '@repo/infrastructure';

const SHOP_ITEMS = [
  {
    type: 'avatar',
    itemId: 'combo_starter',
    name: '新手上路組合包',
    nameEn: 'Starter Pack',
    description: '內含經典籌碼頭像 + 新手稱號 + 50 ZXC + 經驗加倍(1h)',
    rarity: 'common',
    source: 'shop',
    price: 500,
    isActive: true,
    meta: {
      bundle: [
        { id: 'avatar_chip', qty: 1 },
        { id: 'title_newbie', qty: 1 },
        { id: 'token_50', qty: 1 },
        { id: 'buff_xp_1h', qty: 1 },
      ],
      totalValue: 850,
    },
  },
  {
    type: 'avatar',
    itemId: 'combo_lucky',
    name: '幸運組合包',
    nameEn: 'Lucky Pack',
    description: '內含幸運星稱號 + 250 ZXC + 幸運加成(1h) + 免輸護符(3次)',
    rarity: 'rare',
    source: 'shop',
    price: 1200,
    isActive: true,
    meta: {
      bundle: [
        { id: 'title_lucky', qty: 1 },
        { id: 'token_250', qty: 1 },
        { id: 'buff_luck_1h', qty: 1 },
        { id: 'buff_prevent_loss_3', qty: 1 },
      ],
      totalValue: 1600,
    },
  },
  {
    type: 'avatar',
    itemId: 'combo_xp',
    name: '升級組合包',
    nameEn: 'XP Pack',
    description: '內含 500 ZXC + 經驗加倍(4h) + 幸運加成(2h) + 免輸護符(5次)',
    rarity: 'epic',
    source: 'shop',
    price: 2500,
    isActive: true,
    meta: {
      bundle: [
        { id: 'token_500', qty: 1 },
        { id: 'buff_xp_4h', qty: 1 },
        { id: 'buff_luck_2h', qty: 1 },
        { id: 'buff_prevent_loss_5', qty: 1 },
      ],
      totalValue: 3800,
    },
  },
  {
    type: 'avatar',
    itemId: 'combo_zxc_v1',
    name: '子熙幣超值包',
    nameEn: 'ZXC Value Pack',
    description: '內含 10000 ZXC + 5000 ZXC + 10000 ZXC 三包，一次滿足！',
    rarity: 'mythic',
    source: 'shop',
    price: 15000,
    isActive: true,
    meta: {
      bundle: [
        { id: 'token_10000', qty: 1 },
        { id: 'token_5000', qty: 1 },
        { id: 'token_10000', qty: 1 },
      ],
      totalValue: 25000,
    },
  },
];

async function main() {
  console.log('🌱 Seeding shop items...');
  for (const item of SHOP_ITEMS) {
    try {
      await rewardCatalogRepo.upsert(item);
      console.log(`  ✅ ${item.itemId} — ${item.name}`);
    } catch (err: any) {
      console.error(`  ❌ ${item.itemId} — ${err.message}`);
    }
  }
  console.log('✅ Seed complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
