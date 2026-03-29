type BalanceCandidate = string | number | null | undefined;

function isDefinedBalance(value: BalanceCandidate): value is string | number {
  return value !== null && value !== undefined && value !== '';
}

export function resolvePreferredBalance(params: {
  onchainBalance?: BalanceCandidate;
  onchainAvailable?: boolean;
  walletBalance?: BalanceCandidate;
  fallbackBalance?: BalanceCandidate;
  defaultBalance?: string;
}) {
  const {
    onchainBalance,
    onchainAvailable = false,
    walletBalance,
    fallbackBalance,
    defaultBalance = '0',
  } = params;

  if (onchainAvailable && isDefinedBalance(onchainBalance)) {
    return String(onchainBalance);
  }

  const positiveFallback = [walletBalance, fallbackBalance, onchainBalance].find(
    (value) => isDefinedBalance(value) && Number(value) > 0,
  );
  if (isDefinedBalance(positiveFallback)) {
    return String(positiveFallback);
  }

  const firstDefined = [walletBalance, fallbackBalance, onchainBalance].find(isDefinedBalance);
  return isDefinedBalance(firstDefined) ? String(firstDefined) : defaultBalance;
}
