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
};

export type LiveCandidatesResponse = {
  generatedAt: string;
  marketId: string;
  outcomeId: string;
  amount: string;
  source: "LIVE_QUOTE_SOURCE";
  candidates: TradeRouteCandidate[];
  blocked: { venue: string; reason: string; venueMarketId?: string; venueOutcomeId?: string }[];
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
  }>;
};

export type SignatureBundle = {
  quoteId: string;
  expiresAt: string;
  signatureRequests: Array<{
    legIndex: number;
    venue: string;
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
  return apiRequest<unknown>(`/execution/${encodeURIComponent(executionId)}/live-readiness`, { token });
}

export function getExecutionStatus(token: string, executionId: string) {
  return apiRequest<ExecutionStatus>(`/execution/${encodeURIComponent(executionId)}/status`, { token });
}

export function getPositions(token: string, marketId: string, outcomeId: string) {
  const params = new URLSearchParams({ marketId, outcomeId });
  return apiRequest<{ generatedAt: string; positions: unknown[] }>(`/execution/positions?${params.toString()}`, { token });
}
