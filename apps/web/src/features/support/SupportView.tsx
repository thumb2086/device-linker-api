import { LifeBuoy, Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppBottomNav from '../../components/AppBottomNav';

export default function SupportView() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <LifeBuoy className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('support.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        {/* 開發中提示 */}
        <section className="bg-[#1a1919] rounded-2xl p-8 border border-[#fcc025]/20 flex flex-col items-center gap-4 shadow-2xl">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#fcc025]/30 bg-[#262626]">
            <Construction size={40} className="text-[#fcc025]" />
          </div>
          <h2 className="text-xl font-black uppercase italic tracking-tight text-white">
            即時客服開發中
          </h2>
          <p className="text-center text-sm font-bold text-[#adaaaa]">
            線上客服、工單系統與系統協定文件正在建置中，預計近期上線
          </p>
        </section>
      </main>

      {/* Bottom Nav Bar */}
      <AppBottomNav current="none" />
    </div>
  );
}
