import { apiRequest } from "@/lib/api/http-client";

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
    reason?: string;
    fillState?: unknown;
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
  markFreshness: "live" | "unavailable";
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
    approvalMethod?: "ERC20_APPROVE" | "ERC1155_SET_APPROVAL_FOR_ALL";
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

export function getPortfolioSummary(token: string) {
  return apiRequest<PortfolioSummary>("/execution/portfolio/summary", { token });
}

export function getPortfolioTimeSeries(token: string, input: { range?: PortfolioTimeSeriesResponse["range"] } = {}) {
  const params = new URLSearchParams();
  if (input.range) params.set("range", input.range);
  const query = params.toString();
  return apiRequest<PortfolioTimeSeriesResponse>(`/execution/portfolio/timeseries${query ? `?${query}` : ""}`, { token });
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
