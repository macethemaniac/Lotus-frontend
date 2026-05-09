# Lotus Backend To Frontend Implementation Map

Status: implementation pass in progress
Last updated: 2026-05-09

This document is the working implementation map for wiring the Lotus user-facing frontend to the local Lotus RFQ backend. It does not change runtime behavior. It should be updated before each major frontend implementation slice and used as the handoff checklist for staging.

## 1. Source Of Truth

Frontend source of truth:

- Approved Lotus design files and mockups in `src/design/mockups`.
- `rules.md` in this frontend repo.
- Existing shared components, app shell, icon assets, and CSS conventions.

Backend source of truth:

- Local backend route code in `C:\Users\Admin\Documents\lotus-RFQ-service\lotus-rfq-service`.
- Backend OpenAPI and engineering docs where present.
- Backend route source wins when OpenAPI is behind implementation, but the gap must be documented before wiring production UI.

Hard rules:

- No frontend route calls venue APIs directly.
- No admin JWTs, admin endpoints, or internal endpoints in the public UI.
- No frontend override of backend blockers, readiness, funding, allowance, live-submit, or settlement state.
- No invented endpoint, field, status, or user flow.
- No custody language. Lotus routes, verifies, and relays user-approved actions; users keep wallet control.
- Work ships to `staging` first. `main` only moves when explicitly approved.

## 2. Confirmed User-Facing Backend Surface

### Auth

`POST /auth/turnkey/exchange`

Purpose in user terms:

- Converts a verified Turnkey login session into a Lotus backend JWT.
- This is what lets the logged-in user call Lotus APIs.

Expected body from frontend:

- `turnkeySessionToken`
- `turnkeyUserId`
- `turnkeyOrganizationId`

Expected response:

- `userJwt`
- `tokenType`
- `expiresInSeconds`
- public `user` identity fields

Frontend rule:

- Store only the Lotus JWT and safe user session metadata needed for app reconnect.
- Never show or log Turnkey session tokens.
- Do not store the raw Turnkey session token as a replacement Lotus API JWT when backend exchange fails.

### Markets And Events

Confirmed routes:

- `GET /markets/categories`
- `GET /markets`
- `GET /events`
- `GET /event`
- `GET /market-events`
- `GET /events/:eventId`
- `GET /event/:eventId`
- `GET /market-events/:eventId`
- `GET /events/:eventId/markets`
- `GET /event/:eventId/markets`
- `GET /market-events/:eventId/markets`
- `GET /markets/:marketId`
- `GET /markets/:marketId/outcomes`

Purpose in user terms:

- Feeds dashboard market cards, markets list, terminal event selector, and outcome rows.
- Lets users click a market anywhere and land on the terminal for that exact canonical market.

Frontend rule:

- Use backend canonical IDs for navigation and quote requests.
- Do not infer venue market IDs in the frontend.
- Render backend-provided `imageUrl`/`iconUrl` only after backend sanitization; fallback to local category or venue icons when media is absent or fails to load.
- Do not call venue APIs directly for market images or metadata.

### Wallet And Venue Accounts

Confirmed routes:

- `GET /user/wallets`
- `POST /user/wallets/ensure-defaults`
- `GET /user/venue-accounts`
- `GET /user/venue-accounts/:venue`
- `POST /user/venue-accounts/:venue/ensure`
- `POST /user/venue-accounts/setup-batch`
- `POST /user/venue-accounts/complete-batch`
- `POST /user/venue-accounts/opinion/complete-link`
- `POST /user/venue-accounts/predict_fun/auth-message`
- `POST /user/venue-accounts/predict_fun/complete-auth`

Purpose in user terms:

- Creates or reconnects the user-owned wallet records.
- Links venue accounts so Lotus can check readiness and relay user-signed orders where supported.

Frontend rule:

- Show public wallet address, venue, status, and setup action.
- Do not expose provider account IDs, raw provider payloads, Turnkey internals, or signatures.

