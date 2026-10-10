# VinoFlow

Self-hosted wine cellar & bar app. Deployed with Docker Compose (db + backend + frontend/nginx).

## Layout

- `App.tsx`, `pages/`, `components/`, `hooks/`, `services/`, `utils/`, `types.ts` — React 19 + Vite + Tailwind frontend (at repo root, no `src/`).
  - `pages/Cockpit*.tsx` + `components/cockpit/` — the current UI ("Cockpit" redesign, May 2026). The old "classic" pages were removed.
  - `services/storageService.ts` — all API calls (`/api/...`, relative; nginx proxies to backend). JWT in `localStorage.auth_token`, 401 → logout.
- `backend/src/server.js` — bootstrap (migrations, listen). `app.js` — Express app (middlewares + routers, exported for supertest). `routes/*.js` — one router per domain (auth, wines, bottles, racks, spirits, tastings, history, wishlist, cocktails, import, sommelier, cellar, ai), all mounted on `/api`. `config.js`, `db.js` (pool, `withTransaction`), `middleware/`, `utils/case.js`. `backend/src/sommelier/` — AI sommelier pipeline (criteria extraction, scoring, argumentation, peak windows, embeddings). `backend/src/services/aiService.js` — task-based routing (extract-criteria, argue, critique, enrich-aromas, enrich-peak, ocr, embedding) between Claude and Gemini with per-task model/max_tokens/effort (env overridable), provider fallback, native structured outputs (`sommelier/schemas.js`: every object `additionalProperties: false`, all fields required, optional = nullable), system-prompt caching, and per-call logging to `ai_calls`. Load the claude-api skill before touching Anthropic calls; read Claude responses by block type.
- `backend/src/enrichment/` — sourced enrichment cascade (EXACT → AUTRE_MILLESIME → PRODUCTEUR → APPELLATION → REGLES). Engines: Claude Code (`claude -p` with WebSearch/WebFetch + `--json-schema`, on the user's subscription via `CLAUDE_CODE_OAUTH_TOKEN`, bundled in the backend image) or the Messages API web_search tool as fallback. `verify.js` re-fetches every cited page and checks the quote; `service.js` applies results (USER/TASTING protected, EXACT-only auto-corrections, reversible `enrichment_log`); `scheduler.js` = in-process queue + monthly/quarterly/yearly re-checks.
- `backend/src/quickAdd/` + `utils/quickAdd*.ts` — ajout rapide : photo d'étiquette sur « Ajouter » et écran Rafale (`/add-wine/rafale`). Brouillon sur le téléphone (IndexedDB, repli mémoire), lecture des photos une à une via `extract-from-image` (machine à états pure `utils/quickAddQueue.ts` : réessais réseau/5xx/429). `POST /api/quick-add` enregistre toute la rafale en une transaction (cave / envie / dégustation, rapprochement nom + producteur + millésime, idempotent par `batchId` via `quick_add_batches`).
- `backend/src/csvImport/` — import CSV « aller-retour » avec l'export (`utils/exportCsv.ts`, même en-têtes) : `parse.js` (BOM, `;`/`,`, guillemets), `rows.js` (cellule vide = ne pas toucher, `-` = effacer, erreurs par ligne), `plan.js` (comparaison avec la cave, prix seulement sur les bouteilles sans prix, `planHash`), `apply.js` (une transaction). Route `POST /api/import/csv` (`dryRun` puis application ; 409 si la cave a changé depuis l'aperçu).
- `backend/src/notifications/` — alertes « à boire avant » et newsletter, réglées par compte (`notification_settings`) : `classify.js` (états GARDE/PRET/SE_REFERME/DEPASSEE, transitions), `schedule.js` (échéances en `NOTIFY_TZ`), `channels.js` (Gotify, email Sweego), `render.js` (gabarit email Cockpit, réf. `docs/superpowers/specs/newsletter-exemple.html`), `newsletter.js` + `sommelierNote.js` (tâche IA `newsletter`, facultative), `scheduler.js` (tick `NOTIFY_TICK_MINUTES`, verrou consultatif, état écrit seulement après un envoi réussi). Routes `/api/notifications/*`.
- `backend/src/menuflow/` — passerelle vers MenuFlow (planning des dîners, autre dépôt) : VinoFlow lit les dîners et pousse le vin conseillé / ouvert par date (`dinner_pairings`, `journal.for_dinner`), dans le tick des notifications ; rubriques MenuFlow de la newsletter ; routes `/api/menuflow/*`. Inactive sans `MENUFLOW_URL` + `MENUFLOW_TOKEN`. `sommelier/pairForDish.js` = accord partagé (route `/sommelier/pair`, passerelle).
- `backend/src/valuation/` — valeur de la cave : cote par vin (recherche web sourcée tous les 3 mois avec les moteurs de l'enrichissement — `runEngine` accepte `schema`/`systemPrompt`/`task` —, citations contenant le prix vérifiées, saisie manuelle `USER` prioritaire), historisée dans `wine_valuations` ; investi / valeur / plus-value recalculés à partir des bouteilles (`compute.js`) ; file `scheduler.js` (`VALUATION_DAILY_LIMIT`). Routes `/api/cellar/value`, `/api/cellar/missing-prices`, `/api/wines/:id/valuations`.
- `backend/src/shares/` — partage public (`/p/<jeton>`) d'une fiche vin ou d'une carte des vins de dîner composée à la main : `token.js` (256 bits base64url), `validate.js`, `publicView.js` (`toPublicShare`, **liste blanche** : identité, description, arômes, accords, dégustations `{ date, rating, comment }` ; jamais prix, cote, bouteilles, emplacements, stock, apogée, identifiants, occasion, convives), `store.js`. Routes authentifiées `/api/shares*` (`routes/shares.js`) ; **seule route publique** `GET /api/public/shares/:token` (`routes/publicShares.js`, montée avant `authenticate`, `publicLimiter` 120/15 min/IP, 404 indistinct inconnu/révoqué, `X-Robots-Tag: noindex`). Front : `pages/PublicShare.tsx` (hors `ProtectedRoute`, fetch nu sans `apiFetch`), `pages/ShareDinner.tsx` (`/partages/diner[/:id]`), `components/cockpit/SharedLinksSection.tsx` (Réglages), `utils/shareView.ts`.
- `db/init.sql` + `db/migrations/*.sql` — Postgres 16 + pgvector schema, applied by the backend at startup (`backend/src/migrations.js`): `init.sql` on an empty DB, then missing `NNN_*.sql` files in order, one transaction each, tracked in `schema_migrations`. New migration = new numbered file, idempotent, **without** `BEGIN`/`COMMIT` (the runner wraps it); add `-- vinoflow:optional` if failure must not block startup. Pre-runner DBs: 001-004 are detected from the schema (`LEGACY_PROBES`). The backend image is built from the repo root (`backend/Dockerfile` + `backend/Dockerfile.dockerignore`) to embed `db/`.
- `mcp-server/` — TypeScript MCP server (stdio) wrapping the REST API (`VINOFLOW_API_URL` + `VINOFLOW_EMAIL`/`VINOFLOW_PASSWORD`, or legacy `VINOFLOW_AUTH_TOKEN`). 26 historical tools in `src/index.ts`; tools by domain in `src/tools/` (bar, tastings/wishlist, cellar writes, enrichment/AI, valuation, MenuFlow tonight/newsletter preview), registered by `registerAll`. No delete/restore tool on purpose. Writes mirror the app (journal entries IN/OUT/MOVE/GIFT). A missing backend route yields a readable « pas disponible sur ce serveur » error. Tests: `cd mcp-server && npm test` (Vitest, `fetch` mocked).
- `design-protos/` — Claude Design HTML/JSX prototypes the Cockpit pages were ported from. Reference only, not built.

## Security model

- **Household cellar, not multi-tenant**: all accounts share the same data on purpose — don't add per-user filtering to cellar tables. Access control = who gets an account (`ALLOW_SIGNUP`, default false; first signup always allowed).
- Auth: 15-min access JWT (`typ: 'access'`) + opaque refresh token hashed in `refresh_tokens` (rotation, family revocation on reuse). Front: `apiFetch` in `storageService.ts` refreshes once on 401 before logging out.
- Rate limits (`express-rate-limit`) on `/api/auth/*` and costly AI routes; `trust proxy` = `TRUST_PROXY` (default 1, nginx).
- Partage public : `/api/public/*` est la seule zone sans JWT (lecture seule, liste blanche `toPublicShare`, limiteur par IP). Toute nouvelle route publique doit passer par ce routeur et être justifiée.
- `backend/src/services/mailService.js` — Sweego client (`sendMail`, `renderMailHtml`); without `SWEEGO_API_KEY` it logs instead of sending.
- `backup` compose service runs `scripts/backup.sh` (daily pg_dump → `./backups`).

## Commands

```bash
npm run typecheck   # tsc --noEmit (frontend only; backend/mcp-server are excluded)
npm test            # vitest — utils/*.test.ts
npm run build       # vite build
cd backend && npm test   # vitest — tests/unit (pure) + tests/api (supertest, only if TEST_DATABASE_URL is set; that DB is WIPED)
docker compose up -d --build
cd mcp-server && npm test && npm run build
```

CI (`.github/workflows/ci.yml`): backend `node --check` + Vitest (unit + API tests on a pgvector Postgres service), frontend typecheck + Vitest + build, MCP server Vitest + build, Docker image builds.

## Conventions

- Commit messages and UI copy are in French.
- Dark mode was removed on purpose (commit 6bf7051) — don't add `dark:` classes.
- The Vite dev server has no `/api` proxy; run the backend via Docker to test end to end.
