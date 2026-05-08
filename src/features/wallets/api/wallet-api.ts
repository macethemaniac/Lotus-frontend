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
  venueAccountType: string;
  status: string;
  readinessBlockers: string[];
  setupInstructions?: string[];
  createdAt: string;
  updatedAt: string;
};

export type SetupBatchResponse = {
  accounts?: UserVenueAccount[];
  setupRequests?: unknown[];
  blockers?: string[];
};

export function listWallets(token: string) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets", { token });
}

export function ensureDefaultWallets(token: string) {
  return apiRequest<{ wallets: UserWallet[] }>("/user/wallets/ensure-defaults", { method: "POST", token });
}

export function listVenueAccounts(token: string) {
  return apiRequest<{ accounts: UserVenueAccount[] }>("/user/venue-accounts", { token });
}

export function prepareVenueSetupBatch(token: string) {
  return apiRequest<SetupBatchResponse>("/user/venue-accounts/setup-batch", { method: "POST", token });
}
