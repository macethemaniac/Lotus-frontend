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

Confirmed route:

- `POST /auth/turnkey/exchange`

Frontend behavior:

- The approved auth page is the app entry screen.
- Existing user sessions reconnect from local browser storage until the JWT expires.
- Turnkey React Wallet Kit is wired for Google, X/Twitter, passkey, and wallet auth.
- Turnkey requires `VITE_TURNKEY_ORGANIZATION_ID` and `VITE_TURNKEY_AUTH_PROXY_CONFIG_ID`.
- Turnkey API calls use `VITE_TURNKEY_API_BASE_URL` when set; the frontend default is `https://api.turnkey.com`.
- Turnkey OAuth redirect URI is selected from the frontend origin allowlist at runtime and falls back to `https://app.uselotus.xyz/`.
- Turnkey sessions are exchanged for a Lotus JWT through `VITE_LOTUS_AUTH_EXCHANGE_PATH`; the frontend default is `/auth/turnkey/exchange`.
- If the Lotus JWT exchange fails, the frontend does not treat the raw Turnkey session token as a Lotus API session.
- Admin auth endpoints are not used in the public frontend.

### Markets and Events

- `GET /markets/categories`
- `GET /markets`
- `GET /events`
- `GET /events/{eventId}`
- `GET /events/{eventId}/markets`
- `GET /markets/{marketId}`
- `GET /markets/{marketId}/outcomes`

Frontend rules:

- Market navigation uses backend canonical event and market IDs.
- Market and event media fields are optional: `imageUrl` and `iconUrl`.
- Media URLs are sanitized by the backend from approved venue metadata. The frontend may render those HTTPS URLs with `referrerPolicy="no-referrer"` and local category or venue fallbacks.
- The frontend must not call Polymarket, Myriad, Limitless, Predict.fun, or Opinion APIs directly for images or metadata.
- Dashboard market discovery is wired to `GET /markets`; authenticated dashboard cards and the markets list may additionally call `POST /execution/live-candidates` for visible Yes/No outcomes to display backend-sourced unified average prices across candidate venues, best Yes venue price, spread, available quote liquidity, and venue evidence.
- Market catalog responses may include optional aggregated `volume`, `volume24h`, `liquidity`, `buyVolume`, `sellVolume`, `tradeCount`, `buyCount`, and `sellCount` fields sourced from approved venue payloads. The frontend uses true catalog volume/liquidity when present, falls back to live quote liquidity when liquidity is absent, and renders buy/sell sentiment only from backend buy/sell count or volume fields.
- Venue market rows may include optional `change24h` and `changePercent24h`. In market list view, the `24h` and `Closes By` cells follow the same venue that produced the best displayed Yes price; positive 24h movement is green, negative movement is red, and missing movement remains quote/data pending.
- `GET /markets/{marketId}/orderbook?outcomeId&venue&depth` returns sanitized live backend depth from Lotus venue quote readers only. It includes unified `bids`, `asks`, per-venue books, best bid/ask, midpoint, spread, status, and blockers. The frontend must not fabricate depth rows.
- `GET /markets/{marketId}/chart?outcomeId&timeframe=1H|6H|1D|1W|1M|ALL` returns Lotus-owned live midpoint observations from backend venue orderbook snapshots, older approved historical state rows, and approved venue historical sources where available. It does not use Predexon or browser venue calls; older timeframes may return `historyStatus: "accumulating"` until Lotus has recorded enough snapshots.
- Backend snapshot recording is durable and sanitized. When `MARKET_ORDERBOOK_RECORDER_ENABLED=true`, Lotus polls approved open catalog markets through backend quote readers, stores price/depth snapshots in `venue_orderbook_snapshots`, and prunes old rows plus rows for expired/resolved or disabled catalog markets. Resolved/cancelled/disabled markets should not keep accumulating chart history.
- `POST /markets/quotes/batch` returns per-outcome partial quote success. A failed venue must not make the whole market unavailable when another venue returns a real live quote.
- Batch quote items may return `status: "live" | "partial" | "stale" | "unavailable"`. `stale` means Lotus is showing a previous backend-observed quote while a fresh read failed; it is display evidence only and cannot unlock execution by itself.
- Quote blockers are typed and venue-specific. Supported safe reasons include `QUOTE_PROVIDER_HTTP_<status>`, `QUOTE_PROVIDER_TIMEOUT`, `QUOTE_PROVIDER_EMPTY_BOOK`, `QUOTE_PROVIDER_BAD_PAYLOAD`, `VENUE_OUTCOME_ID_MISSING`, `OPINION_TOKEN_ID_MISSING`, and `QUOTE_SNAPSHOT_STALE`. Optional `detailsCode` is sanitized and never contains provider secrets or raw payloads.
- For binary display only, the frontend may show `No = 1 - live Yes` when backend has a valid live Yes price. Derived No is never executable unless the backend also returns a real No candidate/quote for that venue/outcome.
- Fields not returned by backend endpoints, including savings, order-flow counts, and historical movement, must render as quote-required/unavailable instead of fake values.
- Local development note from May 9, 2026: if `GET /markets` returns HTTP 500 with `relation "frontend_market_approvals" does not exist`, apply the existing backend migration for `frontend_market_approvals` before testing dashboard data population.

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
- `POST /funding/venue-activations/polymarket/clob-sync/prepare`
- `POST /funding/venue-activations/polymarket/clob-sync/submit`
- `GET /funding/history`
- `GET /funding/intents/{id}/receipt`
- `GET /funding/withdrawals/{id}/receipt`
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
- Polymarket `POLYMARKET_CLOB_SYNC_PENDING` means pUSD and on-chain approvals are visible, but CLOB has not confirmed spendable collateral. Treat it as a CLOB-auth sync state, not as ready-to-trade and not as a new on-chain activation requirement. The frontend may call the CLOB sync prepare/submit endpoints, collect the Turnkey EIP-712 `ClobAuth` signature, then refresh balances.

