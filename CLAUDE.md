# VinoFlow

Self-hosted wine cellar & bar app. Deployed with Docker Compose (db + backend + frontend/nginx).

## Layout

- `App.tsx`, `pages/`, `components/`, `hooks/`, `services/`, `utils/`, `types.ts` — React 19 + Vite + Tailwind frontend (at repo root, no `src/`).
  - `pages/Cockpit*.tsx` + `components/cockpit/` — the current UI ("Cockpit" redesign, May 2026). The old "classic" pages were removed.
  - `services/storageService.ts` — all API calls (`/api/...`, relative; nginx proxies to backend). JWT in `localStorage.auth_token`, 401 → logout.
- `backend/src/server.js` — bootstrap (migrations, listen). `app.js` — Express app (middlewares + routers, exported for supertest). `routes/*.js` — one router per domain (auth, wines, bottles, racks, spirits, tastings, history, wishlist, sommelier, cellar, ai), all mounted on `/api`. `config.js`, `db.js` (pool, `withTransaction`), `middleware/`, `utils/case.js`. `backend/src/sommelier/` — AI sommelier pipeline (criteria extraction, scoring, argumentation, peak windows, embeddings). `backend/src/services/aiService.js` — task-based routing (extract-criteria, argue, critique, enrich-aromas, enrich-peak, ocr, embedding) between Claude and Gemini with per-task model/max_tokens/effort (env overridable), provider fallback, native structured outputs (`sommelier/schemas.js`: every object `additionalProperties: false`, all fields required, optional = nullable), system-prompt caching, and per-call logging to `ai_calls`. Load the claude-api skill before touching Anthropic calls; read Claude responses by block type.
- `db/init.sql` + `db/migrations/*.sql` — Postgres 16 + pgvector schema, applied by the backend at startup (`backend/src/migrations.js`): `init.sql` on an empty DB, then missing `NNN_*.sql` files in order, one transaction each, tracked in `schema_migrations`. New migration = new numbered file, idempotent, **without** `BEGIN`/`COMMIT` (the runner wraps it); add `-- vinoflow:optional` if failure must not block startup. Pre-runner DBs: 001-004 are detected from the schema (`LEGACY_PROBES`). The backend image is built from the repo root (`backend/Dockerfile` + `backend/Dockerfile.dockerignore`) to embed `db/`.
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
npm test            # vitest — utils/*.test.ts
npm run build       # vite build
cd backend && npm test   # vitest — tests/unit (pure) + tests/api (supertest, only if TEST_DATABASE_URL is set; that DB is WIPED)
docker compose up -d --build
cd mcp-server && npm run build
```

CI (`.github/workflows/ci.yml`): backend `node --check` + Vitest (unit + API tests on a pgvector Postgres service), frontend typecheck + Vitest + build, Docker image builds.

## Conventions

- Commit messages and UI copy are in French.
- Dark mode was removed on purpose (commit 6bf7051) — don't add `dark:` classes.
- The Vite dev server has no `/api` proxy; run the backend via Docker to test end to end.
