# Lotus Frontend

Lotus customer-facing frontend built with `Vite` and `React`.

The app now supports Cloudflare edge deployment through a Worker that:

- serves the built SPA assets
- rewrites HTML navigations to `index.html`
- proxies same-origin `/api/*` requests to the Lotus backend
- proxies `/ws` websocket traffic to the backend
- proxies `/turnkey-auth-proxy/*` to Turnkey

## Stack

- `React`
- `Vite`
- `TypeScript`
- `Wrangler`
- `Cloudflare Workers`

## Local development

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run typecheck
npm run preview
npm run cf:dev
```

## Deployment model

Frontend domains:

- `app.uselotus.xyz`
- `staging.uselotus.xyz`

Backend origins:

- production: `https://api.uselotus.xyz`
- staging: `https://staging-api.uselotus.xyz`

Cloudflare Worker responsibilities:

1. Serve the compiled SPA from `dist/`
2. Keep SPA refresh and deep links working
3. Eliminate browser CORS issues by using same-origin `/api` and `/ws`
4. Keep Turnkey auth traffic on the same frontend origin

The Worker entrypoint is [`cloudflare/worker.ts`](/Users/davidarnal/Documents/Lotus/Lotus-frontend/cloudflare/worker.ts).

## Environment variables

### Frontend build variables

Use `.env.staging.example` and `.env.production.example` as templates.

Required Vite variables:

```txt
VITE_LOTUS_DEPLOY_ENV=staging|production|preview|local
VITE_LOTUS_API_BASE_URL=/api
VITE_TURNKEY_AUTH_ENABLED=true
VITE_TURNKEY_ORGANIZATION_ID=<turnkey-org-id>
VITE_TURNKEY_AUTH_PROXY_CONFIG_ID=<turnkey-config-id>
VITE_TURNKEY_AUTH_PROXY_URL=/turnkey-auth-proxy
VITE_LOTUS_AUTH_EXCHANGE_PATH=/auth/turnkey/exchange
VITE_TURNKEY_OAUTH_REDIRECT_ORIGIN=https://staging.uselotus.xyz|https://app.uselotus.xyz
```

### Worker runtime variables

Configured through `wrangler.jsonc` and Cloudflare environment settings:

```txt
LOTUS_API_ORIGIN=https://staging-api.uselotus.xyz   # staging
LOTUS_API_ORIGIN=https://api.uselotus.xyz           # production
TURNKEY_AUTH_PROXY_URL=https://authproxy.turnkey.com
```

Runtime secret:

```txt
TURNKEY_AUTH_PROXY_CONFIG_ID
```

Set the secret with:

```bash
npx wrangler secret put TURNKEY_AUTH_PROXY_CONFIG_ID --env staging
npx wrangler secret put TURNKEY_AUTH_PROXY_CONFIG_ID --env production
```

## Cloudflare deploy commands

```bash
npm run cf:deploy:staging
npm run cf:deploy:production
```

Worker configuration lives in [`wrangler.jsonc`](/Users/davidarnal/Documents/Lotus/Lotus-frontend/wrangler.jsonc).

## Notes

- Preview and `workers.dev` environments use the same-origin proxy approach as staging and production.
- The frontend env layer resolves deployment mode explicitly instead of relying on hostname-specific platform assumptions.
- API traffic should go through `/api`, not direct browser calls to backend origins.
