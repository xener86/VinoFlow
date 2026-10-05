# Import CSV — aller-retour avec l'export VinoFlow

## Objectif

Pouvoir **exporter la cave en CSV, la corriger en masse dans Excel / Numbers, puis réimporter** le fichier : VinoFlow applique les modifications après un aperçu clair.

**Critère de succès** : exporter, modifier ~30 lignes dans un tableur, réimporter → l'aperçu montre exactement ces modifications ; les appliquer ; réimporter une seconde fois le même fichier → « Aucun changement ».

## Périmètre

- **Inclus** : fiches des vins, prix d'achat, apogées, création de vins (avec un nombre de bouteilles).
- **Exclus** : formats CellarTracker, Vivino, CSV générique ; suppression de vins ou de bouteilles ; emplacements dans les casiers ; écrasement d'un prix d'achat existant.

## Décisions

1. Seul le format VinoFlow est accepté (clé = colonne **Identifiant**).
2. Cellule vide = **ne pas toucher**. Le marqueur `-` **efface** le champ (interdit pour Nom et Producteur).
3. Colonne absente = ne pas toucher (colonnes reconnues par leur en-tête, ordre libre).
4. Le prix d'achat ne s'applique **qu'aux bouteilles en stock sans prix** (`purchase_price` NULL ou 0).
5. Lecture, comparaison et écriture **côté serveur** : aperçu (`dryRun`) puis application atomique.

## 1. Format du fichier (export = format d'import)

Une ligne par vin en stock. Séparateur **`;`**, BOM UTF-8, décimales avec **virgule** (`14,50`), fichier `vinoflow-cave-AAAA-MM-JJ.csv`.

| Colonne | Export | Import |
|---|---|---|
| Identifiant | UUID du vin (1re colonne) | Clé. Vide = nouveau vin |
| Nom, Cuvée, Producteur, Millésime, Région, Appellation, Pays | valeur | modifiable |
| Type | libellé FR (Rouge, Blanc, Rosé, Pétillant, Dessert, Fortifié) | libellé FR ou code (`RED`…), insensible à la casse et aux accents |
| Cépages | liste séparée par `; ` | modifiable, liste remplacée entière |
| Format | ex. `75cl` | modifiable |
| Favori | Oui / Non | modifiable (Oui/Non, insensible à la casse) |
| Apogée début, Apogée fin | **seulement si `peak_start`/`peak_end` sont enregistrés en base**, sinon vide | modifiable ; enregistrée comme saisie manuelle (source USER, confiance HIGH) |
| Prix d'achat (€) | prix moyen des bouteilles en stock **si toutes ont un prix**, sinon vide | rempli sur les bouteilles en stock sans prix uniquement |
| Bouteilles | vide | nouveau vin : nombre de bouteilles à créer (défaut 1, entier 1–99) ; vin existant : ignorée |
| Description | `sensoryDescription` | modifiable |
| Accords mets | liste séparée par `; ` | modifiable, liste remplacée entière |
| Stock, Apogée (statut), Fenêtre estimée | calculés (fenêtre = `getPeakWindow`, estimation comprise) | **lecture seule, ignorées** |

### Lecture tolérante

- BOM présent ou non ; séparateur `;` ou `,` détecté sur la ligne d'en-tête ; guillemets doublés ; retours à la ligne dans une cellule ; CRLF ; espaces autour des valeurs supprimés.
- Nombres : `14,50` ou `14.50`.
- En-têtes comparés sans casse, sans accents et sans espaces superflus.
- Lignes entièrement vides ignorées.
- **Fichier sans colonne Identifiant** (ancien export) : refus global, message « Ce fichier ne contient pas la colonne Identifiant. Réexporte ta cave depuis VinoFlow puis modifie ce nouveau fichier. »

## 2. Backend

### Module `backend/src/csvImport/`

Trois fichiers purs (sans base) :

