# Valeur de la cave dans le temps — design

Date : 2026-10-05 · Chantier « Évolutions » (5/5), piste 2 · Branche `claude/valeur-cave` (depuis `main`)

## 1. Objectif

Suivre **ce qui a été investi** (prix d'achat) et **ce que vaut la cave** (cote), et leur évolution : courbe dans le temps, plus-value latente par vin et pour la cave, cote sourcée sur chaque fiche.

### Constat de départ (prod, 2026-10-05)

175 vins, 329 bouteilles en stock ; 347 bouteilles achetées sur 5 ans mais seulement 126,80 € de prix saisis (0,37 € par bouteille en moyenne) : les prix d'achat sont quasi absents. D'où un écran de **rattrapage des prix** et l'usage de la cote comme **achat estimé** à défaut.

### Critères de succès

- L'onglet Insights « Valeur » montre investi et valeur sur 24 mois, la plus-value latente et la couverture.
- Le rattrapage des prix d'achat de toute la cave se fait en quelques minutes.
- Chaque cote automatique affiche au moins une source dont la citation a été retrouvée par le serveur ; une cote saisie à la main n'est jamais écrasée.
- Sans moteur IA configuré, rattrapage et saisie manuelle fonctionnent ; la cote automatique est simplement inactive.

### Hors périmètre

Objectif de budget mensuel, rubrique valeur dans la newsletter (pourra suivre une fois la PR #14 fusionnée), cote par API commerciale (Wine-Searcher, iDealwine), devises autres que l'euro, instantanés quotidiens.

## 2. Décisions de cadrage

| Sujet | Décision |
|---|---|
| Ce qu'on suit | Investi (prix d'achat) **et** cote (valeur actuelle), plus-value latente |
| Prix manquants | Rattrapage en lot ; à défaut, la cote sert d'« achat estimé », marqué et exclu des dépenses réelles |
| Source de la cote | Recherche web sourcée (moteurs de l'enrichissement), tous les 3 mois ; saisie manuelle prioritaire |
| Affichage | Onglet Insights « Valeur », bloc « Cote » sur la fiche vin, tuile « Valeur » au tableau de bord |
| Architecture | Passe « cote » dédiée (`backend/src/valuation/`), découplée de la cascade d'enrichissement mais réutilisant ses moteurs et sa vérification |

## 3. Données — migration `db/migrations/011_valuation.sql`

Numéro 011 en supposant la PR #14 (009, 010) fusionnée d'abord ; sinon renuméroter à la fusion. Idempotente, sans `BEGIN`/`COMMIT`.

```sql
CREATE TABLE IF NOT EXISTS wine_valuations (
  id bigserial PRIMARY KEY,
  wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  valued_at timestamptz NOT NULL DEFAULT now(),
  price_eur numeric(10,2) NOT NULL CHECK (price_eur > 0),
  low_eur numeric(10,2),
  high_eur numeric(10,2),
  basis text NOT NULL CHECK (basis IN ('EXACT', 'AUTRE_MILLESIME', 'USER')),
  basis_vintage integer,
  sources jsonb NOT NULL DEFAULT '[]',
  engine text,
  note text
);
CREATE INDEX IF NOT EXISTS wine_valuations_wine_idx ON wine_valuations (wine_id, valued_at DESC);

ALTER TABLE wines ADD COLUMN IF NOT EXISTS valuation_next_check_at timestamptz;
ALTER TABLE wines ADD COLUMN IF NOT EXISTS valuation_status text;
-- OK (cote enregistrée) | NONE (aucun prix vérifié) | ERROR (échec du moteur)
```

- `price_eur` : prix **par bouteille du format du vin** — `wines.format` est un texte (`'750ml'` par défaut, ex. `'1.5L'`, `'375ml'`), converti en millilitres (inconnu → 750 ml) ; médiane des prix vérifiés.
- `sources` : `[{ url, title, quote, price_eur, format_ml, status }]` (`status` de `verifySources` : verified / not_found / unreachable) ; seules les URL `http(s)` sont conservées.

## 4. Règles de la cote

- **Saisie manuelle (`USER`) prioritaire** : jamais remplacée par la recherche ; une nouvelle saisie ajoute un point. Pas de recherche automatique pour un vin dont la dernière cote `USER` a moins de 3 mois.
- **Recherche automatique** : niveaux acceptés `EXACT` (même millésime) et `AUTRE_MILLESIME` (même cuvée, autre millésime, marqué comme approximation). Jamais de prix d'appellation ou de producteur. Un point n'est enregistré que si **au moins un prix provient d'une source vérifiée** (citation contenant le prix retrouvée dans la page) ; sinon `valuation_status = NONE` et aucun point. Risque assumé : faible couverture au début (pages de prix générées en JavaScript ou bloquant les robots).
- **Calcul** : prix ramenés au format du vin au prorata du volume ; valeurs > 3 × la médiane initiale écartées ; médiane = cote, min/max = fourchette.
- **Fréquence** : trimestrielle (`valuation_next_check_at = now() + 3 mois` ; `NONE` et `ERROR` : nouvel essai dans 1 mois) ; seuls les vins avec stock ; au plus `VALUATION_DAILY_LIMIT` (15) vins par jour ; « Rafraîchir » sur la fiche vin passe en tête de file (hors plafond).

## 5. Valeurs calculées (sans instantanés)

Pour une date D (fin de mois pour les séries) :

- **En cave à D** : bouteille dont la date d'entrée (`purchase_date`, à défaut `created_at`) ≤ D et non sortie à D (`is_consumed = false` ou `consumed_date > D` ; un cadeau est une sortie, enregistré comme consommé avec sa date).
- **Investi à D** : somme des `purchase_price` des bouteilles en cave à D.
- **Achat estimé** : bouteille sans prix → cote du vin la plus proche de sa date d'entrée (antérieure de préférence) ; comptée à part (`estimatedPurchase`), jamais dans les dépenses réelles de l'onglet Achats.
- **Valeur à D** : somme, sur les bouteilles en cave à D, de la dernière cote du vin connue à D ; bouteilles d'un vin sans cote : exclues et comptées dans la couverture.
- **Couverture** (aujourd'hui) : % de bouteilles en stock avec prix réel ; % avec cote.
- **Plus-value latente** : valeur − (investi + achat estimé) ; par vin : (cote − prix d'achat moyen) × bouteilles en stock, seulement si le prix réel est connu.

## 6. Moteur — `backend/src/valuation/`

| Fichier | Rôle |
|---|---|
| `schema.js` | `VALUATION_SCHEMA` : `{ status: FOUND\|NOT_FOUND, basis: EXACT\|AUTRE_MILLESIME, basis_vintage, prices: [{ price_eur, format_ml, seller, url, quote }], note }` (objets `additionalProperties: false`, optionnel = nullable) |
| `prompt.js` | Prompt système (prix actuels chez cavistes, enchères, sites de référence ; citation mot pour mot de l'extrait contenant le prix ; jamais de prix d'appellation) et prompt utilisateur (nom, cuvée, producteur, millésime, appellation, format) |
| `compute.js` | Pur : conversion du format, normalisation, écart des aberrants, médiane/fourchette, `shouldValue`, séries investi/valeur/couverture, achat estimé, plus-value par vin |
| `service.js` | `valueWine(wineId, { engine, fetchPage, now })` : moteur → `verifySources` → prix vérifiés → `compute` → point ou `NONE` → prochaine vérification ; `saveManualValuation` |
| `scheduler.js` | File (manuel en tête), plafond quotidien, verrou consultatif distinct, tick `VALUATION_TICK_MINUTES` (60) ; désactivé si `VALUATION_ENABLED=false` ou aucun moteur |

- `enrichment/engines.js` : `runEngine(engine, userPrompt, { schema, systemPrompt, task })` ; sans options, comportement actuel inchangé (schéma et prompt de l'enrichissement, tâche `enrich-wine`).
- Nouvelle tâche IA `valuation` dans `aiService.js` (Claude Sonnet, effort `low`, ~4000 tokens, surchargeable) pour le repli par API avec recherche web ; coût journalisé dans `ai_calls`.
- Contenu web = données, jamais instructions.

## 7. API — `backend/src/routes/valuation.js` (authentifiée)

| Route | Comportement |
|---|---|
| `GET /cellar/value?months=24` | `{ series: [{ month, invested, value, estimatedPurchase }], today: { invested, estimatedPurchase, value, gain, gainPct }, coverage: { bottles, withPrice, withValuation }, movers: { up: [...5], down: [...5] } }` |
| `GET /wines/:id/valuations` | `{ latest, history: [...], status, nextCheckAt }` |
| `POST /wines/:id/valuations` | Saisie `USER` `{ priceEur, lowEur?, highEur?, note? }` ; 400 si montant ≤ 0 ou > 100 000 |
| `POST /wines/:id/valuations/refresh` | Met le vin en tête de file ; limiteur IA ; 409 si aucun moteur |
| `GET /cellar/missing-prices` | Vins en stock avec bouteilles sans prix : `{ wineId, name, vintage, format, missing, suggestedPrice }` |
| `PUT /cellar/missing-prices` | `[{ wineId, priceEur }]` → prix appliqué aux seules bouteilles sans prix de chaque vin, ligne `NOTE` au journal ; renvoie le nombre de bouteilles mises à jour |

## 8. Interface

- **Insights, onglet « Valeur »** : KPI (valeur estimée, investi, plus-value € et %, couverture) ; courbe 24 mois investi / valeur (recharts), part « achat estimé » distinguée ; tops hausse/baisse ; bandeau « N bouteilles sans prix d'achat — compléter ».
- **Rattrapage des prix** (depuis l'onglet Valeur) : tableau vin / millésime / bouteilles sans prix / champ prix pré-rempli en grisé par la cote ; « Enregistrer » en une fois ; utilisable au clavier ; une ligne par vin sur mobile.
- **Fiche vin, bloc « Cote »** : cote et fourchette, niveau (« ce millésime » / « autre millésime » / « saisie »), date, sources cliquables, mini-courbe, plus-value par bouteille si prix connu ; « Saisir une cote », « Rafraîchir ».
- **Tableau de bord, tuile « Valeur »** : valeur estimée, variation sur 12 mois, couverture ; masquée sans aucune cote.
- Style Cockpit, français, pas de `dark:`.

## 9. Tests

- Unitaires (`compute.js`) : conversion du format, normalisation, aberrants, médiane/fourchette, séries (achat, consommation, cadeau, bouteille sans prix, achat estimé, `created_at` à défaut de date d'achat), plus-value par vin, `shouldValue` (USER récent, stock nul, échéance).
- API (moteur et pages simulés) : point enregistré seulement avec source vérifiée, `NONE` sinon ; `USER` jamais écrasé ; rattrapage sans écraser de prix existant ; plafond quotidien et file prioritaire ; non-régression de `runEngine` pour l'enrichissement.
- Front : typecheck, tests, build ; vérification visuelle sur pile locale avec cotes factices (bureau + 375 px).

## 10. Configuration et déploiement

Variables : `VALUATION_ENABLED` (true), `VALUATION_DAILY_LIMIT` (15), `VALUATION_TICK_MINUTES` (60), surcharges `VINOFLOW_*_VALUATION`. En prod : cote automatique avec `CLAUDE_CODE_OAUTH_TOKEN` (ou `ANTHROPIC_API_KEY`) ; migration au démarrage. Fusion et déploiement uniquement avec accord explicite.
