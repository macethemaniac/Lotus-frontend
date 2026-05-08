import { decodeUserIdFromJwt, type AuthSession } from "@/features/auth/types";

const SESSION_STORAGE_KEY = "lotus:user-session";

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isJwtExpired(jwt: string, nowMs = Date.now()): boolean {
  const payload = decodeJwtPayload(jwt);
  const exp = payload?.exp;
  if (typeof exp !== "number") return false;
  return exp * 1000 <= nowMs;
}

export function createSessionFromJwt(userJwt: string): AuthSession {
  return {
    userJwt,
    userId: decodeUserIdFromJwt(userJwt),
  };
}

export function loadStoredSession(): AuthSession | null {
  const storedValue = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!storedValue) return null;

  if (!storedValue.trim().startsWith("{")) {
    if (isJwtExpired(storedValue)) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return createSessionFromJwt(storedValue);
  }

  let storedSession: AuthSession;
  try {
    storedSession = JSON.parse(storedValue) as AuthSession;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }

  if (storedSession.userJwt && isJwtExpired(storedSession.userJwt)) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
  return storedSession;
}

export function storeSession(session: AuthSession): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
