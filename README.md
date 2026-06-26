# Lotus Frontend

## Local development

```bash
npm install
npm run dev
```

## Cloudflare

This app is a Vite SPA deployed through a Cloudflare Worker that:

- serves the compiled `dist/` assets
- rewrites HTML navigations to `index.html`
- proxies `/api/*` and `/ws` to the Lotus backend
- proxies `/turnkey-auth-proxy/*` to Turnkey

### Build-time environment variables

Set these in Cloudflare build settings:

```txt
VITE_LOTUS_DEPLOY_ENV=staging|production|preview
VITE_LOTUS_API_BASE_URL=/api
VITE_TURNKEY_AUTH_ENABLED=true
VITE_TURNKEY_ORGANIZATION_ID=<turnkey-org-id>
VITE_TURNKEY_AUTH_PROXY_CONFIG_ID=<turnkey-config-id>
VITE_TURNKEY_AUTH_PROXY_URL=/turnkey-auth-proxy
VITE_LOTUS_AUTH_EXCHANGE_PATH=/auth/turnkey/exchange
```

### Cloudflare environment matrix

#### Staging

```txt
VITE_LOTUS_DEPLOY_ENV=staging
VITE_LOTUS_API_BASE_URL=/api
VITE_TURNKEY_AUTH_ENABLED=true
VITE_TURNKEY_ORGANIZATION_ID=<turnkey-org-id>
VITE_TURNKEY_AUTH_PROXY_CONFIG_ID=<turnkey-config-id>
VITE_TURNKEY_AUTH_PROXY_URL=/turnkey-auth-proxy
VITE_LOTUS_AUTH_EXCHANGE_PATH=/auth/turnkey/exchange
VITE_TURNKEY_OAUTH_REDIRECT_ORIGIN=https://staging.uselotus.xyz
```

#### Production

```txt
VITE_LOTUS_DEPLOY_ENV=production
VITE_LOTUS_API_BASE_URL=/api
VITE_TURNKEY_AUTH_ENABLED=true
VITE_TURNKEY_ORGANIZATION_ID=<turnkey-org-id>
VITE_TURNKEY_AUTH_PROXY_CONFIG_ID=<turnkey-config-id>
VITE_TURNKEY_AUTH_PROXY_URL=/turnkey-auth-proxy
VITE_LOTUS_AUTH_EXCHANGE_PATH=/auth/turnkey/exchange
VITE_TURNKEY_OAUTH_REDIRECT_ORIGIN=https://app.uselotus.xyz
```

### Worker runtime variables

Set these in `wrangler` or Cloudflare Worker environment variables:

```txt
LOTUS_API_ORIGIN=https://staging-api.uselotus.xyz   # staging env
LOTUS_API_ORIGIN=https://api.uselotus.xyz           # production env
TURNKEY_AUTH_PROXY_CONFIG_ID=<turnkey-config-id>
TURNKEY_AUTH_PROXY_URL=https://authproxy.turnkey.com
```

Runtime secret commands:

```bash
npx wrangler secret put TURNKEY_AUTH_PROXY_CONFIG_ID --env staging
npx wrangler secret put TURNKEY_AUTH_PROXY_CONFIG_ID --env production
```

### Commands

```bash
npm run build
npm run cf:dev
npm run cf:deploy:staging
npm run cf:deploy:production
```
