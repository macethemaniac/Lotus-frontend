import { apiRequest } from "@/lib/api/http-client";

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

export function listWallets(token: string) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets", { token });
}

export function ensureDefaultWallets(token: string) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets/ensure-defaults", { method: "POST", token });
}

export function registerTurnkeyDefaultWallets(token: string, accounts: TurnkeyWalletAccountRegistration[]) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets/turnkey/defaults", {
    method: "POST",
    token,
    body: { accounts },
  });
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