### Funding And Withdrawal

Confirmed routes:

- `POST /funding/intents`
- `GET /funding/intents/:id`
- `POST /funding/intents/:id/quote`
- `POST /funding/intents/:id/submit`
- `GET /funding/intents/:id/status`
- `GET /funding/venues/capabilities`
- `GET /funding/venue-balances`
- `GET /funding/venue-activations`
- `POST /funding/venue-activations/polymarket/prepare`
- `POST /funding/venue-activations/polymarket/submit`
- `GET /funding/history`
- `POST /funding/withdrawals`
- `GET /funding/withdrawals/:id`
- `POST /funding/withdrawals/:id/quote`
- `POST /funding/withdrawals/:id/submit`
- `GET /funding/withdrawals/:id/status`
- `GET /user/withdrawal-wallets`
- `PUT /user/withdrawal-wallets/evm`

Purpose in user terms:

- Lets users fund venue-ready capital, check which venues are ready, activate funds where required, and withdraw to a selected wallet where supported.

Frontend rule:

- Funding is not tradeable until backend says `READY_TO_TRADE` or returns equivalent venue readiness.
- A wallet balance, bridge receipt, or submitted transaction hash is not enough to enable trading.

### RFQ And Signed Execution

Confirmed RFQ routes:

- `POST /rfq`
- `POST /rfq/:id/execution-scope-token`
- `POST /rfq/:id/accept`
- `GET /rfq/:id/executions/:executionId/status`

Confirmed signed-bundle execution routes:

- `POST /execution/live-candidates`
- `POST /execution/quote`
- `POST /execution/submit`
- `POST /execution/:executionId/prepare-signatures`
- `POST /execution/:executionId/submit-signed-bundle`
- `GET /execution/:executionId/live-readiness`
- `GET /execution/:executionId/status`
- `GET /execution/positions`
- `GET /execution/portfolio/summary`
- `GET /execution/portfolio/timeseries`
- `GET /execution/history`
- `GET /execution/open-orders`
- `GET /execution/:executionId/receipt`
- `POST /execution/:executionId/prepare-exit`

Purpose in user terms:

- Shows live routeable venues for a market.
- Builds a quote from backend evidence.
- Prepares any user signatures.
- Submits only after backend readiness passes.
- Tracks fills, settlement, and positions from backend-verified evidence.

Frontend rule:

- The frontend never chooses the final route. It asks the backend to quote and uses the route returned.
- The frontend never marks a trade filled or settled without backend confirmation.

### Resolution Risk

Confirmed routes:

- `GET /resolution-risk/canonical/:eventId`
- `GET /resolution-risk/pair`
- `GET /resolution-risk/market/:venue/:marketId`

Purpose in user terms:

- Explains whether linked markets are truly compatible and why a route is safe or blocked.

Frontend rule:

- Use these routes for Rules and Risk UI where they match the selected event or market.
- Do not invent risk text for unsupported events.
- Venue rule text must come from backend-verified venue metadata for the exact selected venue market. Polymarket uses Gamma market metadata when available; Limitless uses the market detail metadata endpoint/public detail payload when available; other venues use only trusted ingested `venue_market_profiles` / `venue_resolution_profiles` rule fields.
- If the backend cannot verify official venue rule text or resolution source text, the Rules and Risk UI must show that the venue rule metadata is unavailable instead of displaying a title, synthetic curated label, or inferred copy as rules.

### Realtime

Confirmed transport:

- WebSocket `/ws`

Execution topics:

- `execution:user:<userId>`
- `execution:quote:<executionId>`
- `execution:portfolio:<userId>`
- `execution:positions:<userId>:<marketHash>:<outcomeHash>`
- `notifications:user:<userId>`

Execution event types:

