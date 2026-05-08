# Lotus Frontend Backend Contract

This contract is derived from:

- `docs/api/openapi.yaml`
- `docs/engineering/LOTUS_BACKEND_BUILD_MAP.md`
- `docs/runbooks/funding-flow-v0-handoff.md`
- `docs/runbooks/withdrawal-flow-v1-adapter-design.md`
- `docs/runbooks/execution-control-layer-runbook.md`
- `docs/runbooks/lotus-prod-rollout-master.md`
- `docs/security/LOTUS_SECURITY_CHECKLIST.md`
- backend route source for `/execution/*` routes not yet represented in OpenAPI

## User-Facing Endpoints Used In This Slice

### Authentication

Current blocker:

- A user-facing Turnkey session-to-Lotus JWT exchange endpoint is not documented in OpenAPI and was not found as an approved user auth route.

Frontend behavior:

- The approved auth page is the app entry screen.
- Existing user sessions reconnect from local browser storage until the JWT expires.
- Turnkey React Wallet Kit is wired for Google, X/Twitter, passkey, and wallet auth.
- Turnkey requires `VITE_TURNKEY_ORGANIZATION_ID` and `VITE_TURNKEY_AUTH_PROXY_CONFIG_ID`.
- Turnkey OAuth callback uses `VITE_TURNKEY_OAUTH_REDIRECT_URI` when set, otherwise the browser origin.
- Turnkey sessions can open the app shell, but backend API calls still need a Lotus JWT.
- Lotus JWT exchange is expected through `VITE_LOTUS_AUTH_EXCHANGE_PATH` once the approved backend user auth exchange route exists.
- Admin auth endpoints are not used in the public frontend.

### Wallets and Venue Accounts

- `GET /user/wallets`
- `POST /user/wallets/ensure-defaults`
- `GET /user/venue-accounts`
- `GET /user/venue-accounts/{venue}`
- `POST /user/venue-accounts/{venue}/ensure`
- `POST /user/venue-accounts/setup-batch`
- `POST /user/venue-accounts/complete-batch`
- `POST /user/venue-accounts/predict_fun/auth-message`
- `POST /user/venue-accounts/predict_fun/complete-auth`

Frontend rules:

- Display public wallet and venue metadata only.
- Never display Turnkey provider internals, signatures, auth tokens, export bundles, private keys, or raw venue payloads.
- Setup signatures must be signed by the user's wallet.

### Funding and Withdrawal

- `POST /funding/intents`
- `GET /funding/intents/{id}`
- `POST /funding/intents/{id}/quote`
- `POST /funding/intents/{id}/submit`
- `GET /funding/intents/{id}/status`
- `GET /funding/venue-balances`
- `GET /funding/venue-activations`
- `GET /funding/history`
- `POST /funding/withdrawals`
- `GET /funding/withdrawals/{id}`
- `POST /funding/withdrawals/{id}/quote`
- `POST /funding/withdrawals/{id}/submit`
- `GET /funding/withdrawals/{id}/status`
- `GET /funding/venues/capabilities`

Frontend rules:

- Funding and withdrawal are non-custodial.
- Do not enable trading based on a wallet balance, bridge receipt, or destination received state alone.
- Only backend readiness and execution preflight can mark capital usable for execution.

### RFQ and Execution

OpenAPI documents:

- `POST /rfq`
- `POST /rfq/{id}/execution-scope-token`
- `POST /rfq/{id}/accept`
- `GET /rfq/{id}/executions/{executionId}/status`

Backend route source also implements beta signed-bundle routes:

- `POST /execution/live-candidates`
- `POST /execution/quote`
- `POST /execution/submit`
- `POST /execution/{executionId}/prepare-signatures`
- `POST /execution/{executionId}/submit-signed-bundle`
- `GET /execution/{executionId}/live-readiness`
- `GET /execution/{executionId}/status`
- `GET /execution/positions`
- `POST /execution/{executionId}/prepare-exit`

Documentation gap:

- The `/execution/*` signed-bundle routes should be added to OpenAPI. They are used here only because backend source confirms implementation and they are required for the current private-beta tester-to-product path.

Frontend rules:

- Do not select routes client-side.
- Do not bypass blockers.
- Do not call venue APIs.
- Do not show completed or settled until backend status supports it.

## Realtime

WebSocket endpoint:

- `/ws`

Supported execution topics from backend:

- `execution:user:<userId>`
- `execution:quote:<executionId>`
- `execution:positions:<userId>:<marketHash>:<outcomeHash>`

Supported events:

- `EXECUTION_STATUS_UPDATE`
- `EXECUTION_POSITION_UPDATE`
- `EXECUTION_READINESS_UPDATE`
- `EXECUTION_BALANCE_UPDATE`

HTTP polling remains fallback for execution status and positions.

## Not Wired In This Slice

- Admin endpoints.
- Venue provider APIs.
- Footer as production route.
- Alerts/notifications as production route.
- Leaderboard as production route.
- Smart fee router UI.
- PnL aggregate charts without backend contract.
