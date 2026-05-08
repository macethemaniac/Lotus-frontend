# Lotus Frontend Architecture Map

This repo is now organized as a Vite React private-beta frontend. The approved design files remain preserved under `src/design`, while production-facing code lives in `src/app`, `src/features`, `src/components`, and `src/lib`.

## Current Structure

```text
Lotus-frontend/
  docs/
    contracts/
      FRONTEND_BACKEND_CONTRACT.md
  src/
    app/
      App.tsx
      routes.ts
    components/
      icons/
        lotus-icons.tsx
      layout/
        app-shell.tsx
      ui/
        button.tsx
        panel.tsx
        status-badge.tsx
    config/
      env.ts
    design/
      brand/
      mockups/
    features/
      auth/
      design/
      funding/
      markets/
      portfolio/
      trading/
      wallets/
      withdrawals/
    lib/
      api/
      formatting/
      ws/
    styles/
      globals.css
    main.tsx
  index.html
  package.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
```

## Production-Facing Areas

| Area | Current role |
|---|---|
| `src/app` | App root, page registry, top-level layout wiring |
| `src/components` | Shared shell, icon, and primitive UI components |
| `src/config` | Frontend-safe runtime configuration |
| `src/features/auth` | User JWT/session boundary |
| `src/features/wallets` | User wallet and venue account setup |
| `src/features/funding` | Venue-ready balances, activations, funding history |
| `src/features/trading` | Private-beta live candidates, quote, signature, submit, status, positions |
| `src/features/markets` | Market discovery shell |
| `src/features/portfolio` | Position/portfolio shell |
| `src/features/withdrawals` | Safe disabled withdrawal shell until full contract wiring |
| `src/lib/api` | Backend HTTP client with bearer JWT support |
| `src/lib/ws` | Execution WebSocket client |

## Design Reference Areas

| Area | Current role |
|---|---|
| `src/design/mockups` | Preserved approved page, modal, receipt, footer, alert, and leaderboard references |
| `src/design/brand` | Preserved brand palette, typography, iconography, logo, and token references |
| `src/features/design` | Non-production design reference index |

Footer, alerts/notifications, and leaderboard stay as design references in this pass because there is no confirmed public backend contract for them yet.

## Backend Contract Boundary

The implemented beta flow uses only backend-owned APIs and never calls venues directly from the frontend. The contract map is tracked in:

- `docs/contracts/FRONTEND_BACKEND_CONTRACT.md`

The signed-bundle `/execution/*` routes are marked as a backend OpenAPI documentation gap. They are wired only because backend route source confirms them and they are required for the private-beta execution flow.

## Active Private-Beta Flow

1. Set a user JWT locally in the browser session.
2. Ensure default wallets and venue accounts.
3. Read funding balances, activations, and history.
4. Load live venue candidates from backend evidence.
5. Request an executable quote.
6. Submit the quote gate.
7. Prepare user signature requests.
8. Submit signed bundle, dry-run or live depending on backend readiness.
9. Track status and positions by WebSocket, with HTTP polling fallback.

## Safety Rules

- No admin JWTs in public UI.
- No backend env templates in the frontend repo.
- No venue API calls from frontend code.
- No frontend override of backend blockers.
- No custody language.
- No savings, fee, filled, or settled claims unless returned by the backend.