- `EXECUTION_STATUS_UPDATE`
- `EXECUTION_POSITION_UPDATE`
- `EXECUTION_MARK_UPDATE`
- `EXECUTION_PORTFOLIO_UPDATE`
- `EXECUTION_READINESS_UPDATE`
- `EXECUTION_BALANCE_UPDATE`
- `USER_NOTIFICATION`

Purpose in user terms:

- Updates order status, fills, positions, balances, and readiness without requiring manual refresh.

Frontend rule:

- WebSocket is primary for active execution state.
- HTTP polling stays as fallback.
- Backend remains the source of truth.

## 3. Known Contract Gaps Before Production Wiring

These are not blockers for planning, but they must be resolved before a production-quality user flow claims the feature is live.

1. Dashboard route-quality fields

- Designs show best routes, spreads, savings, venue count, and fallback.
- Confirmed market endpoints do not return executable prices by themselves.
- Current beta behavior: show backend-provided market metadata first, then authenticated dashboard cards/list rows request `POST /execution/live-candidates` for visible Yes/No outcomes. Outcome numbers are unified averages across backend candidate venues; the headline price uses the best Yes venue and shows its venue brand.
- Savings and order-flow counts remain quote-required/unavailable until backend returns those fields from a quote or analytics contract.

1. Full order book depth in terminal

- Terminal design shows order book rows by venue.
- `POST /execution/live-candidates` proves executable route candidates and unified live quote evidence, but it does not expose sanitized full depth rows to the frontend.
- Safe beta behavior: render only backend quote evidence that exists. Do not fabricate order book rows.
- Backend blocker: add a public, sanitized order book contract before the terminal can render full bid/ask depth like venue-native trading screens.

1. Portfolio aggregate PnL and time-series chart

- `GET /execution/positions` is confirmed.
- `GET /execution/portfolio/summary` is confirmed for verified positions plus live mark-to-market fields.
- `GET /execution/portfolio/timeseries` is confirmed for a backend-generated current MTM snapshot.
- Mark-to-market is live-quote-required: unavailable marks keep the position visible with `markFreshness: "unavailable"` and null mark/PnL fields.
- Safe beta behavior: use verified positions and backend mark fields only. Treat the time-series response as current snapshot data while `historyAvailable` is false; do not draw fake historical PnL.

1. Open orders and trade history list

- `GET /execution/:executionId/status` is confirmed for one execution.
- `GET /execution/history` is confirmed for backend-confirmed signed-bundle execution history.
- `GET /execution/open-orders` is confirmed for non-dry-run signed-bundle executions in `SUBMITTED` or `PARTIAL` state.
- `GET /execution/:executionId/receipt` is confirmed for sanitized execution receipts.
- Safe beta behavior: show only backend-confirmed open orders, execution history, and receipts. Do not infer fills or settlement client-side. Limit orders are a later layer and remain disabled unless a separate backend contract is approved.

1. Notifications persistence

- Realtime WS events exist for execution/readiness/balance, portfolio/mark, and notification changes.
- Persistent notification inbox endpoints are confirmed:
  - `GET /notifications`
  - `POST /notifications/:id/read`
  - `POST /notifications/read-all`
- Safe beta behavior: use the durable inbox for persistence and WebSocket `USER_NOTIFICATION` for realtime updates.

1. Watchlist persistence

- No confirmed user watchlist endpoint yet.
- Safe beta behavior: local-only watchlist for private beta if approved, or disabled until backend persistence exists.

1. Limit orders

- Backend live path has been validated around market/live quote flows.
- A production limit-order creation/list/cancel contract is not confirmed for all venues.
- Safe beta behavior: keep Market order active; keep Limit visible but disabled or "coming after beta" unless backend confirms a contract.

1. Venue activation beyond Polymarket

- Polymarket activation prepare/submit routes are confirmed.
- Other venue activation should use venue setup/readiness routes until specific activation endpoints exist.
- Safe beta behavior: show per-venue setup or blocked state from backend readiness.

## 4. Implementation Phases

### Phase 0 - Contract Reconciliation

