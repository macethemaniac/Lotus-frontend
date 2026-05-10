import { apiRequest } from "@/lib/api/http-client";

export type VenueBalance = {
  venue: string;
  asset?: string;
  token?: string;
  readyAmount?: string;
  availableAmount?: string;
  activeWithdrawalAmount?: string;
  updatedAt?: string;
};

export type VenueCapability = {
  venue?: string;
  status?: string;
  supported?: boolean;
  fundingSupported?: boolean;
  withdrawalSupported?: boolean;
  blockers?: string[];
  [key: string]: unknown;
};

export type VenueActivation = {
  venue: string;
  token?: string;
  status?: string;
  required?: boolean;
  signableApproval?: unknown;
  blockers?: string[];
};

export type FundingHistoryRow = {
  id?: string;
  venue?: string;
  status?: string;
  amount?: string;
  asset?: string;
  updatedAt?: string;
};

export type FundingTargetRequest = {
  targetVenue: string;
  targetAmount?: string;
  targetPercentage?: number;
};

export type FundingRouteLeg = {
  routeLegId: string;
  targetVenue: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  destinationChain: string;
  destinationToken: string;
  destinationAmountEstimate: string;
  routeProvider: string;
  routeQuote?: {
    estimatedFees?: string;
    estimatedTimeSeconds?: number | null;
    userSafeSummary?: string;
    transactionRequest?: unknown;
  };
  status: string;
  errorReason?: string | null;
};

export type FundingIntentResponse = {
  intent: {
    fundingIntentId: string;
    sourceChain: string;
    sourceToken: string;
    sourceAmount: string;
    sourceWalletAddress: string;
    sourceWalletId?: string | null;
    status: string;
    totalEstimatedFees: string;
    totalEstimatedTimeSeconds: number | null;
    createdAt: string;
    updatedAt: string;
  };
  targets: unknown[];
  routeLegs: FundingRouteLeg[];
  reconciliations: unknown[];
  userSafeMessage: string;
};

export type FundingReceipt = {
  fundingIntentId: string;
  currentStatus: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  sourceWalletAddress: string;
  totalEstimatedFees: string;
  totalEstimatedTimeSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  targets: unknown[];
  routeLegs: unknown[];
  reconciliations: unknown[];
  userSafeMessage: string;
};

export type WithdrawalReceipt = {
  withdrawalIntentId: string;
  currentStatus: string;
  token: string;
  amount: string;
  destinationChain: string;
  destinationWalletAddress: string;
  totalEstimatedFees: string;
  totalEstimatedTimeSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  sources: unknown[];
  routeLegs: unknown[];
  reconciliations: unknown[];
  userSafeMessage: string;
};

export function getVenueBalances(token: string) {
  return apiRequest<{ balances?: VenueBalance[]; venues?: VenueBalance[] }>("/funding/venue-balances", { token });
}

export function getVenueCapabilities(token: string) {
  return apiRequest<{ capabilities: VenueCapability[] | Record<string, VenueCapability> }>("/funding/venues/capabilities", { token });
}

export function getVenueActivations(token: string) {
  return apiRequest<{ activations?: VenueActivation[]; venues?: VenueActivation[] }>("/funding/venue-activations", { token });
}

export function getFundingHistory(token: string) {
  return apiRequest<{ rows?: FundingHistoryRow[]; history?: FundingHistoryRow[] }>("/funding/history?pageSize=10", { token });
}

export function createFundingIntent(token: string, input: {
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  sourceWalletAddress?: string;
  sourceWalletId?: string;
  idempotencyKey: string;
  targets: FundingTargetRequest[];
}) {
  return apiRequest<FundingIntentResponse>("/funding/intents", {
    method: "POST",
    token,
    body: input,
  });
}

export function quoteFundingIntent(token: string, fundingIntentId: string) {
  return apiRequest<FundingIntentResponse>(`/funding/intents/${encodeURIComponent(fundingIntentId)}/quote`, {
    method: "POST",
    token,
  });
}

export function getFundingReceipt(token: string, fundingIntentId: string) {
  return apiRequest<{ generatedAt: string; receipt: FundingReceipt }>(
    `/funding/intents/${encodeURIComponent(fundingIntentId)}/receipt`,
    { token }
  );
}

export function getWithdrawalReceipt(token: string, withdrawalIntentId: string) {
  return apiRequest<{ generatedAt: string; receipt: WithdrawalReceipt }>(
    `/funding/withdrawals/${encodeURIComponent(withdrawalIntentId)}/receipt`,
    { token }
  );
}
