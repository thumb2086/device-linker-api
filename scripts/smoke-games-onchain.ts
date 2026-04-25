import { randomUUID } from 'crypto';
import fs from 'fs';

type TokenKey = 'zhixi' | 'yjc';
type ChainClientLike = any;

let runtimeDepsPromise: Promise<{
  requireDb: any;
  ChainClient: any;
  OnchainWalletManager: any;
}> | null = null;

type ApiEnvelope<T = any> = {
  success: boolean;
  data?: T;
  error?: string | { message?: string } | null;
  requestId?: string;
  timestamp?: number;
};

type WalletSummaryPayload = {
  summary?: {
    balances?: {
      ZXC?: string;
      YJC?: string;
    };
  };
  onchain?: {
    zxc?: { balance?: string };
    yjc?: { balance?: string };
  };
};

type StepResult = {
  label: string;
  settled: boolean;
  coveredIntermediate: boolean;
  response: ApiEnvelope<any>;
};

const API_BASE = process.env.SMOKE_API_BASE || 'http://127.0.0.1:3000';
const ZXC_BET = Number(process.env.SMOKE_ZXC_BET || '1');
const YJC_BET = Number(process.env.SMOKE_YJC_BET || '1');
const ZXC_BUFFER = Number(process.env.SMOKE_ZXC_BUFFER || '20');
const VIP_YJC_BUFFER = Number(process.env.SMOKE_VIP_YJC_BUFFER || '5');
const EPSILON = 1e-9;
const TREASURY_TARGET_BALANCE = '10000000000000';
const ROUND_WINDOW_RETRY_MESSAGES = ['本局开奖中', '請等待下一局', '请等待下一局'];

function loadLocalEnvFile(path = '.env.local') {
  if (!fs.existsSync(path)) return;

  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  let skippingMultiline = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (skippingMultiline) {
      if (trimmed.endsWith('"')) {
        skippingMultiline = false;
      }
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Z0-9_]+$/.test(key) || process.env[key]) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (value.startsWith('"') && !value.endsWith('"')) {
      skippingMultiline = true;
      continue;
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function getRuntimeDeps() {
  if (!runtimeDepsPromise) {
    runtimeDepsPromise = (async () => {
      const [{ requireDb, ChainClient }, { OnchainWalletManager }] = await Promise.all([
        import('../packages/infrastructure/src/index.js'),
        import('../packages/domain/src/index.js'),
      ]);
      return { requireDb, ChainClient, OnchainWalletManager };
    })();
  }
  return runtimeDepsPromise;
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>): T {
  return (payload?.data as any)?.data ?? payload?.data ?? (payload as any);
}

function extractError(payload: any): string {
  if (typeof payload?.error === 'string' && payload.error) return payload.error;
  if (typeof payload?.error?.message === 'string' && payload.error.message) return payload.error.message;
  if (typeof payload?.data?.error?.message === 'string' && payload.data.error.message) return payload.data.error.message;
  return 'Unknown API error';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenSymbol(token: TokenKey): 'ZXC' | 'YJC' {
  return token === 'yjc' ? 'YJC' : 'ZXC';
}

function summaryBalance(summary: WalletSummaryPayload, token: TokenKey): number {
  const symbol = tokenSymbol(token);
  const walletValue = Number(summary?.summary?.balances?.[symbol] || 0);
  if (token === 'zhixi') {
    return Number(summary?.onchain?.zxc?.balance ?? walletValue ?? 0);
  }
  return Number(summary?.onchain?.yjc?.balance ?? walletValue ?? 0);
}

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload?.success === false) {
    throw new Error(`${path}: ${extractError(payload)}`);
  }
  return payload;
}

async function apiGet<T>(path: string): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload?.success === false) {
    throw new Error(`${path}: ${extractError(payload)}`);
  }
  return payload;
}

async function fetchWalletSummary(sessionId: string) {
  const payload = await apiGet<WalletSummaryPayload>(`/api/v1/wallet/summary?sessionId=${sessionId}`);
  return unwrapEnvelope(payload);
}

async function getIntentsForRequest(requestId: string | undefined) {
  if (!requestId) return [];
  const { requireDb } = await getRuntimeDeps();
  const db = await requireDb();
  return await db.query.txIntents.findMany({
    where: (txIntents: any, { eq }: any) => eq(txIntents.requestId, requestId),
  });
}

async function assertNoTxArtifacts(step: string, envelope: ApiEnvelope<any>) {
  const data = unwrapEnvelope<any>(envelope);
  if (data?.betTxHash || data?.payoutTxHash) {
    throw new Error(`${step}: unexpected tx hash in non-settled response`);
  }
  const intents = await getIntentsForRequest(envelope.requestId);
  if (intents.length > 0) {
    throw new Error(`${step}: expected no tx intents for non-settled response`);
  }
}

