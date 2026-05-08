import { apiRequest } from "@/lib/api/http-client";
import { env } from "@/config/env";

export type TurnkeyLoginResult = {
  userJwt: string;
};

export async function exchangeTurnkeySessionForLotusJwt(input: {
  turnkeySessionToken: string;
  turnkeyUserId: string;
  turnkeyOrganizationId: string;
}): Promise<TurnkeyLoginResult> {
  if (!env.lotusAuthExchangePath) {
    throw new Error("Lotus JWT exchange endpoint is not configured yet.");
  }

  return apiRequest<TurnkeyLoginResult>(env.lotusAuthExchangePath, {
    method: "POST",
    body: {
      turnkeySessionToken: input.turnkeySessionToken,
      turnkeyUserId: input.turnkeyUserId,
      turnkeyOrganizationId: input.turnkeyOrganizationId,
    },
  });
}

export function assertTurnkeyConfigured(): void {
  if (!env.turnkeyAuthEnabled || !env.turnkeyOrganizationId) {
    throw new Error("Turnkey login is not configured for this frontend environment.");
  }
  if (!env.turnkeyAuthProxyConfigId) {
    throw new Error("Turnkey Auth Proxy config ID is missing. Set VITE_TURNKEY_AUTH_PROXY_CONFIG_ID.");
  }
}
