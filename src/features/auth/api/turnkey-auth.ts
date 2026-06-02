import { ApiClientError, apiRequest } from "@/lib/api/http-client";
import { env } from "@/config/env";

export type TurnkeyLoginResult = {
  userJwt: string;
  accountSetup?: {
    status: "READY" | "ACTION_REQUIRED" | "UNAVAILABLE";
    walletCount: number;
    venueAccountCount: number;
    blockers: string[];
  };
};

export async function exchangeTurnkeySessionForLotusJwt(input: {
  turnkeySessionToken: string;
  turnkeyUserId: string;
  turnkeyOrganizationId: string;
}): Promise<TurnkeyLoginResult> {
  if (!env.lotusAuthExchangePath) {
    throw new Error("Lotus JWT exchange endpoint is not configured yet.");
  }

  const payload = {
    turnkeySessionToken: input.turnkeySessionToken,
    turnkeyUserId: input.turnkeyUserId,
    turnkeyOrganizationId: input.turnkeyOrganizationId,
  };

  return retryTurnkeyExchange(() =>
    apiRequest<TurnkeyLoginResult>(env.lotusAuthExchangePath, {
      method: "POST",
      body: payload,
    }),
  );
}

export function assertTurnkeyConfigured(): void {
  if (!env.turnkeyAuthEnabled || !env.turnkeyOrganizationId) {
    throw new Error("Turnkey login is not configured for this frontend environment.");
  }
  if (!env.turnkeyAuthProxyConfigId) {
    throw new Error("Turnkey Auth Proxy config ID is missing. Set VITE_TURNKEY_AUTH_PROXY_CONFIG_ID.");
  }
}

const TURNKEY_EXCHANGE_RETRY_DELAYS_MS = [650, 1500, 3000] as const;

async function retryTurnkeyExchange(request: () => Promise<TurnkeyLoginResult>): Promise<TurnkeyLoginResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= TURNKEY_EXCHANGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (!isRetryableLotusExchangeError(error) || attempt === TURNKEY_EXCHANGE_RETRY_DELAYS_MS.length) {
        break;
      }
      await wait(TURNKEY_EXCHANGE_RETRY_DELAYS_MS[attempt]);
    }
  }

  if (isRetryableLotusExchangeError(lastError)) {
    throw new Error("Lotus backend connection dropped during session exchange. Please try again.");
  }

  throw lastError;
}

function isRetryableLotusExchangeError(error: unknown): boolean {
  if (error instanceof ApiClientError) return false;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;

  const message = error.message.toLowerCase();
  return (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("connection") ||
    message.includes("err_connection_closed")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
