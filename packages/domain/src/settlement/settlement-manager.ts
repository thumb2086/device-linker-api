// packages/domain/src/settlement/settlement-manager.ts

import { 
  GameSettlement, 
  GameSettlementSchema, 
  TxIntent,
  TokenSymbol
} from "@repo/shared";
import { WalletManager } from "../wallet/wallet-manager.js";

export interface SettlementDomain {
  createSettlement(
    roundId: string,
    userId: string,
    address: string,
    game: string,
    token: TokenSymbol,
    betAmount: string,
    payoutAmount: string,
    requestId?: string
  ): GameSettlement;
  
  resolveSettlement(
    settlement: GameSettlement,
    betTxHash?: string,
    payoutTxHash?: string
  ): GameSettlement;

  failSettlement(
    settlement: GameSettlement,
    error: string
  ): GameSettlement;
}

export class SettlementManager implements SettlementDomain {
  constructor(private walletManager: WalletManager) {}

  createSettlement(
    roundId: string,
    userId: string,
    address: string,
    game: string,
    token: TokenSymbol,
    betAmount: string,
    payoutAmount: string,
    requestId?: string
  ): GameSettlement {
    const betNum = parseFloat(betAmount);
    const payoutNum = parseFloat(payoutAmount);
    const netResultNum = payoutNum - betNum;
    
    return GameSettlementSchema.parse({
      id: crypto.randomUUID(),
      roundId,
      userId,
      address: address.toLowerCase(),
      game,
      token,
      betAmount,
      payoutAmount,
      netResult: netResultNum.toString(),
      multiplier: betNum > 0 ? (payoutNum / betNum).toString() : "0",
      isWin: payoutNum > betNum,
      status: "pending",
      settledAt: new Date(),
    });
  }

  resolveSettlement(
    settlement: GameSettlement,
    betTxHash?: string,
    payoutTxHash?: string
  ): GameSettlement {
    return GameSettlementSchema.parse({
      ...settlement,
      status: "settled",
      betTxHash: betTxHash || settlement.betTxHash,
      payoutTxHash: payoutTxHash || settlement.payoutTxHash,
      settledAt: new Date(),
    });
  }

  failSettlement(
    settlement: GameSettlement,
    error: string
  ): GameSettlement {
    return GameSettlementSchema.parse({
      ...settlement,
      status: "failed",
      error,
      settledAt: new Date(),
    });
  }

  /**
   * Generates the transaction intents needed for this settlement.
   * This is a "dry" operation that returns what SHOULD happen.
   */
  generateIntents(settlement: GameSettlement, requestId?: string) {
    return this.walletManager.createSettlementIntent(
      settlement.userId,
      settlement.token as any,
      settlement.betAmount,
      settlement.payoutAmount,
      settlement.game,
      settlement.roundId,
      requestId
    );
  }
}
