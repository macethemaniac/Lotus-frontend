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

export function getVenueBalances(token: string) {
  return apiRequest<{ balances?: VenueBalance[]; venues?: VenueBalance[] }>("/funding/venue-balances", { token });
}

export function getVenueActivations(token: string) {
  return apiRequest<{ activations?: VenueActivation[]; venues?: VenueActivation[] }>("/funding/venue-activations", { token });
}

export function getFundingHistory(token: string) {
  return apiRequest<{ rows?: FundingHistoryRow[]; history?: FundingHistoryRow[] }>("/funding/history?pageSize=10", { token });
}
