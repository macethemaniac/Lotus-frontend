import { apiRequest } from "@/lib/api/http-client";
import { staleWhileRevalidate } from "@/lib/api/stale-cache";

export type TradeSide = "buy" | "sell";

export type LiveCandidateRequest = {
  side: TradeSide;
  marketId: string;
  outcomeId: string;
  amount: string;
  venues?: string[];
};

export type TradeRouteCandidate = {
  venue: string;
  venueMarketId?: string;
  venueOutcomeId?: string;
  price: number;
  availableSize: string;
  requiresUserSignature?: boolean;
  feeBps?: number;
  spreadBps?: number;
  slippageBps?: number;
  liquidityScore?: number;
  quoteQuality?: string;
  freshnessMs?: number;
  quoteBlockers?: string[];
  metadata?: Record<string, unknown>;
};

export type LiveCandidatesResponse = {
  generatedAt: string;
  marketId: string;
  outcomeId: string;
  amount: string;
  source: "LIVE_QUOTE_SOURCE";
  candidates: TradeRouteCandidate[];
  blocked: { venue: string; reason: string; venueMarketId?: string; venueOutcomeId?: string; detailsCode?: string }[];
};

export type RouteQuote = {
  quoteId: string;
  side: TradeSide;
  marketId: string;
  outcomeId: string;
  routeType: string;
  venuePath: string[];
  executableAmount: string;
  skippedAmount?: string;
  expectedPrice: number;
  effectivePrice: number;
  estimatedSavings?: number;
  savingsBreakdown?: Record<string, unknown>;
  expectedFees?: Record<string, unknown>;
  requiredUserSignatureSteps: string[];
  expiresAt: string;
  legs: Array<{
    venue: string;
    venueMarketId?: string;
    venueOutcomeId?: string;
    size: string;
    price: number;
    requiresUserSignature?: boolean;
    metadata?: Record<string, unknown>;
  }>;
};

export type SignatureBundle = {
  quoteId: string;
  expiresAt: string;
  signatureRequests: Array<{
    legIndex: number;
    venue: string;
    requestType?: string;
    signer?: string;
    account?: string;
    kind: string;
    typedData?: unknown;
    signedPayloadHint?: unknown;
    expiresAt?: string;
  }>;
};

export type ExecutionOrderState =
  | "READY_TO_PLACE"
  | "NEEDS_SIGNATURE"
  | "NEEDS_VENUE_SETUP"
  | "WAITING_FOR_VENUE_READY"
  | "BLOCKED_ACTION_REQUIRED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "FILLED"
  | "FAILED"
  | "EXPIRED";

export type ExecutionOrderPrimaryAction = "PLACE_ORDER" | "SIGN" | "ENABLE_VENUE" | "NONE";

export type ExecutionOrderVenuePreference =
  | "BEST_ROUTE"
  | "POLYMARKET"
  | "LIMITLESS"
  | "PREDICT_FUN"
  | "OPINION";

export type ExecutionOrderSignatureRequest = SignatureBundle["signatureRequests"][number];

export type ExecutionOrderPreviewRequest = {
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  amount: string;
  venuePreference: ExecutionOrderVenuePreference;
  orderPolicy?: "FOK";
  slippageToleranceBps?: number;
};

export type ExecutionOrderResponse = {
  orderId: string;
  quoteId?: string | null;
  executionId?: string | null;
  state: ExecutionOrderState;
  primaryAction?: ExecutionOrderPrimaryAction | null;
  signingMode?: string | null;
  routeSummary?: Record<string, unknown> | null;
  priceSummary?: Record<string, unknown> | null;
  venuePreference?: ExecutionOrderVenuePreference | string | null;
  readinessSummary?: Record<string, unknown> | null;
  venueCapabilitySummary?: Record<string, unknown> | null;
  blockers?: Array<string | { message?: string; reason?: string; code?: string; venue?: string }>;
  lastError?: string | { message?: string; code?: string } | null;
  signatureRequests?: ExecutionOrderSignatureRequest[];
  nextPollAt?: string | null;
  canAutoRenew?: boolean;
  renewalReason?: string | null;
};

export type ExecutionOrderSignedPayload = {
  legIndex: number;
  venue: string;
  requestType?: string;
  signedPayload: Record<string, unknown>;
};

export type ExecutionStatus = {
  executionId: string;
  status?: string;
  userStatus?: string;
  settlementStatus?: string;
  dryRun?: boolean;
  submittedAt?: string;
  updatedAt?: string;
  route?: RouteQuote;
  submittedLegs?: Array<{
    legIndex: number;
    venue: string;
    status: string;
    venueOrderId?: string;
    fillId?: string;
    reasonCode?: string;
    reason?: string;
    fillState?: {
      status?: string;
      filledSize?: string;
      averagePrice?: number;
      offchainFilled?: boolean;
    };
    settlementState?: {
      status?: string;
      evidence?: Record<string, unknown>;
    };
  }>;
};