async function verifyOnchainReceipt(chainClient: ChainClientLike, txHash: string, step: string) {
  const receipt = await chainClient.waitForReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${step}: tx ${txHash} missing confirmed receipt`);
  }
}

async function verifySettledStep(params: {
  label: string;
  token: TokenKey;
  chainClient: ChainClientLike;
  sessionId: string;
  address: string;
  beforeSummary: WalletSummaryPayload;
  response: ApiEnvelope<any>;
}) {
  const { label, token, chainClient, sessionId, address, beforeSummary, response } = params;
  const data = unwrapEnvelope<any>(response);
  const betAmount = Number(data?.betAmount || 0);
  const payout = Number(data?.payout || 0);

  if (!data?.betTxHash) {
    throw new Error(`${label}: settled response missing betTxHash`);
  }

  await verifyOnchainReceipt(chainClient, data.betTxHash, label);
  if (payout > 0) {
    if (!data?.payoutTxHash) {
      throw new Error(`${label}: winning response missing payoutTxHash`);
    }
    await verifyOnchainReceipt(chainClient, data.payoutTxHash, label);
  }

  const intents = await getIntentsForRequest(response.requestId);
  if (!intents.length) {
    throw new Error(`${label}: no tx intents persisted for request ${response.requestId}`);
  }

  const pending = intents.filter((intent: any) => intent.status === 'pending');
  if (pending.length > 0) {
    throw new Error(`${label}: found pending tx intents after settlement`);
  }

  const afterSummary = await fetchWalletSummary(sessionId);
  const expectedDelta = payout - betAmount;
  const actualDelta = summaryBalance(afterSummary, token) - summaryBalance(beforeSummary, token);
  if (Math.abs(actualDelta - expectedDelta) > EPSILON) {
    throw new Error(
      `${label}: balance delta mismatch, expected ${expectedDelta}, got ${actualDelta}`
    );
  }

  const { OnchainWalletManager } = await getRuntimeDeps();
  const runtime = new OnchainWalletManager().getRuntimeConfig();
  const tokenRuntime = runtime.tokens[token];
  const decimals = await chainClient.getDecimals(tokenRuntime.contractAddress, 18);
  const onchainBalance = Number(
    chainClient.formatUnits(
      await chainClient.getBalance(address, tokenRuntime.contractAddress),
      decimals
    )
  );
  const summaryOnchainBalance = summaryBalance(afterSummary, token);
  if (Math.abs(onchainBalance - summaryOnchainBalance) > EPSILON) {
    throw new Error(
      `${label}: wallet summary ${summaryOnchainBalance} does not match on-chain balance ${onchainBalance}`
    );
  }

  return {
    label,
    betTxHash: data.betTxHash as string,
    payoutTxHash: (data.payoutTxHash as string | undefined) || null,
    payout,
    requestId: response.requestId,
    intents: intents.map((intent: any) => ({
      id: intent.id,
      type: intent.type,
      status: intent.status,
      token: intent.token,
      txHash: intent.txHash,
    })),
    balanceAfter: summaryOnchainBalance,
  };
}

async function ensureVipYjcLiquidity(sessionId: string, address: string, chainClient: ChainClientLike) {
  await ensureTokenLiquidity(sessionId, address, chainClient, 'yjc', VIP_YJC_BUFFER);
}

async function ensureZxcLiquidity(sessionId: string, address: string, chainClient: ChainClientLike) {
  await ensureTokenLiquidity(sessionId, address, chainClient, 'zhixi', ZXC_BUFFER);
}

async function ensureTokenLiquidity(
  sessionId: string,
  address: string,
  chainClient: ChainClientLike,
  token: TokenKey,
  minimumBalance: number
) {
  const summary = await fetchWalletSummary(sessionId);
  const current = summaryBalance(summary, token);
  if (current >= minimumBalance) return;

  const { OnchainWalletManager } = await getRuntimeDeps();
  const runtime = new OnchainWalletManager().getRuntimeConfig();
  const tokenRuntime = runtime.tokens[token];
  if (!tokenRuntime.enabled) {
    throw new Error(`${token} runtime is not configured`);
  }

  const decimals = await chainClient.getDecimals(tokenRuntime.contractAddress, 18);
  const transferAmount = Math.max(minimumBalance - current, token === 'yjc' ? YJC_BET : ZXC_BET);
  const transferAmountWei = chainClient.parseUnits(String(transferAmount), decimals);
  const treasuryAddress = tokenRuntime.lossPoolAddress || chainClient.getWalletAddress();
  const treasuryBalanceWei = await chainClient.getBalance(treasuryAddress, tokenRuntime.contractAddress);

  if (treasuryBalanceWei < transferAmountWei) {
    const targetBalanceWei = chainClient.parseUnits(TREASURY_TARGET_BALANCE, decimals);
    const refillTargetWei = targetBalanceWei > transferAmountWei ? targetBalanceWei : transferAmountWei;
    const refillAmountWei = refillTargetWei - treasuryBalanceWei;
    const refillTx = await chainClient.mint(treasuryAddress, refillAmountWei, tokenRuntime.contractAddress);
    const refillReceipt = await refillTx.wait();
    if (!refillReceipt || refillReceipt.status !== 1) {
      throw new Error(`Failed to top up ${token} treasury for smoke test`);
    }
  }

  const tx = await chainClient.adminTransfer(
    treasuryAddress,
    address,
    transferAmountWei,
    tokenRuntime.contractAddress
  );
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Failed to adminTransfer ${token} liquidity for smoke test`);
  }

  await fetchWalletSummary(sessionId);
}

