import { apiRequest } from "@/lib/api/http-client";

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

export type SetupBatchResponse = {
  accounts: UserVenueAccount[];
  venueAccounts?: Array<{ venue: string; setupMode?: string; venueAccount: UserVenueAccount }>;
  setupRequests: unknown[];
  signatureRequests?: unknown[];
  blockers?: string[];
};

export function listWallets(token: string) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets", { token });
}

export function ensureDefaultWallets(token: string) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets/ensure-defaults", { method: "POST", token });
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
