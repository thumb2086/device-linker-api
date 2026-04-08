import { getOnChainConfig } from "../config/index.js";
import { ViemRepository } from "../repositories/ViemRepository.js";
import { SettlementServiceImpl } from "../services/SettlementServiceImpl.js";

export function createOnChainClients() {
  const config = getOnChainConfig();
  const repo = new ViemRepository(config.rpcUrl, config.adminPrivateKey);
  const settlement = new SettlementServiceImpl(repo);
  return { repo, settlement, config };
}
