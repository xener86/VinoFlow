# VinoFlow

Self-hosted wine cellar & bar app. Deployed with Docker Compose (db + backend + frontend/nginx).

## Layout

- `App.tsx`, `pages/`, `components/`, `hooks/`, `services/`, `utils/`, `types.ts` — React 19 + Vite + Tailwind frontend (at repo root, no `src/`).
  - `pages/Cockpit*.tsx` + `components/cockpit/` — the current UI ("Cockpit" redesign, May 2026). The old "classic" pages were removed.
  - `services/storageService.ts` — all API calls (`/api/...`, relative; nginx proxies to backend). JWT in `localStorage.auth_token`, 401 → logout.
- `backend/src/server.js` — Express API (single file, ~60 routes). `backend/src/sommelier/` — AI sommelier pipeline (criteria extraction, scoring, argumentation, peak windows, embeddings). `backend/src/services/aiService.js` — Gemini/Claude provider abstraction with auto-fallback.
- `db/init.sql` + `db/migrations/*.sql` — Postgres 16 + pgvector schema. `init.sql`, `002`, `003` and `004` are mounted as init scripts (fresh volume only); `001` is already folded into `init.sql`. On an existing DB, apply new migrations manually (`docker compose exec -T db psql -U vinoflow vinoflow < db/migrations/00X_*.sql`). New migrations must be idempotent and added to the `db` volumes in `docker-compose.yml`.
- `mcp-server/` — TypeScript MCP server wrapping the REST API (`VINOFLOW_API_URL`, `VINOFLOW_AUTH_TOKEN`).
- `design-protos/` — Claude Design HTML/JSX prototypes the Cockpit pages were ported from. Reference only, not built.

## Security model

- **Household cellar, not multi-tenant**: all accounts share the same data on purpose — don't add per-user filtering to cellar tables. Access control = who gets an account (`ALLOW_SIGNUP`, default false; first signup always allowed).
- Auth: 15-min access JWT (`typ: 'access'`) + opaque refresh token hashed in `refresh_tokens` (rotation, family revocation on reuse). Front: `apiFetch` in `storageService.ts` refreshes once on 401 before logging out.
- Rate limits (`express-rate-limit`) on `/api/auth/*` and costly AI routes; `trust proxy` = `TRUST_PROXY` (default 1, nginx).
- `backend/src/services/mailService.js` — Sweego client (`sendMail`, `renderMailHtml`); without `SWEEGO_API_KEY` it logs instead of sending.
- `backup` compose service runs `scripts/backup.sh` (daily pg_dump → `./backups`).

## Commands

```bash
npm run typecheck   # tsc --noEmit (frontend only; backend/mcp-server are excluded)
npm run build       # vite build
docker compose up -d --build
cd mcp-server && npm run build
```

CI (`.github/workflows/ci.yml`): backend `node --check`, frontend typecheck + build, Docker image builds. No automated tests yet.

## Conventions

- Commit messages and UI copy are in French.
- Dark mode was removed on purpose (commit 6bf7051) — don't add `dark:` classes.
- The Vite dev server has no `/api` proxy; run the backend via Docker to test end to end.