- `parse.js` — `parseCsv(text) → { headers: string[], rows: { line: number, cells: string[] }[] }`. `line` = numéro de ligne dans le tableur (en-tête = 1).
- `rows.js` — `toPatches({ headers, rows }) → { patches: Patch[], errors: LineError[] }`. Convertit chaque ligne en patch typé : champs présents seulement, `-` → `null` (effacement), Type → code, Oui/Non → booléen, nombres FR → nombres. Une ligne invalide produit une erreur `{ line, message }` et aucun patch.
- `plan.js` — `buildPlan(patches, cellar) → Plan` où `cellar` = vins (avec bouteilles en stock) chargés de la base. Calcule par ligne : changements champ par champ (`{ field, before, after }`), apogée, prix à remplir (nombre de bouteilles concernées), création, inchangé, erreur ou avertissement. Fournit `planHash` (SHA-256 d'une sérialisation stable du plan).

### Erreurs par ligne (la ligne est écartée, le reste passe)

- identifiant inconnu (vin supprimé ou fichier d'une autre cave) ;
- identifiant présent deux fois dans le fichier ;
- nouveau vin sans Nom ou sans Producteur ;
- tentative d'effacer Nom ou Producteur (`-`) ;
- millésime non entier (ou hors 1800–année courante + 1) ;
- prix non numérique ou négatif ;
- type inconnu ;
- apogée non entière, ou début > fin, ou une seule des deux bornes renseignée pour un vin qui n'a pas d'apogée ;
- Bouteilles hors 1–99.

### Avertissements (n'empêchent rien)

- nouvelle ligne dont Nom + Producteur + Millésime correspondent à un vin existant : « existe peut-être déjà ».
- prix renseigné pour un vin dont toutes les bouteilles ont déjà un prix : « prix déjà connus, ignoré ».

### Route `POST /api/import/csv`

Corps JSON `{ csv: string, dryRun: boolean, planHash?: string }`, parseur dédié limité à **2 Mo**, **5 000 lignes** max, même rate limit que `/api/import`.

- `dryRun: true` → `200 { plan, planHash }`, **aucune écriture**.
- `dryRun: false` → recalcule le plan sur la cave actuelle ; si `planHash` absent ou différent → **409** « La cave a changé depuis l'aperçu, relance-le. » ; sinon applique tout dans **une transaction** (`withTransaction`) et renvoie `200 { applied: { updated, peaks, pricedBottles, created, createdBottles } }`.
- Fichier illisible / sans Identifiant → **400** avec le message ci-dessus.

### Application

- Vin modifié : `UPDATE wines` des seuls champs changés, `updated_at = now()`.
- Apogée : `peak_start`, `peak_end`, `peak_source = 'USER'`, `peak_confidence = 'HIGH'` (même effet que `PUT /wines/:id/peak`).
- Prix : `UPDATE bottles SET purchase_price = $prix WHERE wine_id = $id AND NOT is_consumed AND (purchase_price IS NULL OR purchase_price = 0)`.
- Nouveau vin : `INSERT INTO wines` (mêmes colonnes que `POST /wines`), N bouteilles en stock sans emplacement ni prix (ou avec le prix de la ligne), une entrée **journal** `type = 'IN'`, `quantity = N`, `description = 'Import CSV'`. L'enrichissement n'est pas appelé : le planificateur prend en charge les vins jamais enrichis.

## 3. Écran (Réglages → Données)

- L'export CSV existant adopte le nouveau format (`utils/exportCsv.ts`).
- Nouveau bouton **« Importer un CSV modifié »** + aide : « Exporte, modifie dans Excel ou Numbers, réimporte. Une cellule vide ne change rien, `-` efface. »
- Après choix du fichier : appel `dryRun`, puis **fenêtre d'aperçu** (style Cockpit) :
  - tuiles : vins modifiés, apogées, prix remplis (N bouteilles), nouveaux vins, erreurs ;
  - liste repliable par vin : « Château X 2018 · Appellation : Bordeaux → Pessac-Léognan » ;
  - erreurs et avertissements avec leur numéro de ligne ;
  - bouton **« Appliquer N changements »** (désactivé si rien à faire) ; « Aucun changement » si le fichier est identique à la cave.
- Après application : toast récapitulatif, rechargement de la cave. Sur 409 : l'aperçu est relancé automatiquement.

## 4. Tests

- **Front (Vitest)** : nouvel export (colonnes, `;`, virgule décimale, apogée vide si seulement estimée, prix vide si une bouteille sans prix) ; un fichier type produit par l'export est versionné comme fixture (`backend/tests/fixtures/export-vinoflow.csv`) et relu sans erreur par les tests backend (aller-retour).
- **Backend unitaires** : `parse` (BOM, `;`/`,`, guillemets, retours à la ligne, CRLF, lignes vides) ; `rows` (chaque conversion, chaque erreur) ; `plan` (cellule vide, `-`, prix sur bouteilles sans prix seulement, identifiant inconnu / en double, doublon probable, fichier sans changement, `planHash` stable).
- **Backend API (supertest)** : `dryRun` n'écrit rien ; application atomique (une erreur SQL n'écrit rien) ; 409 si la cave change entre aperçu et application ; nouveau vin → bouteilles + journal ; réimport du même fichier → zéro changement ; fichier sans Identifiant → 400 ; 401 sans jeton.

## Risques

- **Excel réécrit les valeurs** (dates, nombres, zéros) : les colonnes sensibles sont des entiers simples ou du texte ; les millésimes restent des entiers. Les UUID ne sont pas altérés par Excel.
- **Effacement accidentel** : impossible par cellule vide (décision 2) ; `-` est explicite et visible dans l'aperçu.
- **Fichier d'une autre cave** : identifiants inconnus → lignes en erreur, rien n'est écrasé.