Goal:

- Bring the frontend contract document in line with local backend route truth.

Work:

- Update `docs/contracts/FRONTEND_BACKEND_CONTRACT.md`.
- Capture confirmed request/response shapes for auth, markets, funding, execution, positions, and WebSocket events.
- Mark missing endpoints as blockers, not fake clients.

Done when:

- Each user flow has a known endpoint or a documented blocker.
- No page needs an invented route.

### Phase 1 - Auth And Session

Goal:

- Make Turnkey login produce a Lotus JWT and reconnect cleanly.

Pages and buttons:

- Auth screen: Google and X buttons start Turnkey hosted OAuth.
- Submit email: only enabled if Turnkey/backend email flow is confirmed.
- Logout: clears Lotus session and Turnkey state.
- Existing session reconnect: if JWT is valid, enter dashboard without showing login.

Backend:

- `POST /auth/turnkey/exchange`

User-facing behavior:

- User logs in once, then the app reconnects until the session expires.
- If backend exchange fails, the user sees a safe login error and no app data loads.

Security:

- Do not log Turnkey session tokens or full JWTs.
- Do not store admin tokens.

Implementation status:

- Turnkey modal login is wired through the existing auth screen.
- Lotus JWT exchange defaults to `/auth/turnkey/exchange`.
- Raw Turnkey session token fallback has been removed from app entry.

### Phase 2 - Shared Data Clients

Goal:

- Build stable frontend clients before wiring pages.

Work:

- One HTTP client attaches the Lotus user JWT.
- Domain clients:
  - auth
  - markets
  - wallets
  - venue accounts
  - funding
  - withdrawals
  - execution
  - resolution risk
  - WebSocket execution updates

Implementation status:

- Typed clients exist for auth exchange, market catalog, wallets, venue accounts, funding balances/capabilities/receipts, execution portfolio/history/open-orders/receipts, notifications, and execution WebSocket updates.
- The production app shell consumes these clients directly; the old design mockups remain as references.
- Normalize backend errors into user-safe messages.

Done when:

- Each endpoint has one typed client function.
- No page builds raw fetch calls.
- No client calls admin or internal routes.

### Phase 3 - App Shell, Navigation, And Account Menu

Goal:

- Make navigation work across the approved dashboard, markets, terminal, and portfolio surfaces.

Sidebar buttons:

- Home: opens dashboard.
- Markets: opens market list view.
- Terminal: opens the last selected market terminal, or a safe default market from backend.
- Portfolio: opens portfolio.
- Settings: opens settings shell only if designed/approved; otherwise disabled with a tooltip.

Header:

- Search: filters markets or routes to market results.
- Theme toggle: dark/light with Lotus off-white light mode.
- Notification icon: opens in-session notification panel.
- Account pill: opens Lotus account dropdown.

Account dropdown:

- Shows safe public account address.
- Shows session status.
- Shows logout.
- Does not show private IDs, provider internals, or admin actions.

Footer:

- Use the approved dense strip footer variant globally.
- It must not cover sidebar buttons or terminal content.

### Phase 4 - Dashboard

Goal:

- Make the dashboard a real market discovery page while preserving the approved Lotus design.

Buttons and controls:

- Grid/List toggle: changes the market presentation only.
- Watchlist: local-only or disabled until backend persistence is confirmed.
- Events/Markets toggle: switches between event-first and market-first browsing.
- Category filters: call `GET /markets` and/or `GET /events` with supported query parameters.
- Trending/Best Routes/Sports/Crypto/Politics: filter the backend market/event list. Best Routes requires backend route evidence; otherwise it should say route preview is required.
- Time filter: applies only if backend supports it; otherwise it is visual-only and should not change data.

Market card click:

- Opens terminal with that market/event selected.

Yes/No buttons:

- Prefill terminal side/outcome and open the terminal.
- They do not submit a trade directly.

Data:

