export class VipBetLevelService {
  constructor(private readonly baseFeeRate = 0.02) {}

  calculateFee(betAmount: string, feeDiscountRate = 0): number {
    const betNum = parseFloat(betAmount);
    const baseFee = (Number.isFinite(betNum) ? betNum : 0) * this.baseFeeRate;
    const discount = Math.min(1, Math.max(0, feeDiscountRate));
    return baseFee * (1 - discount);
  }
}
