export function logTx(stage: string, payload: Record<string, unknown>): void {
  console.log(`[on-chain:${stage}]`, payload);
}