- `GET /markets`
- `GET /events`
- `GET /markets/:marketId/outcomes`
- `POST /execution/live-candidates` only when routeability evidence is needed.

Implementation status:

- Dashboard grid/list now calls `GET /markets` through the typed market API client and preserves the approved dashboard design.
- Search is server-backed through the documented `search` query parameter.
- Backend-provided `imageUrl`/`iconUrl` render with local fallback; the frontend does not call venue APIs directly.
- Authenticated dashboard grid/list calls `POST /execution/live-candidates` for visible Yes/No outcomes and displays backend-sourced unified average outcome prices, best Yes venue price, venue brand, spread, and available live quote liquidity when available.
- Market catalog responses expose optional aggregated `volume`, `volume24h`, `liquidity`, `buyVolume`, `sellVolume`, `tradeCount`, `buyCount`, and `sellCount` fields from approved venue payloads. Dashboard uses true unified volume/liquidity when present and falls back to live quote liquidity when catalog liquidity is absent.
- Buy/sell sentiment renders as green buy count, red sell count, and a proportional green/red bar only when backend buy/sell count or buy/sell volume fields are present. It must not be fabricated from UI state.
- In list view, `Closes By` and `24h` follow the best-price venue. Venue-provided `change24h`/`changePercent24h` renders green when positive and red when negative; missing 24h data remains pending.
- If live candidates fail or return blockers, the market remains visible with live unavailable/quote-required copy.
- Savings, order-flow counts, seven-day movement, and full order book depth are still not fabricated; they stay quote-required/unavailable until backend contracts provide them.
- Durable notifications now come from `GET /notifications`; notification read state uses `POST /notifications/:id/read`.
- Local data note from May 9, 2026: `frontend_market_approvals` migration has been applied locally and curated markets seeded. If a new database returns HTTP 500 for `GET /markets`, apply the existing `2026_05_03_create_frontend_market_approvals.sql` migration and seed curated market approvals.

### Phase 5 - Markets Page

Goal:

- Provide a dense Lotus-style market list for scanning many markets.

Controls:

- Grid/List toggle: list is default for market browsing.
- Events/Markets toggle: keeps canonical event grouping available.
- Watchlist: same rule as dashboard.
- Search: server-backed if supported, otherwise local filter over loaded records.

List row click:

- Opens the terminal for the clicked market.

Yes/No row buttons:

- Prefill trade side/outcome in terminal.

Venue logos:

- Use approved venue icons for Polymarket, Limitless, Opinion, Predict.fun, and Myriad.
- Kalshi must not appear.

Market media:

- Backend may return sanitized optional `imageUrl` and `iconUrl`.
- Frontend renders those URLs with `no-referrer` and falls back to category/venue icons on missing or failed media.
- Frontend must not call venue APIs for images.
- Local curated seed rows may still have null media until backend ingestion/approval payloads include venue media URLs. The frontend should not substitute external venue fetches to fill that gap.

Spread column:

- Show only if backend returns spread or live quote evidence.
- If not returned, hide or label as "quote required"; do not fake it.

### Phase 6 - Terminal Market Selector And Chart

Goal:

- Users can pick canonical markets under an event and trade from the terminal.

Event dropdown:

- Shows canonical event name and linked markets.
- Calls:
  - `GET /events/:eventId`
  - `GET /events/:eventId/markets`
  - `GET /markets/:marketId/outcomes`

User behavior:

- Click market from dashboard or markets page.
- Terminal opens directly to the selected market.
- Dropdown lets the user switch to another canonical market under the same event.

Chart:

- Use approved design.
- Do not fake historical data if backend does not expose it.
- If historical contract is missing, keep chart design but mark it data-pending in implementation notes.

Order book:

- Use backend quote/orderbook evidence only.
- If full depth is unavailable, show route evidence and unified live prices only.
- Current blocker: backend live candidate snapshots do not expose sanitized full depth levels through a frontend-safe route. Terminal order book UI must wait for that contract.

