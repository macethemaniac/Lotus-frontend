export type AuthSession = {
  userJwt: string;
  userId: string;
  turnkeySessionToken?: string;
  turnkeyOrganizationId?: string;
  source?: "lotus_jwt" | "turnkey";
};

export function decodeUserIdFromJwt(jwt: string): string {
  const parts = jwt.split(".");
  if (parts.length < 2) return "unknown-user";
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    return typeof payload.userId === "string" ? payload.userId : "unknown-user";
  } catch {
    return "unknown-user";
  }
}
