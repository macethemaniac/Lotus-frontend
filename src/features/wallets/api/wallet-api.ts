import { apiRequest } from "@/lib/api/http-client";
import { peekCachedData, setCachedData, staleWhileRevalidate } from "@/lib/api/stale-cache";

export type UserWalletBalance = {
  token: string;
  amount: string | number;
  chain?: string | null;
  updatedAt?: string | null;
  status?: string | null;
};

export type UserWallet = {
  walletId: string;
  provider: string;
  chainFamily: string;
  chain: string;
  address: string;
  purpose: string;
  venue?: string;
  exportable: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  balances?: UserWalletBalance[];
  balanceStatus?: string | null;
  balanceBlocker?: string | null;
};

const walletSnapshotKey = (wallet: UserWallet) =>
  wallet.walletId || `${wallet.chainFamily}:${wallet.chain}:${wallet.address}:${wallet.purpose}`;

const walletHasBalances = (wallet: UserWallet) => (wallet.balances?.length ?? 0) > 0;

const walletBalanceReadIsSynced = (wallet: UserWallet) =>
  String(wallet.balanceStatus ?? "").toLowerCase() === "synced";

export function mergeUserWalletBalanceSnapshots(previous: UserWallet[], next: UserWallet[]): UserWallet[] {
  if (next.length === 0) {
    return previous;
  }

  const previousByKey = new Map(previous.map((wallet) => [walletSnapshotKey(wallet), wallet]));
  const seen = new Set<string>();
  const merged = next.map((wallet) => {
    const key = walletSnapshotKey(wallet);
    seen.add(key);
    const previousWallet = previousByKey.get(key);
    if (!previousWallet || walletHasBalances(wallet) || walletBalanceReadIsSynced(wallet) || !walletHasBalances(previousWallet)) {
      return wallet;
    }
    return {
      ...wallet,
      balances: previousWallet.balances,
      balanceStatus: "stale",
      balanceBlocker: wallet.balanceBlocker ?? "Showing the last synced wallet balance while Lotus retries balance sync.",
    };
  });

  for (const wallet of previous) {
    const key = walletSnapshotKey(wallet);
    if (!seen.has(key) && walletHasBalances(wallet)) {
      merged.push({
        ...wallet,
        balanceStatus: "stale",
        balanceBlocker: "Showing the last synced wallet balance while Lotus refreshes wallet metadata.",
      });
    }
  }

  return merged;
}

export type UserVenueAccount = {
  venue: string;
  walletAddress: string;
  venueAccountId?: string | null;
  venueAccountAddress?: string | null;
  venueAccountType: string;
  status: string;
  readinessBlockers: string[];
  setupInstructions?: string[];
  createdAt: string;
  updatedAt: string;
};

export type VenueSetupSignatureRequest = {
  venue: string;
  requestType: string;
  signer: string;
  message: string;
  venueAccount?: UserVenueAccount;
  transactionRequest?: unknown;
  approval?: unknown;
};

export type SetupBatchResponse = {
  accounts: UserVenueAccount[];
  venueAccounts?: Array<{ venue: string; setupMode?: string; venueAccount: UserVenueAccount }>;
  setupRequests: VenueSetupSignatureRequest[];
  signatureRequests?: VenueSetupSignatureRequest[];
  blockers?: string[];
};

export type CompleteVenueSetupBatchRequest = {
  predictFun?: {
    signer: string;
    signature: string;
    message: string;
  };
  limitless?: {
    signer: string;
    signature: string;
    message: string;
  };
};

export type TurnkeyWalletAccountRegistration = {
  providerWalletId: string;
  providerWalletAccountId: string;
  address: string;
  addressFormat: "ADDRESS_FORMAT_SOLANA" | "ADDRESS_FORMAT_ETHEREUM";
};

const walletCacheKey = (token: string) => `wallets:list:${token}`;

const applyWalletCache = (token: string, response: { wallets: UserWallet[] }) => {
  const previous = peekCachedData<{ wallets: UserWallet[] }>(walletCacheKey(token));
  const wallets = mergeUserWalletBalanceSnapshots(previous?.wallets ?? [], response.wallets ?? []);
  const merged = { wallets };
  setCachedData(walletCacheKey(token), merged);
  return merged;
};

export function listWallets(token: string) {
  return staleWhileRevalidate(walletCacheKey(token), () =>
    apiRequest<{ wallets: UserWallet[] }>("/user/wallets", { token }).then((response) => applyWalletCache(token, response)),
    { ttlMs: 10_000, maxStaleMs: 90_000 }
  );
}

export function ensureDefaultWallets(token: string) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets/ensure-defaults", { method: "POST", token })
    .then((response) => applyWalletCache(token, response));
}

export function registerTurnkeyDefaultWallets(token: string, accounts: TurnkeyWalletAccountRegistration[]) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets/turnkey/defaults", {
    method: "POST",
    token,
    body: { accounts },
  }).then((response) => applyWalletCache(token, response));
}

export function listVenueAccounts(token: string) {
  return apiRequest<{ accounts?: UserVenueAccount[]; venueAccounts?: UserVenueAccount[] }>("/user/venue-accounts", { token })
    .then((response) => ({ accounts: response.accounts ?? response.venueAccounts ?? [] }));
}

export function prepareVenueSetupBatch(token: string) {
  return apiRequest<SetupBatchResponse>("/user/venue-accounts/setup-batch", { method: "POST", token })
    .then((response) => ({
      ...response,
      accounts: response.accounts ?? response.venueAccounts?.map((item) => item.venueAccount) ?? [],
      setupRequests: response.setupRequests ?? response.signatureRequests ?? [],
    }));
}

export function completeVenueSetupBatch(token: string, body: CompleteVenueSetupBatchRequest) {
  return apiRequest<SetupBatchResponse>("/user/venue-accounts/complete-batch", {
    method: "POST",
    token,
    body,
  }).then((response) => ({
    ...response,
    accounts: response.accounts ?? response.venueAccounts?.map((item) => item.venueAccount) ?? [],
    setupRequests: response.setupRequests ?? response.signatureRequests ?? [],
  }));
}