async function registerSmokeUser() {
  const username = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const password = `Smoke_${randomUUID().slice(0, 10)}!`;
  const payload = await apiPost('/api/v1/auth/custody/register', {
    username,
    password,
    platform: 'codex-smoke',
    clientType: 'smoke-script',
    deviceId: 'codex',
    appVersion: 'smoke',
  });
  const data = unwrapEnvelope<any>(payload);
  return {
    username,
    password,
    sessionId: data.sessionId as string,
    address: data.address as string,
  };
}

async function runSettledGame(params: {
  label: string;
  path: string;
  body: Record<string, unknown>;
  token: TokenKey;
  sessionId: string;
  address: string;
  chainClient: ChainClientLike;
  retryOnMessages?: string[];
  maxAttempts?: number;
}) {
  const beforeSummary = await fetchWalletSummary(params.sessionId);
  const retryOnMessages = params.retryOnMessages || [];
  const maxAttempts = params.maxAttempts || 1;
  let response: ApiEnvelope<any> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await apiPost(params.path, params.body);
      break;
    } catch (error: any) {
      const message = String(error?.message || error);
      const shouldRetry = retryOnMessages.some((pattern) => message.includes(pattern));
      if (!shouldRetry || attempt === maxAttempts) {
        throw error;
      }
      await sleep(2000);
    }
  }

  if (!response) {
    throw new Error(`${params.label}: failed to obtain a settled response`);
  }

  const verification = await verifySettledStep({
    label: params.label,
    token: params.token,
    chainClient: params.chainClient,
    sessionId: params.sessionId,
    address: params.address,
    beforeSummary,
    response,
  });

  return {
    label: params.label,
    settled: true,
    coveredIntermediate: false,
    response,
    verification,
  };
}

async function runBlackjack(sessionId: string, address: string, chainClient: ChainClientLike) {
  const beforeSummary = await fetchWalletSummary(sessionId);
  let coveredIntermediate = false;
  let settledResponse: ApiEnvelope<any> | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const start = await apiPost('/api/v1/games/blackjack/play', {
      sessionId,
      betAmount: ZXC_BET,
      action: 'start',
      token: 'zhixi',
    });
    const startData = unwrapEnvelope<any>(start);

    if (startData?.status === 'in_progress') {
      coveredIntermediate = true;
      await assertNoTxArtifacts('blackjack:start', start);
      settledResponse = await apiPost('/api/v1/games/blackjack/play', {
        sessionId,
        betAmount: ZXC_BET,
        action: 'stand',
        state: startData,
        token: 'zhixi',
      });
      break;
    }

    settledResponse = start;
    break;
  }

  if (!settledResponse) {
    throw new Error('blackjack: failed to produce a settled response');
  }

  const verification = await verifySettledStep({
    label: 'blackjack',
    token: 'zhixi',
    chainClient,
    sessionId,
    address,
    beforeSummary,
    response: settledResponse,
  });

  return { label: 'blackjack', settled: true, coveredIntermediate, response: settledResponse, verification };
}

async function runCrash(sessionId: string, address: string, chainClient: ChainClientLike) {
  const beforeSummary = await fetchWalletSummary(sessionId);
  const start = await apiPost('/api/v1/games/crash/play', {
    sessionId,
    betAmount: ZXC_BET,
    elapsedSeconds: 0,
    cashout: false,
    token: 'zhixi',
  });
  const startData = unwrapEnvelope<any>(start);

  let coveredIntermediate = false;
  let settledResponse = start;

  if (!startData?.crashed && !startData?.betTxHash) {
    coveredIntermediate = true;
    await assertNoTxArtifacts('crash:start', start);
    settledResponse = await apiPost('/api/v1/games/crash/play', {
      sessionId,
      betAmount: ZXC_BET,
      elapsedSeconds: 5,
      cashout: true,
      token: 'zhixi',
    });
  }

  const verification = await verifySettledStep({
    label: 'crash',
    token: 'zhixi',
    chainClient,
    sessionId,
    address,
    beforeSummary,
    response: settledResponse,
  });

  return { label: 'crash', settled: true, coveredIntermediate, response: settledResponse, verification };
}

