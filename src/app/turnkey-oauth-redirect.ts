const productionOrigin = "https://app.uselotus.xyz";

const allowedTurnkeyOauthOrigins = new Set([
  productionOrigin,
  "https://staging.uselotus.xyz",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const normalizeOrigin = (origin: string): string | null => {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
};

export function resolveAllowedFrontendOrigin(origin = typeof window === "undefined" ? productionOrigin : window.location.origin): string {
  const normalized = normalizeOrigin(origin);
  return normalized && allowedTurnkeyOauthOrigins.has(normalized) ? normalized : productionOrigin;
}

export function resolveTurnkeyOauthRedirectUri(origin?: string): string {
  return `${resolveAllowedFrontendOrigin(origin)}/`;
}
