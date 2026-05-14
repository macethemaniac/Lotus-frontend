import { apiRequest } from "@/lib/api/http-client";
import { staleWhileRevalidate } from "@/lib/api/stale-cache";

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
  supportsWithdrawal?: boolean;
  withdrawalDestinations?: WithdrawalDestinationCapability[];
  preferredChain?: string;
  preferredToken?: string;
  blockers?: string[];
  [key: string]: unknown;
};

export type WithdrawalDestinationCapability = {
  chain: string;
  chainId: number;
  token: string;
  tokenAddress: string;
  supported: boolean;
  notes?: string;
};

export type VenueActivation = {
  venue: string;
  token?: string;
  status?: string;
  activationRequired?: boolean;
  required?: boolean;
  mode?: string;
  signableApproval?: unknown;
  blockers?: string[];
  instructions?: string[];
  lastSubmitted?: boolean;
  bridgedUsdcBalance?: string | null;
  onchainPusdBalance?: string | null;
  onchainPusdAllowance?: string | null;
  clobCollateralBalance?: string | null;
  clobCollateralAllowance?: string | null;
  clobAllowanceSpenders?: Array<{ spenderAddress: string; allowance: string }>;
  approvalSpenderSource?: "CLOB_ALLOWANCE_MAP" | "CONFIG_FALLBACK" | "UNAVAILABLE" | string;
  readinessReason?: string | null;
};

export type PolymarketActivationPreparation = {
  ownerAddress: string;
  depositWalletAddress: string;
  chainId: number;
  nonce: string;
  deadline: string;
  calls: Array<{ target: string; value: string; data: string }>;
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  wrapsUsdc: boolean;
  usdcBalance: string;
  pUsdBalance?: string;
  approvalSpenders: string[];
  conditionalApprovalSpenders?: string[];
  instructions: string[];
};

export type PolymarketActivationSubmission = {
  ownerAddress: string;
  depositWalletAddress: string;
  nonce: string;
  deadline: string;
  calls: Array<{ target: string; value: string; data: string }>;
  signature: string;
  tokenId?: string;
};

export type PolymarketActivationSubmitResult = {
  relayerTransactionId?: string;
  relayerState?: string;
  transactionHash?: string | null;
};

