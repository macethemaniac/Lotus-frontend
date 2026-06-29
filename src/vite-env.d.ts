/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXECUTION_ORCHESTRATOR_V1_ENABLED?: string;
  readonly VITE_LOTUS_API_BASE_URL?: string;
  readonly VITE_LOTUS_AUTH_EXCHANGE_PATH?: string;
  readonly VITE_LOTUS_DEPLOY_ENV?: "local" | "preview" | "staging" | "production";
  readonly VITE_TURNKEY_API_BASE_URL?: string;
  readonly VITE_TURNKEY_AUTH_ENABLED?: string;
  readonly VITE_TURNKEY_AUTH_PROXY_CONFIG_ID?: string;
  readonly VITE_TURNKEY_AUTH_PROXY_URL?: string;
  readonly VITE_TURNKEY_OAUTH_REDIRECT_ORIGIN?: string;
  readonly VITE_TURNKEY_ORGANIZATION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __LOTUS_RUNTIME_CONFIG__?: {
    lotusApiBaseUrl?: string;
    turnkeyAuthEnabled?: boolean | string;
    turnkeyAuthProxyConfigId?: string;
    turnkeyAuthProxyUrl?: string;
    turnkeyOauthRedirectOrigin?: string;
    turnkeyOrganizationId?: string;
  };
}
