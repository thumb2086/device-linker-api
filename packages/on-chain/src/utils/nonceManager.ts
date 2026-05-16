export class NonceManager {
  private nonceByAddress = new Map<string, number>();

  get(address: string): number | undefined {
    return this.nonceByAddress.get(address.toLowerCase());
  }

  set(address: string, nonce: number): void {
    this.nonceByAddress.set(address.toLowerCase(), nonce);
  }
}
