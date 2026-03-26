export const MARKET_SYMBOLS = {
    AAPL: { name: "Apple", basePrice: 185, volatility: 0.035, phase: 3 },
    NVDA: { name: "NVIDIA", basePrice: 920, volatility: 0.055, phase: 11 },
    TSLA: { name: "Tesla", basePrice: 215, volatility: 0.075, phase: 17 },
    BTC: { name: "Bitcoin", basePrice: 68000, volatility: 0.095, phase: 79 },
    ETH: { name: "Ethereum", basePrice: 3600, volatility: 0.085, phase: 83 },
    GOLD: { name: "Gold", basePrice: 2050, volatility: 0.018, phase: 89 }
};

export const BANK_ANNUAL_RATE = 0.02;
export const LOAN_ANNUAL_RATE = 0.04;
export const MAX_LEVERAGE = 20;

export const VIP_LEVELS = [
    { threshold: 0, label: "普通會員", maxBet: 1_000 },
    { threshold: 1_000_000, label: "黃金會員", maxBet: 100_000 },
    { threshold: 50_000_000, label: "鑽石等級", maxBet: 2_000_000 },
    { threshold: 100_000_000_000, label: "創世等級", maxBet: 900_000_000 }
];
