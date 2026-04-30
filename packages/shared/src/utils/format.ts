export const formatNumber = (num: number | string, mode: 'short' | 'full' = 'short'): string => {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0';

  if (mode === 'full') {
    return n.toLocaleString('zh-TW');
  }

  if (Math.abs(n) >= 100000000) {
    return `${(n / 100000000).toFixed(2)} 億`;
  }
  if (Math.abs(n) >= 10000) {
    return `${(n / 10000).toFixed(2)} 萬`;
  }

  return n.toLocaleString('zh-TW');
};

export const formatCurrency = (num: number | string): string => {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