### Phase 7 - Terminal Outcomes, Positions, And Risk Tabs

Outcomes tab:

- Data: `GET /markets/:marketId/outcomes`
- Current wiring: terminal loads the selected canonical market's backend outcomes, then polls authenticated `POST /execution/live-candidates` about every 30 seconds for each visible outcome.
- Displayed Yes price is the best backend candidate price with venue branding; displayed probability is the unified average across backend candidate venues.
- Outcome rows show a matched venue pair first: `Yes` and `No` for the same best venue. The row dropdown exposes other venues as their own matched Yes/No pairs so the UI reads as venue comparison, not mixed-venue arbitrage.
- Show all outcomes button expands the loaded outcome list.
- Outcome Yes/No buttons prefill the trade panel side/outcome.
- If live quotes fail, keep the outcome visible and show `Quote` plus the backend error/blocker text.

Positions tab:

- Data: `GET /execution/positions`
- WebSocket: `execution:positions:<userId>:<marketHash>:<outcomeHash>`
- Current wiring: terminal polls `GET /execution/positions` about every 15 seconds only while the Positions tab is open, then filters to the selected market client-side because the backend positions endpoint requires market/outcome together when filtering.
- Show unified position and per-venue position where backend returns verified fill evidence.
- Do not show unverified submitted orders as positions.

Open Orders tab:

- Show current active execution if selected.
- Data: `GET /execution/open-orders`
- Current wiring: terminal polls open orders about every 15 seconds only while the Open Orders tab is open, then filters backend-returned executions to the selected market route.
- Show only backend-returned non-dry-run executions in `SUBMITTED` or `PARTIAL` status.
- Do not show limit orders here until the separate limit-order contract is implemented.

Trade History tab:

- Show backend-confirmed execution history only.
- Data: `GET /execution/history`
- Current wiring: terminal polls execution history about every 15 seconds only while the Trade History tab is open, then filters backend-returned executions to the selected market route.
- Receipts: `GET /execution/:executionId/receipt`

Rules and Risk tab:

- Data:
  - `GET /resolution-risk/canonical/:eventId`
  - `GET /resolution-risk/market/:venue/:marketId`
- Current wiring: terminal loads canonical assessment and venue market profiles for the selected market immediately on selection. Pair-level comparison remains available in backend contracts but is not called by the terminal UI in this slice.
- Dashboard market cards must pass `canonicalEventId`, `venues`, and `venueMarkets` into the terminal payload; otherwise the terminal can render the market but cannot load rules/risk profiles.
- Platform Rules presents backend-verified venue rule text, supplemental resolution source text, oracle/source type, authority type, outcome schema, and boundary flags. Aggregation Justification presents the semantic comparison factors and backend pooling decision rather than treating a market title as an execution source.
- The backend filters untrusted synthetic labels out of risk profiles. If fewer than two venue profiles have trusted rule text, semantic pooling assessment is withheld rather than fabricated.
- Risk and compatibility belongs inside this tab, not beside the order book.

### Phase 8 - Terminal Trade Panel

Goal:

- Let the user preview, sign, and submit only backend-approved routes.

Buy/Sell tabs:

- Set intended side.
- No backend call by themselves.

Market/Limit selector:

- Market is enabled for private beta.
- Limit remains disabled unless the backend limit order contract is confirmed.

Yes/No buttons:

- Set selected outcome.
- Trigger quote refresh only when enough market/outcome/amount data exists.

Amount fields:

- User may enter notional or shares depending on approved UI.
- Conversions use latest backend quote evidence.
- 25/50/MAX use backend venue-ready balances, not raw wallet balances.

Preview Route button:

- Calls `POST /execution/live-candidates`.
- Then calls `POST /execution/quote` when candidates exist.
- Shows blockers if no route is executable.

Place Order button:

