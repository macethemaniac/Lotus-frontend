type LotusRuntimeConfig = {
  lotusApiBaseUrl?: string;
  turnkeyAuthEnabled?: boolean | string;
  turnkeyAuthProxyConfigId?: string;
  turnkeyAuthProxyUrl?: string;
  turnkeyOauthRedirectOrigin?: string;
  turnkeyOrganizationId?: string;
};

const runtimeConfig = readRuntimeConfig();
const apiBaseUrl = firstConfiguredString(runtimeConfig.lotusApiBaseUrl, import.meta.env.VITE_LOTUS_API_BASE_URL);
const turnkeyEnabled = firstConfiguredBoolean(runtimeConfig.turnkeyAuthEnabled, import.meta.env.VITE_TURNKEY_AUTH_ENABLED);
const turnkeyApiBaseUrl = import.meta.env.VITE_TURNKEY_API_BASE_URL;
const turnkeyOrganizationId = firstConfiguredString(runtimeConfig.turnkeyOrganizationId, import.meta.env.VITE_TURNKEY_ORGANIZATION_ID);
const turnkeyAuthProxyConfigId = firstConfiguredString(runtimeConfig.turnkeyAuthProxyConfigId, import.meta.env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID);
const turnkeyAuthProxyUrl = firstConfiguredString(runtimeConfig.turnkeyAuthProxyUrl, import.meta.env.VITE_TURNKEY_AUTH_PROXY_URL);
const turnkeyOauthRedirectOrigin = firstConfiguredString(runtimeConfig.turnkeyOauthRedirectOrigin, import.meta.env.VITE_TURNKEY_OAUTH_REDIRECT_ORIGIN);
const lotusAuthExchangePath = import.meta.env.VITE_LOTUS_AUTH_EXCHANGE_PATH;
const lotusDeployEnv = import.meta.env.VITE_LOTUS_DEPLOY_ENV;
const executionOrchestratorV1Enabled = import.meta.env.VITE_EXECUTION_ORCHESTRATOR_V1_ENABLED;
const resolvedLotusDeployEnv = configuredLotusDeployEnv(lotusDeployEnv);

export type LotusDeployEnv = "local" | "preview" | "staging" | "production";

function isEnabledFlag(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function isDisabledFlag(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "false";
}

export const env = {
  lotusDeployEnv: resolvedLotusDeployEnv,
  lotusApiBaseUrl: configuredLotusApiBaseUrl(apiBaseUrl, resolvedLotusDeployEnv),
  turnkeyAuthEnabled: turnkeyEnabled ?? false,
  turnkeyApiBaseUrl: typeof turnkeyApiBaseUrl === "string" && turnkeyApiBaseUrl.length > 0
    ? turnkeyApiBaseUrl.replace(/\/$/, "")
    : "https://api.turnkey.com",
  turnkeyOrganizationId: typeof turnkeyOrganizationId === "string" ? turnkeyOrganizationId : "",
  turnkeyAuthProxyConfigId: typeof turnkeyAuthProxyConfigId === "string" ? turnkeyAuthProxyConfigId : "",
  turnkeyAuthProxyUrl: typeof turnkeyAuthProxyUrl === "string" && turnkeyAuthProxyUrl.length > 0
    ? turnkeyAuthProxyUrl.replace(/\/$/, "")
    : "/turnkey-auth-proxy",
  turnkeyOauthRedirectOrigin: normalizedOrigin(turnkeyOauthRedirectOrigin),
  lotusAuthExchangePath: typeof lotusAuthExchangePath === "string" && lotusAuthExchangePath.length > 0
    ? lotusAuthExchangePath
    : "/auth/turnkey/exchange",
  executionOrchestratorV1Enabled: executionOrchestratorEnabledForCurrentHost(executionOrchestratorV1Enabled),
};

export function lotusWsUrl(): string {
  const url = new URL(resolveBrowserUrl(resolveLotusWsBaseUrl()));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

export function lotusMarketDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return lotusMarketDiagnosticsEnabledForHost(window.location.hostname);
}

export function lotusMarketDiagnosticsEnabledForHost(hostname: string): boolean {
  return deployedFrontendKind(hostname) !== "production";
}

function resolveLotusWsBaseUrl(): string {
  return env.lotusApiBaseUrl;
}

function configuredLotusApiBaseUrl(value: unknown, deployEnv: LotusDeployEnv): string {
  if (typeof value === "string" && value.length > 0) return value.replace(/\/$/, "");
  return defaultLotusApiBaseUrlForDeployEnv(deployEnv);
}

function executionOrchestratorEnabledForCurrentHost(value: unknown): boolean {
  if (isDisabledFlag(value)) return false;
  if (isEnabledFlag(value)) return true;
  return resolvedLotusDeployEnv !== "local";
}

function configuredLotusDeployEnv(value: unknown): LotusDeployEnv {
  const normalized = normalizeDeployEnv(value);
  return normalized ?? inferDeployEnvFromHostname();
}

function normalizeDeployEnv(value: unknown): LotusDeployEnv | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "local" || normalized === "preview" || normalized === "staging" || normalized === "production") {
    return normalized;
  }
  return null;
}

function inferDeployEnvFromHostname(): LotusDeployEnv {
  if (typeof window === "undefined") return "local";

  const hostname = window.location.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return "local";

  const deployedKind = deployedFrontendKind(hostname);
  if (deployedKind) return deployedKind;

  return "preview";
}

function defaultLotusApiBaseUrlForDeployEnv(deployEnv: LotusDeployEnv): string {
  switch (deployEnv) {
    case "production":
    case "staging":
    case "preview":
      return "/api";
    case "local":
    default:
      return "http://localhost:3000";
  }
}

function deployedFrontendKind(hostname: string): Exclude<LotusDeployEnv, "local"> | null {
  if (hostname === "app.uselotus.xyz") return "production";
  if (hostname === "staging.uselotus.xyz") return "staging";
  if (hostname.endsWith(".workers.dev") || hostname.endsWith(".pages.dev")) return "preview";
  return null;
}

function normalizedOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function readRuntimeConfig(): LotusRuntimeConfig {
  if (typeof window === "undefined") return {};
  return window.__LOTUS_RUNTIME_CONFIG__ ?? {};
}

function firstConfiguredString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function firstConfiguredBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }

  return undefined;
}

function resolveBrowserUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;

  const base = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  return new URL(value, base).toString();
}
