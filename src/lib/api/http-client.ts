import { env } from "@/config/env";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiOptions = {
  method?: HttpMethod;
  baseUrl?: string;
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly payload: unknown;

  constructor(input: { message: string; status: number; code?: string; payload: unknown }) {
    super(input.message);
    this.name = "ApiClientError";
    this.status = input.status;
    this.code = input.code;
    this.payload = input.payload;
  }
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const text = await response.text();
  const payload = parseJson(text);

  if (!response.ok) {
    const message = getStringField(payload, "message") ?? getStringField(payload, "error") ?? response.statusText;
    const code = getStringField(payload, "code");
    throw new ApiClientError({ message, status: response.status, code, payload });
  }

  return payload as T;
}

function resolveApiBaseUrl(baseUrlOverride?: string): string {
  if (baseUrlOverride !== undefined) return baseUrlOverride.replace(/\/$/, "");
  if (shouldUseSameOriginApiProxy()) return "/api";
  return env.lotusApiBaseUrl;
}

function shouldUseSameOriginApiProxy(): boolean {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;

  return hostname.endsWith(".vercel.app") || hostname === "staging.uselotus.xyz" || hostname === "app.uselotus.xyz";
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getStringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object" || !(field in value)) return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : undefined;
}
