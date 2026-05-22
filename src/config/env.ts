const apiBaseUrl = import.meta.env.VITE_LOTUS_API_BASE_URL;
const turnkeyEnabled = import.meta.env.VITE_TURNKEY_AUTH_ENABLED;
const turnkeyApiBaseUrl = import.meta.env.VITE_TURNKEY_API_BASE_URL;
const turnkeyOrganizationId = import.meta.env.VITE_TURNKEY_ORGANIZATION_ID;
const turnkeyAuthProxyConfigId = import.meta.env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID;
const turnkeyAuthProxyUrl = import.meta.env.VITE_TURNKEY_AUTH_PROXY_URL;
const lotusAuthExchangePath = import.meta.env.VITE_LOTUS_AUTH_EXCHANGE_PATH;

export const env = {
  lotusApiBaseUrl: typeof apiBaseUrl === "string" && apiBaseUrl.length > 0
    ? apiBaseUrl.replace(/\/$/, "")
    : "http://localhost:3000",
  turnkeyAuthEnabled: turnkeyEnabled === "true",
  turnkeyApiBaseUrl: typeof turnkeyApiBaseUrl === "string" && turnkeyApiBaseUrl.length > 0
    ? turnkeyApiBaseUrl.replace(/\/$/, "")
    : "https://api.turnkey.com",
  turnkeyOrganizationId: typeof turnkeyOrganizationId === "string" ? turnkeyOrganizationId : "",
  turnkeyAuthProxyConfigId: typeof turnkeyAuthProxyConfigId === "string" ? turnkeyAuthProxyConfigId : "",
  turnkeyAuthProxyUrl: typeof turnkeyAuthProxyUrl === "string" && turnkeyAuthProxyUrl.length > 0
    ? turnkeyAuthProxyUrl.replace(/\/$/, "")
    : "/turnkey-auth-proxy",
  lotusAuthExchangePath: typeof lotusAuthExchangePath === "string" && lotusAuthExchangePath.length > 0
    ? lotusAuthExchangePath
    : "/auth/turnkey/exchange",
};

export function lotusWsUrl(): string {
  const url = new URL(env.lotusApiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}
