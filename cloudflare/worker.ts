interface Env {
  ASSETS: Fetcher;
  LOTUS_API_ORIGIN?: string;
  TURNKEY_AUTH_PROXY_CONFIG_ID?: string;
  TURNKEY_AUTH_PROXY_URL?: string;
}

const LOTUS_API_PREFIX = "/api";
const TURNKEY_PROXY_PREFIX = "/turnkey-auth-proxy";
const WEBSOCKET_PATH = "/ws";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === LOTUS_API_PREFIX || url.pathname.startsWith(`${LOTUS_API_PREFIX}/`)) {
      return proxyLotusBackend(request, env, LOTUS_API_PREFIX);
    }

    if (url.pathname === WEBSOCKET_PATH || url.pathname.startsWith(`${WEBSOCKET_PATH}/`)) {
      return proxyLotusBackend(request, env);
    }

    if (url.pathname === TURNKEY_PROXY_PREFIX || url.pathname.startsWith(`${TURNKEY_PROXY_PREFIX}/`)) {
      return proxyTurnkey(request, env);
    }

    return serveSpaAsset(request, env);
  },
};

async function serveSpaAsset(request: Request, env: Env): Promise<Response> {
  const directResponse = await env.ASSETS.fetch(request);
  if (directResponse.status !== 404 || !isHtmlNavigation(request)) return directResponse;

  const indexUrl = new URL(request.url);
  indexUrl.pathname = "/index.html";
  return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
}

async function proxyLotusBackend(request: Request, env: Env, prefixToStrip = ""): Promise<Response> {
  const backendOrigin = env.LOTUS_API_ORIGIN?.trim();
  if (!backendOrigin) {
    return new Response("LOTUS_API_ORIGIN is not configured.", { status: 500 });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(stripOptionalPrefix(incomingUrl.pathname, prefixToStrip), backendOrigin);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("origin");
  headers.delete("referer");

  return fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body: canIncludeBody(request.method) ? request.body : undefined,
    redirect: "manual",
  });
}

async function proxyTurnkey(request: Request, env: Env): Promise<Response> {
  const configId = env.TURNKEY_AUTH_PROXY_CONFIG_ID?.trim();
  if (!configId) {
    return new Response("TURNKEY_AUTH_PROXY_CONFIG_ID is not configured.", { status: 500 });
  }

  const incomingUrl = new URL(request.url);
  const targetBaseUrl = env.TURNKEY_AUTH_PROXY_URL?.trim() || "https://authproxy.turnkey.com";
  const targetPath = incomingUrl.pathname.replace(TURNKEY_PROXY_PREFIX, "") || "/";
  const targetUrl = new URL(targetPath, targetBaseUrl);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.set("X-Auth-Proxy-Config-ID", configId);
  headers.delete("origin");
  headers.delete("referer");

  return fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body: canIncludeBody(request.method) ? request.body : undefined,
    redirect: "manual",
  });
}

function isHtmlNavigation(request: Request): boolean {
  if (request.method !== "GET") return false;

  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function canIncludeBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function stripOptionalPrefix(pathname: string, prefix: string): string {
  if (!prefix || pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}