export type ExecutionPosition = {
  positionId: string;
  userId: string;
  venue: string;
  marketId: string;
  outcomeId: string;
  venueAccountAddress: string | null;
  verifiedSize: string;
  averageEntryPrice: number;
  sellableSize: string;
  lastSettlementEvidenceId: string | null;
  status: "VERIFIED" | "PENDING" | "RECOVERY" | "DISABLED";
  metadata?: Record<string, unknown>;
};

export type MarkedExecutionPosition = ExecutionPosition & {
  markPrice: number | null;
  markValue: string | null;
  unrealizedPnl: string | null;
  markSource: "LIVE_QUOTE_SOURCE" | null;
  markFreshness: "live" | "stale" | "unavailable";
  markGeneratedAt: string | null;
  markBlocker: string | null;
};

export type PortfolioSummary = {
  generatedAt: string;
  markPolicy: "LIVE_QUOTE_REQUIRED";
  positionCount: number;
  markedPositionCount: number;
  unavailableMarkCount: number;
  totalCostBasis: string;
  totalMarkValue: string | null;
  totalUnrealizedPnl: string | null;
  positions: MarkedExecutionPosition[];
};

export type PortfolioTimeSeriesPoint = {
  timestamp: string;
  positionCount: number;
  markedPositionCount: number;
  unavailableMarkCount: number;
  totalCostBasis: string;
  totalMarkValue: string | null;
  totalUnrealizedPnl: string | null;
};

export type PortfolioTimeSeriesResponse = {
  generatedAt: string;
  range: "1D" | "7D" | "30D" | "90D" | "ALL";
  markPolicy: "LIVE_QUOTE_REQUIRED";
  seriesBasis: "CURRENT_MARK_TO_MARKET_SNAPSHOT";
  historyAvailable: boolean;
  points: PortfolioTimeSeriesPoint[];
};

export type ExecutionHistoryResponse = {
  generatedAt: string;
  items: ExecutionStatus[];
  nextCursor: string | null;
};

export type OpenOrdersResponse = {
  generatedAt: string;
  items: Array<ExecutionStatus & {
    openStatus: "SUBMITTED" | "PARTIAL";
    userStatus: "SUBMITTED" | "PARTIAL";
  }>;
  nextCursor: string | null;
};

export type ExecutionReceiptResponse = {
  generatedAt: string;
  receipt: ExecutionStatus;
};

export type LiveSubmitVenueReadiness = {
  venue: string;
  status: "fresh" | "stale" | "blocked";
  checkedAt: string;
  blockers: string[];
  readinessCode?: string | null;
  nextAction?: string | null;
  retryable?: boolean;
  requiresUserSync?: boolean;
  liveSubmitSpendableBalance?: string | null;
  account: {
    walletAddress: string | null;
    venueAccountAddress: string | null;
    ownerAddress: string | null;
  };
  collateral: {
    requiredNotional: string | null;
    balance: string | null;
    allowance: string | null;
    tokenSymbol: string | null;
    tokenAddress: string | null;
    spenderAddress: string | null;
    chainId: number | null;
    approvalMethod?: "CLOB_PUSD_APPROVAL" | "ERC20_APPROVE" | "ERC1155_SET_APPROVAL_FOR_ALL";
    usableBalance?: string | null;
    usableBalanceSource?: string | null;
    approvalSpenderSource?: string | null;
  };
};

export type LiveSubmitReadinessSnapshot = {
  quoteId: string;
  generatedAt: string;
  expiresAt: string;
  status: "fresh" | "stale" | "blocked";
  blockers: string[];
  venues: LiveSubmitVenueReadiness[];
};

export function getLiveCandidates(token: string, request: LiveCandidateRequest) {
  return apiRequest<LiveCandidatesResponse>("/execution/live-candidates", { method: "POST", token, body: request });
}

export function createExecutionQuote(token: string, request: LiveCandidateRequest & { candidates: TradeRouteCandidate[] }) {
  return apiRequest<{ quote: RouteQuote }>("/execution/quote", { method: "POST", token, body: request });
}

export type PrepareExitQuoteRequest = {
  sellMode: "SINGLE_VENUE_SELL" | "SELL_ALL";
  venue?: string;
  sizeMode: "PERCENT" | "CUSTOM_AMOUNT";
  percent?: 25 | 50 | 100;
  amount?: string;
  marketId: string;
  outcomeId: string;
  candidates: TradeRouteCandidate[];
};

export type PrepareExitQuoteResponse = {
  quote: RouteQuote;
  allocations: Array<{
    venue: string;
    positionId: string;
    sellSize: string;
    availableSize: string;
  }>;
  skippedAmount: string;
};