export type FundingHistoryRow = {
  id: string;
  direction: "FUNDING" | "WITHDRAWAL" | string;
  intentId: string;
  routeLegId?: string | null;
  venue?: string;
  token?: string;
  asset?: string;
  amount?: string;
  sourceChain?: string | null;
  destinationChain?: string | null;
  status?: string;
  aggregateStatus?: string;
  legStatus?: string | null;
  txHashes?: string[];
  readyToTrade?: boolean | null;
  completed?: boolean | null;
  destinationReceived?: boolean | null;
  venueConfirmed?: boolean | null;
  checkedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type FundingHistoryResponse = {
  asOf?: string;
  refreshAfterSeconds?: number;
  items?: FundingHistoryRow[];
  rows?: FundingHistoryRow[];
  history?: FundingHistoryRow[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
};

export type FundingTargetRequest = {
  targetVenue: string;
  targetAmount?: string;
  targetPercentage?: number;
};

export type FundingTransactionRequest = {
  to?: string;
  from?: string;
  data?: string;
  value?: string;
  chainId?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  unsignedTransaction?: string;
  signWith?: string;
  recentBlockhash?: string;
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
    transactionRequest?: FundingTransactionRequest | null;
  };
  txHashes?: string[];
  status: string;
  errorReason?: string | null;
};

export type FundingIntentResponse = {
  fundingIntentId: string;
  currentStatus: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  sourceWalletAddress: string;
  sourceWalletId?: string | null;
  routePreview?: Record<string, unknown>;
  totalEstimatedFees: string;
  totalEstimatedTimeSeconds: number | null;
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

export type WithdrawalSourceRequest = {
  sourceVenue: string;
  sourceAmount?: string;
  sourcePercentage?: number;
};

export type WithdrawalRouteLeg = {
  withdrawalRouteLegId: string;
  withdrawalIntentId: string;
  withdrawalSourceId: string;
  sourceVenue: string;
  sourceToken: string;
  sourceAmount: string;
  destinationChain: string;
  destinationWalletAddress: string;
  destinationAmountEstimate: string;
  routeProvider: string;
  routeQuote?: {
    provider?: string;
    estimatedFees?: string;
    estimatedTimeSeconds?: number | null;
    expiresAt?: string;
    transactionRequest?: unknown;
    userSafeSummary?: string;
  };
  txHashes?: string[];
  venueReleaseStatus?: string;
  destinationStatus?: string;
  status: string;
  errorReason?: string | null;
};

export type WithdrawalIntentResponse = {
  withdrawalIntentId: string;
  currentStatus: string;
  token: string;
  amount: string;
  destinationChain: string;
  destinationWalletAddress: string;
  routePreview?: Record<string, unknown>;
  totalEstimatedFees: string;
  totalEstimatedTimeSeconds: number | null;
  sources: Array<{
    withdrawalSourceId: string;
    sourceVenue: string;
    sourceToken: string;
    sourceAmount: string;
    sourcePercentage?: number | null;
    status: string;
  }>;
  routeLegs: WithdrawalRouteLeg[];
  reconciliations: unknown[];
  userSafeMessage: string;
};

type FundingReadOptions = {
  force?: boolean;
};

export function getVenueBalances(token: string, options: FundingReadOptions = {}) {
  const request = () => apiRequest<{ balances?: VenueBalance[]; venues?: VenueBalance[] }>("/funding/venue-balances", { token });
  return options.force
    ? request()
    : staleWhileRevalidate(`funding:balances:${token}`, request, { ttlMs: 10_000, maxStaleMs: 90_000 });
}

export function getVenueCapabilities(token: string) {
  return staleWhileRevalidate(`funding:capabilities:${token}`, () =>
    apiRequest<{ capabilities: VenueCapability[] | Record<string, VenueCapability> }>("/funding/venues/capabilities", { token }),
    { ttlMs: 60_000, maxStaleMs: 10 * 60_000 }
  );
}

export function getVenueActivations(token: string, options: FundingReadOptions = {}) {
  const request = () => apiRequest<{ activations?: VenueActivation[]; venues?: VenueActivation[] }>("/funding/venue-activations", { token });
  return options.force
    ? request()
    : staleWhileRevalidate(`funding:activations:${token}`, request, { ttlMs: 10_000, maxStaleMs: 90_000 });
}

export function preparePolymarketActivation(token: string, input: { tokenId?: string } = {}) {
  return apiRequest<{ activation: PolymarketActivationPreparation }>("/funding/venue-activations/polymarket/prepare", {
    method: "POST",
    token,
    body: input,
  });
}

export function submitPolymarketActivation(token: string, input: PolymarketActivationSubmission) {
  return apiRequest<{ activation: PolymarketActivationSubmitResult }>("/funding/venue-activations/polymarket/submit", {
    method: "POST",
    token,
    body: input,
  });
}

export function getFundingHistory(token: string, input: { page?: number; pageSize?: number; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  const path = `/funding/history${query ? `?${query}` : ""}`;
  return staleWhileRevalidate(`funding:history:${token}:${path}`, () =>
    apiRequest<FundingHistoryResponse>(path, { token }),
    { ttlMs: 8_000, maxStaleMs: 2 * 60_000 }
  );
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

export function getFundingIntentStatus(token: string, fundingIntentId: string) {
  return apiRequest<FundingIntentResponse>(`/funding/intents/${encodeURIComponent(fundingIntentId)}/status`, {
    token,
  });
}

export function submitFundingRouteLeg(token: string, fundingIntentId: string, input: {
  routeLegId: string;
  txHash: string;
}) {
  return apiRequest<FundingIntentResponse>(`/funding/intents/${encodeURIComponent(fundingIntentId)}/submit`, {
    method: "POST",
    token,
    body: input,
  });
}

export function submitSignedSolanaFundingRouteLeg(token: string, fundingIntentId: string, input: {
  routeLegId: string;
  signedTransaction: string;
}) {
  return apiRequest<FundingIntentResponse>(`/funding/intents/${encodeURIComponent(fundingIntentId)}/submit-signed-solana`, {
    method: "POST",
    token,
    body: input,
  });
}

export function getFundingReceipt(token: string, fundingIntentId: string) {
  return apiRequest<{ generatedAt: string; receipt: FundingReceipt }>(
    `/funding/intents/${encodeURIComponent(fundingIntentId)}/receipt`,
    { token }
  );
}

export function createWithdrawalIntent(token: string, input: {
  token: string;
  amount: string;
  destinationChain: string;
  destinationWalletAddress: string;
  idempotencyKey: string;
  sources: WithdrawalSourceRequest[];
}) {
  return apiRequest<WithdrawalIntentResponse>("/funding/withdrawals", {
    method: "POST",
    token,
    body: input,
  });
}

export function quoteWithdrawalIntent(token: string, withdrawalIntentId: string) {
  return apiRequest<WithdrawalIntentResponse>(`/funding/withdrawals/${encodeURIComponent(withdrawalIntentId)}/quote`, {
    method: "POST",
    token,
  });
}

export function getWithdrawalIntentStatus(token: string, withdrawalIntentId: string) {
  return apiRequest<WithdrawalIntentResponse>(`/funding/withdrawals/${encodeURIComponent(withdrawalIntentId)}/status`, {
    token,
  });
}

export function submitWithdrawalRouteLeg(token: string, withdrawalIntentId: string, input: {
  withdrawalRouteLegId: string;
  txHash: string;
}) {
  return apiRequest<WithdrawalIntentResponse>(`/funding/withdrawals/${encodeURIComponent(withdrawalIntentId)}/submit`, {
    method: "POST",
    token,
    body: input,
  });
}

export function getWithdrawalReceipt(token: string, withdrawalIntentId: string) {
  return apiRequest<{ generatedAt: string; receipt: WithdrawalReceipt }>(
    `/funding/withdrawals/${encodeURIComponent(withdrawalIntentId)}/receipt`,
    { token }
  );
}
