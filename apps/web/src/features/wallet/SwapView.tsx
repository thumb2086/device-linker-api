import { useEffect, useState, FormEvent } from 'react';
import { ArrowDownUp, Loader2, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';
import { useAuthStore } from '../../store/useAuthStore';

const ZXC_PER_YJC = 100_000_000;

type Direction = 'zxc_to_yjc' | 'yjc_to_zxc';

function formatBalance(raw: string | undefined): string {
  if (!raw) return '0';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export default function SwapView() {
  const { t } = useTranslation();
  const { sessionId, isAuthorized } = useAuthStore();

  const [direction, setDirection] = useState<Direction>('zxc_to_yjc');
  const [inputAmount, setInputAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const [zxcBalance, setZxcBalance] = useState<string>('0');
  const [yjcBalance, setYjcBalance] = useState<string>('0');
  const [loadingBalances, setLoadingBalances] = useState(false);

  async function refreshBalances() {
    if (!sessionId) return;
    setLoadingBalances(true);
    try {
      const res = await api.get('/api/v1/wallet/summary');
      const data = res.data?.data;
      if (data?.balances) {
        setZxcBalance(String(data.balances.zhixi?.balance ?? '0'));
        setYjcBalance(String(data.balances.yjc?.balance ?? '0'));
      }
    } catch {
      // silently swallow; balances remain stale
    } finally {
      setLoadingBalances(false);
    }
  }

  useEffect(() => {
    refreshBalances();
  }, [sessionId]);

  const inputNumeric = Number(inputAmount) || 0;
  const previewAmount =
    direction === 'zxc_to_yjc'
      ? Math.floor(inputNumeric / ZXC_PER_YJC)
      : inputNumeric * ZXC_PER_YJC;
  const fromSymbol = direction === 'zxc_to_yjc' ? 'ZXC' : 'YJC';
  const toSymbol = direction === 'zxc_to_yjc' ? 'YJC' : 'ZXC';
  const fromBalance = direction === 'zxc_to_yjc' ? zxcBalance : yjcBalance;
  const toBalance = direction === 'zxc_to_yjc' ? yjcBalance : zxcBalance;

  function toggle() {
    setDirection((d) => (d === 'zxc_to_yjc' ? 'yjc_to_zxc' : 'zxc_to_yjc'));
    setInputAmount('');
    setResult(null);
  }

  async function handleSwap(e: FormEvent) {
    e.preventDefault();
    if (!sessionId) {
      setResult('請先登入');
      return;
    }
    if (inputNumeric <= 0) {
      setResult('請輸入金額');
      return;
    }
    if (direction === 'zxc_to_yjc' && inputNumeric < ZXC_PER_YJC) {
      setResult(`最少 ${ZXC_PER_YJC.toLocaleString()} ZXC 才能兌換 1 YJC`);
      return;
    }
    if (direction === 'yjc_to_zxc' && inputNumeric < 1) {
      setResult('最少 1 YJC 才能兌換');
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      if (direction === 'zxc_to_yjc') {
        const res = await api.post('/api/v1/wallet/convert', {
          sessionId,
          zxcAmount: String(Math.floor(inputNumeric)),
        });
        const data = res.data?.data;
        if (data?.success) {
          setResult(`兌換成功：${data.requiredZxc} ZXC → ${data.yjcAmount} YJC`);
          setInputAmount('');
          await refreshBalances();
        } else {
          setResult(data?.error?.message || '兌換失敗');
        }
      } else {
        const res = await api.post('/api/v1/wallet/convert/yjc-to-zxc', {
          sessionId,
          yjcAmount: String(Math.floor(inputNumeric)),
        });
        const data = res.data?.data;
        if (data?.success) {
          setResult(`兌換成功：${data.yjcAmount} YJC → ${Number(data.zxcAmount).toLocaleString()} ZXC`);
          setInputAmount('');
          await refreshBalances();
        } else {
          setResult(data?.error?.message || '兌換失敗');
        }
      }
    } catch (err: any) {
      setResult(err?.response?.data?.data?.error?.message || err?.message || '兌換失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <ArrowDownUp className="text-[#fcc025]" />
            <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('swap.title', { defaultValue: '兌換商店' })}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-6">
        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/20">
          <div className="flex items-center gap-2 mb-4">
            <Coins size={18} className="text-[#fcc025]" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white">目前餘額</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#adaaaa]">ZXC 子熙幣</p>
              <p className="text-xl font-black italic mt-2 text-[#fcc025]">{formatBalance(zxcBalance)}</p>
            </div>
            <div className="bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#adaaaa]">YJC 佑戩幣</p>
              <p className="text-xl font-black italic mt-2 text-[#fcc025]">{formatBalance(yjcBalance)}</p>
            </div>
          </div>
        </section>

        <section className="bg-[#1a1919] rounded-2xl p-6 border border-[#fcc025]/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">兌換</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#fcc025]">
              固定匯率：1 YJC = {ZXC_PER_YJC.toLocaleString()} ZXC
            </p>
          </div>

          {!isAuthorized && (
            <p className="text-sm text-[#adaaaa] mb-4">請先登入後再兌換。</p>
          )}

          <form onSubmit={handleSwap} className="space-y-4">
            <div className="bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#adaaaa]">支付</span>
                <span className="text-[10px] text-[#adaaaa]">餘額 {formatBalance(fromBalance)} {fromSymbol}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value.replace(/[^\d]/g, ''))}
                  className="flex-1 bg-transparent text-2xl font-black italic text-white focus:outline-none"
                  placeholder="0"
                />
                <span className="text-sm font-black text-[#fcc025]">{fromSymbol}</span>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={toggle}
                className="w-10 h-10 rounded-full bg-[#fcc025] text-[#0e0e0e] flex items-center justify-center"
                aria-label="切換方向"
              >
                <ArrowDownUp size={16} />
              </button>
            </div>

            <div className="bg-[#0e0e0e] rounded-xl p-4 border border-[#494847]/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#adaaaa]">收到</span>
                <span className="text-[10px] text-[#adaaaa]">餘額 {formatBalance(toBalance)} {toSymbol}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-2xl font-black italic text-[#fcc025]">
                  {previewAmount > 0 ? previewAmount.toLocaleString() : '0'}
                </span>
                <span className="text-sm font-black text-[#fcc025]">{toSymbol}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !isAuthorized || inputNumeric <= 0 || previewAmount <= 0}
              className="w-full bg-[#fcc025] text-[#0e0e0e] font-black uppercase tracking-widest text-xs py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              確認兌換
            </button>

            {result && (
              <p className="text-xs text-[#fcc025] text-center">{result}</p>
            )}
          </form>

          <div className="mt-4 text-[11px] text-[#adaaaa] space-y-1">
            <p>• 匯率固定為 1 YJC = {ZXC_PER_YJC.toLocaleString()} ZXC（1 億子熙幣）</p>
            <p>• 手續費：0</p>
            <p>• 雙向兌換，兌換以整數為單位，小數部分自動捨去</p>
            <p>• 兌換直接上鏈，最終金額以鏈上交易為準</p>
            {loadingBalances && <p className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> 載入餘額中...</p>}
          </div>
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
