export const formatNumber = (num: number | string, mode: 'short' | 'full' = 'short'): string => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '0';

    if (mode === 'full') {
        return n.toLocaleString();
    }

    // In Chinese contexts, 10,000 is '1萬'
    if (n >= 100000000) {
        return (n / 100000000).toFixed(2) + ' 億';
    }
    if (n >= 10000) {
        return (n / 10000).toFixed(1) + ' 萬';
    }

    return n.toLocaleString();
};

export const formatCurrency = (num: number | string): string => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '0.00';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