export function prepareExitQuote(token: string, request: PrepareExitQuoteRequest) {
  return apiRequest<PrepareExitQuoteResponse>("/execution/sell-preview/prepare-exit", {
    method: "POST",
    token,
    body: request,
  });
}

export function submitExecutionQuote(token: string, quoteId: string) {
  return apiRequest<{ executionId: string; status: string; route: RouteQuote; message: string }>("/execution/submit", {
    method: "POST",
    token,
    body: { quoteId },
  });
}

export function prepareSignatures(token: string, executionId: string) {
  return apiRequest<SignatureBundle>(`/execution/${encodeURIComponent(executionId)}/prepare-signatures`, {
    method: "POST",
    token,
    body: {},
  });
}

export function submitSignedBundle(token: string, executionId: string, signedLegs: unknown[], dryRun: boolean) {
  return apiRequest<ExecutionStatus>(`/execution/${encodeURIComponent(executionId)}/submit-signed-bundle`, {
    method: "POST",
    token,
    body: { signedLegs, dryRun },
  });
}

export function getLiveReadiness(token: string, executionId: string) {
  return apiRequest<LiveSubmitReadinessSnapshot>(`/execution/${encodeURIComponent(executionId)}/live-readiness`, { token });
}

export function previewExecutionOrder(token: string, request: ExecutionOrderPreviewRequest) {
  return apiRequest<ExecutionOrderResponse>("/execution/orders/preview", {
    method: "POST",
    token,
    body: request,
  });
}

export function placeExecutionOrder(token: string, orderId: string) {
  return apiRequest<ExecutionOrderResponse>(`/execution/orders/${encodeURIComponent(orderId)}/place`, {
    method: "POST",
    token,
    body: {},
  });
}

export function submitExecutionOrderSignatures(token: string, orderId: string, signedPayloads: ExecutionOrderSignedPayload[]) {
  return apiRequest<ExecutionOrderResponse>(`/execution/orders/${encodeURIComponent(orderId)}/signatures`, {
    method: "POST",
    token,
    body: { signedPayloads },
  });
}

export function getExecutionOrderStatus(token: string, orderId: string) {
  return apiRequest<ExecutionOrderResponse>(`/execution/orders/${encodeURIComponent(orderId)}/status`, { token });
}

export function getExecutionStatus(token: string, executionId: string) {
  return apiRequest<ExecutionStatus>(`/execution/${encodeURIComponent(executionId)}/status`, { token });
}

export function getPositions(token: string, input: { marketId?: string; outcomeId?: string; venue?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (input.marketId) params.set("marketId", input.marketId);
  if (input.outcomeId) params.set("outcomeId", input.outcomeId);
  if (input.venue) params.set("venue", input.venue);
  if (input.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return apiRequest<{ generatedAt: string; marketId: string | null; outcomeId: string | null; positions: ExecutionPosition[] }>(
    `/execution/positions${query ? `?${query}` : ""}`,
    { token }
  );
}

type PortfolioReadOptions = {
  force?: boolean;
};

export function getPortfolioSummary(token: string, options: PortfolioReadOptions = {}) {
  const request = () => apiRequest<PortfolioSummary>("/execution/portfolio/summary", { token });
  return options.force
    ? request()
    : staleWhileRevalidate(`execution:portfolio:summary:${token}`, request, { ttlMs: 8_000, maxStaleMs: 90_000 });
}

export function getPortfolioTimeSeries(token: string, input: { range?: PortfolioTimeSeriesResponse["range"]; force?: boolean } = {}) {
  const params = new URLSearchParams();
  if (input.range) params.set("range", input.range);
  const query = params.toString();
  const path = `/execution/portfolio/timeseries${query ? `?${query}` : ""}`;
  const request = () => apiRequest<PortfolioTimeSeriesResponse>(path, { token });
  return input.force
    ? request()
    : staleWhileRevalidate(`execution:portfolio:timeseries:${token}:${path}`, request, { ttlMs: 12_000, maxStaleMs: 2 * 60_000 });
}

export function getExecutionHistory(token: string, input: { status?: string; limit?: number; cursor?: string } = {}) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.limit) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  const query = params.toString();
  return apiRequest<ExecutionHistoryResponse>(`/execution/history${query ? `?${query}` : ""}`, { token });
}

export function getOpenOrders(token: string, input: { limit?: number; cursor?: string } = {}) {
  const params = new URLSearchParams();
  if (input.limit) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  const query = params.toString();
  return apiRequest<OpenOrdersResponse>(`/execution/open-orders${query ? `?${query}` : ""}`, { token });
}

export function getExecutionReceipt(token: string, executionId: string) {
  return apiRequest<ExecutionReceiptResponse>(`/execution/${encodeURIComponent(executionId)}/receipt`, { token });
}
