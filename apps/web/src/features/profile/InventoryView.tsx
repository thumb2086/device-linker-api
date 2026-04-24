import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppBottomNav from '../../components/AppBottomNav';
import ChestView from '../inventory/ChestView';

export default function InventoryView() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Package className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
              {t('inventory.title')}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl pt-20">
        <ChestView />
      </main>

      <AppBottomNav />
    </div>
  );
}