#### RFQ and Execution

OpenAPI documents:

- `POST /rfq`
- `POST /rfq/{id}/execution-scope-token`
- `POST /rfq/{id}/accept`
- `GET /rfq/{id}/executions/{executionId}/status`

Backend route source and OpenAPI also implement beta signed-bundle routes:

- `POST /execution/live-candidates`
- `POST /execution/quote`
- `POST /execution/submit`
- `POST /execution/{executionId}/prepare-signatures`
- `POST /execution/{executionId}/submit-signed-bundle`
- `GET /execution/{executionId}/live-readiness`
- `GET /execution/{executionId}/status`
- `GET /execution/positions`
- `GET /execution/portfolio/summary`
- `GET /execution/portfolio/timeseries`
- `GET /execution/history`
- `GET /execution/open-orders`
- `GET /execution/{executionId}/receipt`
- `POST /execution/{executionId}/prepare-exit`

Frontend rules:

- Do not select routes client-side.
- Do not bypass blockers.
- Do not call venue APIs.
- Do not show completed or settled until backend status supports it.
- `POST /execution/live-candidates` is user-authenticated live pricing evidence. The frontend can use it for visible market unified price displays and terminal quote preparation, but it must preserve backend blockers and cannot infer routeability from catalog metadata alone.
- `POST /execution/live-candidates` returns usable candidates plus `blocked[]` rows when only some venues fail. `blocked[]` preserves `venue`, `reason`, optional `venueMarketId`, optional `venueOutcomeId`, and optional sanitized `detailsCode`.
- Live candidate blockers use the same typed quote blocker vocabulary as market batch quotes. User-facing copy should normalize those codes to actionable labels such as `Opinion quote unavailable`, `Token mapping missing`, or `Provider timeout`; raw backend exception strings and provider payloads are never shown.
- Staging route policy may prefer a real multi-venue route for route-coverage testing when the quote amount is large enough: at least about `$49.95` can start as a pair route, and at least `$500` can expand to the widest executable pair/tri/strict-all style route available. This uses only live executable backend candidates, never fake legs. Production route policy remains economics-first and does not force splits unless the backend quote engine finds a valid improving route.
- When staging selects this coverage route, the backend decision reason may be `staging_multi_venue_selected_for_route_coverage`. The frontend still treats the returned quote as backend-selected and does not choose or rebalance route legs client-side.
- Opinion builder credentials are backend-only config (`OPINION_API_KEY` or `OPINION_BUILDER_API_KEY`). The frontend never receives the key and never calls Opinion directly. Opinion account/readiness and quote preparation may clear blockers, but live Opinion order submission stays disabled unless backend execution mode and separate production approval explicitly enable it.
- Terminal bottom tabs use backend-only contracts: outcomes and live candidates for market outcome pricing, positions/open-orders/history HTTP polling as realtime fallback, and resolution-risk canonical/venue market profiles for rules and compatibility.
- Rules and Risk venue text must be backend-verified for the exact selected venue market. Polymarket rules are hydrated from Gamma metadata when available; Limitless rules are hydrated from Limitless market detail/public detail metadata when available; other venues use only trusted ingested venue profile rule/source fields. The frontend must show unavailable rule metadata when these fields are `null`, not fallback titles or inferred copy.
- Rules and Risk `oracleName` / `oracleType` fields identify the venue-declared resolution source, not the venue brand. The visible source type is the named provider from `oracleName` (for example, Binance), the source market is the remaining instrument/symbol (for example, BTC/USDT), and `oracleType` is shown only as the resolution method/category. Source URLs in `metadata.officialVenueRules.sourceUrl` and URLs inside verified rule/source text are rendered as outbound HTTPS hyperlinks, including UMA or other oracle-source links when the backend provides them.
- When both canonical and selected venue-market risk responses are available, the terminal displays the selected venue-market assessments first and uses the canonical list only as fallback.
- Mark-to-market fields are backend-sourced from live quote evidence. If marks are unavailable, keep positions visible and show the backend unavailable state instead of fake PnL.
- Portfolio time-series is currently a backend-generated current MTM snapshot (`seriesBasis: CURRENT_MARK_TO_MARKET_SNAPSHOT`, `historyAvailable: false`) until persisted historical portfolio snapshots exist.
- Open orders include only non-dry-run signed-bundle executions with `SUBMITTED` or `PARTIAL` status. Limit-order creation/list/cancel is not part of this contract slice.

###### Realtime

WebSocket endpoint:

- `/ws`

Supported execution topics from backend:

- `execution:user:<userId>`
- `execution:quote:<executionId>`
- `execution:portfolio:<userId>`
- `execution:positions:<userId>:<marketHash>:<outcomeHash>`
- `notifications:user:<userId>`

Supported events:

- `EXECUTION_STATUS_UPDATE`
- `EXECUTION_POSITION_UPDATE`
- `EXECUTION_MARK_UPDATE`
- `EXECUTION_PORTFOLIO_UPDATE`
- `EXECUTION_READINESS_UPDATE`
- `EXECUTION_BALANCE_UPDATE`
- `USER_NOTIFICATION`

HTTP polling remains fallback for execution status and positions. The current app shell subscribes to user notification, portfolio, and user execution topics, then refreshes durable HTTP data after relevant realtime events.

###### Not Wired In This Slice

- Admin endpoints.
- Venue provider APIs.
- Footer as production route.
- Alerts page as production route.
- Leaderboard as production route.
- Limit-order creation/cancel UI.
- Smart fee router UI.
- Historical PnL charts while portfolio time-series reports `historyAvailable: false`.
