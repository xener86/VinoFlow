# VinoFlow

Self-hosted wine cellar & bar app. Deployed with Docker Compose (db + backend + frontend/nginx).

## Layout

- `App.tsx`, `pages/`, `components/`, `hooks/`, `services/`, `utils/`, `types.ts` — React 19 + Vite + Tailwind frontend (at repo root, no `src/`).
  - `pages/Cockpit*.tsx` + `components/cockpit/` — the current UI ("Cockpit" redesign, May 2026). The old "classic" pages were removed.
  - `services/storageService.ts` — all API calls (`/api/...`, relative; nginx proxies to backend). JWT in `localStorage.auth_token`, 401 → logout.
- `backend/src/server.js` — Express API (single file, ~60 routes). `backend/src/sommelier/` — AI sommelier pipeline (criteria extraction, scoring, argumentation, peak windows, embeddings). `backend/src/services/aiService.js` — Gemini/Claude provider abstraction with auto-fallback.
- `db/init.sql` + `db/migrations/*.sql` — Postgres 16 + pgvector schema. `init.sql`, `002` and `003` are mounted as init scripts (fresh volume only); `001` is already folded into `init.sql`. On an existing DB, apply new migrations manually (`docker compose exec -T db psql -U vinoflow vinoflow < db/migrations/00X_*.sql`). New migrations must be idempotent and added to the `db` volumes in `docker-compose.yml`.
- `mcp-server/` — TypeScript MCP server wrapping the REST API (`VINOFLOW_API_URL`, `VINOFLOW_AUTH_TOKEN`).
- `design-protos/` — Claude Design HTML/JSX prototypes the Cockpit pages were ported from. Reference only, not built.

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