1. Calls `POST /execution/submit` with quote ID.
2. If signatures are required, calls `POST /execution/:executionId/prepare-signatures`.
3. User signs typed data through Turnkey.
4. Calls `GET /execution/:executionId/live-readiness`.
5. Calls `POST /execution/:executionId/submit-signed-bundle`.
6. Subscribes to `execution:quote:<executionId>`.
7. Falls back to `GET /execution/:executionId/status`.

Activate funds button:

- Calls `GET /funding/venue-activations`.
- For Polymarket:
  - `POST /funding/venue-activations/polymarket/prepare`
  - user signs required transaction/message
  - `POST /funding/venue-activations/polymarket/submit`
- For other venues:
  - show backend-provided setup/readiness action only.

Ghost Fill / Fast Lane:

- Disabled unless backend exposes production contracts.

### Phase 9 - Right-Side Open Position Panel

Goal:

- Use the empty right-side space below the trade panel for live position feedback.

Design behavior:

- If no verified position: show "No verified position yet" with route status.
- If submitted but not filled: show submitted order and settlement pending status.
- If filled: show unified position, average entry, current mark if available, and venue breakdown.
- If routed across venues: show per-venue filled size, average price, and PnL where backend provides it.

Data:

- `GET /execution/positions`
- `GET /execution/:executionId/status`
- WebSocket execution updates.

Contract gap:

- PnL by venue requires backend mark price or PnL fields. If not present, show size and average entry only.

### Phase 10 - Portfolio

Goal:

- Show real venue-ready cash, verified positions, and execution state without pretending unsupported analytics exist.

Portfolio card:

- Replace chain cash fields with venue cash balances:
  - Polymarket
  - Limitless
  - Predict.fun
  - Opinion
  - Myriad
- Data: `GET /funding/venue-balances`

Deposit button:

- Opens deposit modal.

Withdraw button:

- Opens withdraw modal.

Bridge button:

- Removed.

Activate buttons:

- Show next to venues that backend says need activation.
- Use funding activation endpoints where available.

Portfolio chart:

- Data: `GET /execution/portfolio/timeseries`
- The current backend contract returns current MTM snapshot points with `historyAvailable: false`.
- Render this as current portfolio MTM state only. Do not interpolate or invent historical PnL.

Positions table:

- Data: `GET /execution/positions`
- Show verified positions only.
- WebSocket updates should refresh positions automatically.

### Phase 11 - Deposit Modal

Goal:

- Let users fund venue-ready capital through backend-controlled funding intents.

Token dropdown:

- Uses backend-supported funding tokens from capabilities.
- Display logos for USDC and USDT where supported.

Chain dropdown:

- Uses backend-supported source chains from capabilities.
- Display logos for Solana, Polygon, BSC, Base, and other supported chains only if backend says they are available.

Venue allocation:

- Venues:
  - Polymarket
  - Limitless
  - Predict.fun
  - Opinion
  - Myriad
- Kalshi must not appear.

Flow:

1. `POST /funding/intents`
2. `POST /funding/intents/:id/quote`
3. User signs/broadcasts required transaction through wallet flow.
4. `POST /funding/intents/:id/submit`
5. Poll `GET /funding/intents/:id/status`
6. Refresh `GET /funding/venue-balances`

User-facing truth:

- "Ready to trade" appears only after backend readiness says so.

### Phase 12 - Withdraw Modal

Goal:

- Let users withdraw through backend-supported withdrawal routes.

Recipient:

- Default to saved withdrawal wallet when present.
- Let user specify a wallet if backend supports it.

Token and chain dropdowns:

- Use backend capabilities, not hardcoded assumptions.
- User can withdraw to Solana wallet or specified wallet only where backend supports the route.

Venue source:

- Use venue balances from backend.
- Show unsupported venues as disabled with a reason.

Flow:

1. `POST /funding/withdrawals`
2. `POST /funding/withdrawals/:id/quote`
3. User signs/broadcasts required transaction if needed.
4. `POST /funding/withdrawals/:id/submit`
5. Poll `GET /funding/withdrawals/:id/status`

