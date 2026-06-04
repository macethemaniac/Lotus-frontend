const apiBaseUrl = import.meta.env.VITE_LOTUS_API_BASE_URL;
const turnkeyEnabled = import.meta.env.VITE_TURNKEY_AUTH_ENABLED;
const turnkeyApiBaseUrl = import.meta.env.VITE_TURNKEY_API_BASE_URL;
const turnkeyOrganizationId = import.meta.env.VITE_TURNKEY_ORGANIZATION_ID;
const turnkeyAuthProxyConfigId = import.meta.env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID;
const turnkeyAuthProxyUrl = import.meta.env.VITE_TURNKEY_AUTH_PROXY_URL;
const lotusAuthExchangePath = import.meta.env.VITE_LOTUS_AUTH_EXCHANGE_PATH;
const executionOrchestratorV1Enabled = import.meta.env.VITE_EXECUTION_ORCHESTRATOR_V1_ENABLED;
const lotusProductionBackendApiBaseUrl = "https://api.uselotus.xyz";
const lotusStagingBackendApiBaseUrl = "https://staging-api.uselotus.xyz";

function isEnabledFlag(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export const env = {
  lotusApiBaseUrl: configuredLotusApiBaseUrl(apiBaseUrl),
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
  executionOrchestratorV1Enabled: isEnabledFlag(executionOrchestratorV1Enabled),
};

export function lotusWsUrl(): string {
  const url = new URL(resolveLotusWsBaseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

export function lotusMarketDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.location.hostname.toLowerCase() !== "app.uselotus.xyz";
}

function resolveLotusWsBaseUrl(): string {
  if (typeof window === "undefined") return env.lotusApiBaseUrl;

  const appHostname = window.location.hostname.toLowerCase();
  if (!isDeployedFrontendHost(appHostname)) return env.lotusApiBaseUrl;

  try {
    const configured = new URL(env.lotusApiBaseUrl);
    const configuredHostname = configured.hostname.toLowerCase();
    if (
      configuredHostname === "localhost" ||
      configuredHostname === "127.0.0.1" ||
      configuredHostname === appHostname
    ) {
      return deployedLotusApiBaseUrl(appHostname) ?? env.lotusApiBaseUrl;
    }
  } catch {
    return deployedLotusApiBaseUrl(appHostname) ?? env.lotusApiBaseUrl;
  }

  return env.lotusApiBaseUrl;
}

function defaultLotusApiBaseUrl(): string {
  if (typeof window === "undefined") return "http://localhost:3000";
  return deployedLotusApiBaseUrl(window.location.hostname.toLowerCase()) ?? "http://localhost:3000";
}

function configuredLotusApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return defaultLotusApiBaseUrl();
  const trimmed = value.replace(/\/$/, "");

  try {
    const configured = new URL(trimmed);
    const configuredHostname = configured.hostname.toLowerCase();
    const appHostname = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();

    if (isDeployedFrontendHost(configuredHostname)) {
      return deployedLotusApiBaseUrl(appHostname) ??
        deployedLotusApiBaseUrl(configuredHostname) ??
        defaultLotusApiBaseUrl();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function deployedLotusApiBaseUrl(hostname: string): string | undefined {
  if (hostname === "app.uselotus.xyz") return lotusProductionBackendApiBaseUrl;
  if (hostname === "staging.uselotus.xyz" || hostname.endsWith(".vercel.app")) {
    return lotusStagingBackendApiBaseUrl;
  }
  return undefined;
}

function isDeployedFrontendHost(hostname: string): boolean {
  return hostname === "staging.uselotus.xyz" ||
    hostname === "app.uselotus.xyz" ||
    hostname.endsWith(".vercel.app");
}