async function main() {
  loadLocalEnvFile();
  const { ChainClient, OnchainWalletManager } = await getRuntimeDeps();
  const runtime = new OnchainWalletManager().getRuntimeConfig();
  if (!runtime.rpcUrl || !runtime.adminPrivateKey) {
    throw new Error('Missing RPC_URL or ADMIN_PRIVATE_KEY');
  }

  const chainClient = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
  const { sessionId, address, username } = await registerSmokeUser();

  await ensureZxcLiquidity(sessionId, address, chainClient);
  await ensureVipYjcLiquidity(sessionId, address, chainClient);

  const results: any[] = [];

  results.push(await runSettledGame({
    label: 'slots',
    path: '/api/v1/games/slots/play',
    body: { sessionId, betAmount: ZXC_BET, token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
  }));

  results.push(await runSettledGame({
    label: 'coinflip',
    path: '/api/v1/games/coinflip/play',
    body: { sessionId, betAmount: ZXC_BET, selection: 'heads', token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
    retryOnMessages: ROUND_WINDOW_RETRY_MESSAGES,
    maxAttempts: 10,
  }));

  results.push(await runSettledGame({
    label: 'roulette',
    path: '/api/v1/games/roulette/play',
    body: { sessionId, betAmount: ZXC_BET, bets: [{ type: 'color', value: 'red' }], token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
    retryOnMessages: ROUND_WINDOW_RETRY_MESSAGES,
    maxAttempts: 10,
  }));

  results.push(await runSettledGame({
    label: 'horse',
    path: '/api/v1/games/horse/play',
    body: { sessionId, betAmount: ZXC_BET, horseId: 1, token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
    retryOnMessages: ROUND_WINDOW_RETRY_MESSAGES,
    maxAttempts: 10,
  }));

  results.push(await runSettledGame({
    label: 'sicbo',
    path: '/api/v1/games/sicbo/play',
    body: { sessionId, betAmount: ZXC_BET, bets: [{ type: 'big' }], token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
    retryOnMessages: ROUND_WINDOW_RETRY_MESSAGES,
    maxAttempts: 10,
  }));

  results.push(await runSettledGame({
    label: 'bingo',
    path: '/api/v1/games/bingo/play',
    body: { sessionId, betAmount: ZXC_BET, numbers: [1, 2, 3, 4, 5], token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
    retryOnMessages: ROUND_WINDOW_RETRY_MESSAGES,
    maxAttempts: 10,
  }));

  results.push(await runSettledGame({
    label: 'duel',
    path: '/api/v1/games/duel/play',
    body: { sessionId, betAmount: ZXC_BET, p1Selection: 'heads', p2Selection: 'tails', token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
  }));

  results.push(await runBlackjack(sessionId, address, chainClient));
  results.push(await runCrash(sessionId, address, chainClient));

  results.push(await runSettledGame({
    label: 'poker',
    path: '/api/v1/games/poker/play',
    body: { sessionId, betAmount: YJC_BET, action: 'deal', token: 'yjc' },
    token: 'yjc',
    sessionId,
    address,
    chainClient,
  }));

  results.push(await runSettledGame({
    label: 'bluffdice',
    path: '/api/v1/games/bluffdice/play',
    body: { sessionId, betAmount: YJC_BET, action: 'roll', token: 'yjc' },
    token: 'yjc',
    sessionId,
    address,
    chainClient,
  }));

  results.push(await runSettledGame({
    label: 'shoot-dragon-gate',
    path: '/api/v1/games/shoot-dragon-gate/play',
    body: { sessionId, betAmount: ZXC_BET, token: 'zhixi' },
    token: 'zhixi',
    sessionId,
    address,
    chainClient,
  }));

  const summary = {
    username,
    sessionId,
    address,
    apiBase: API_BASE,
    results: results.map((entry) => ({
      label: entry.label,
      coveredIntermediate: entry.coveredIntermediate,
      requestId: entry.response.requestId,
      settled: entry.settled,
      betTxHash: entry.verification.betTxHash,
      payoutTxHash: entry.verification.payoutTxHash,
      balanceAfter: entry.verification.balanceAfter,
      intents: entry.verification.intents,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[smoke-games-onchain] failed');
  console.error(error);
  process.exit(1);
});