### Phase 13 - Notifications

Goal:

- Notify users about fills, limit/order state, funding activation, and readiness changes.

Inputs:

- WebSocket execution events.
- Funding status polling and venue activation state.

Notifications:

- Fill confirmed.
- Settlement pending.
- Settlement verified.
- Order failed closed.
- Funding received.
- Venue ready to trade.
- Activation required.
- Activation completed.

Contract gap:

- Persistent notification inbox endpoint is confirmed.
- Safe beta path: use backend notification read state; local-only dismiss state is no longer required for durable notification persistence.

### Phase 14 - Leaderboard And Alerts Pages

Goal:

- Preserve designs but do not wire as production data surfaces until backend contracts exist.

Leaderboard:

- Keep design-ready.
- Needs backend contract before production data.

Alerts page:

- Use in-session event source first.
- Persistent alerts need backend support.

## 5. Latency And Reliability Model

Active terminal:

- WebSocket subscribes to selected execution and user topics.
- HTTP fallback polls active execution status every 3 to 5 seconds.
- Live readiness refreshes while the live submit panel is active.

Funding and portfolio:

- Venue balances refresh on entry and after funding/withdrawal actions.
- Active funding/withdrawal intents poll until terminal state.

Execution:

- Frontend never enables live submit from stale client state.
- Backend live-readiness and submit preflight remain authoritative.

Failure handling:

- Show backend blockers exactly enough for user action.
- Hide raw provider payloads.
- Preserve safe retry rules from backend.

## 6. Security And Redaction

Do not store or display:

- Admin JWTs.
- Venue API keys.
- Turnkey provider IDs.
- Private keys.
- Seed phrases.
- Raw signatures unless needed for the immediate signing flow.
- Raw provider payloads.

Allowed display:

- Short public wallet address.
- Safe venue status.
- Public market IDs only when needed for support/debug copy.
- User-safe backend error message.

## 7. Staging And Production Flow

For every approved implementation slice:

1. Work on the frontend `staging` branch.
2. Run local checks.
3. Push to `staging`.
4. Test Vercel staging and backend staging together.
5. Move to `main` only when the user explicitly says to send to production.

Do not push runtime changes to `main` by default.

## 8. Proposed First Implementation Order

1. Contract reconciliation and typed API clients.
2. Auth/session hardening with Turnkey to Lotus JWT.
3. Market navigation from dashboard/markets to terminal.
4. Terminal live candidate and quote preview.
5. Terminal signature and signed submit.
6. Realtime status, positions, and right-side open position panel.
7. Portfolio venue balances and activation actions.
8. Deposit and withdrawal flows.
9. Notifications.
10. Production hardening, tests, and UX review.

## 9. Questions To Resolve Before Coding

1. Should `app.uselotus.xyz` remain staging for now, or should we create a separate staging domain before the next deploy?
2. Should email login be hidden until a confirmed Turnkey email flow is ready, or should it stay visible but disabled?
3. Should Watchlist be local-only for private beta, or should we block it until backend persistence exists?
4. Portfolio PnL is backend mark-to-market from current quotes for verified positions; historical charting remains current-snapshot only until persisted history exists.
5. Should Opinion and Myriad stay visible as "setup needed" / "not configured", or be hidden until their live user flow is ready?
6. Should Limit order controls stay visible but disabled, or be hidden until the backend limit-order contract exists?
7. Are in-session notifications enough for private beta, or do we need a persistent notifications backend before launch?

## 10. Acceptance Criteria For This Map

- Every page has a clear backend dependency.
- Every user button has a stated behavior.
- Every missing contract is marked as a blocker or safe fallback.
- No frontend direct venue calls are planned.
- No admin/internal route is planned for public UI.
- No fake PnL, fake orderbook, fake savings, or fake readiness is allowed.
- The approved Lotus design remains the visual source of truth.
