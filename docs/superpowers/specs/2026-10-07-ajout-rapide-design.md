# Ajout rapide — photo d'étiquette et rafale

## Objectif

Ajouter des vins sans ressaisie :

1. **Photo d'étiquette depuis « Ajouter »** : la fiche se remplit directement (aujourd'hui la lecture d'étiquette est dans Outils sommelier, à trois écrans de là).
2. **Rafale** pour un carton ou un salon : une photo par vin, à la suite ; chaque photo devient une ligne à vérifier, puis tout est enregistré d'un coup — en **cave**, en **envie** ou en **dégustation**.

**Critère de succès** : au retour d'un salon, 12 photos prises dans les allées (dont certaines sans réseau) donnent, en moins de 2 minutes de vérification, 8 vins en cave, 2 envies et 2 dégustations, sans doublon.

## Décisions

1. Rafale **photo par photo** (pas de photo groupée de plusieurs bouteilles).
2. **Brouillon conservé sur le téléphone** : photos analysées dès que le réseau est là ; on peut fermer l'app et reprendre.
3. Chaque ligne va en **Cave**, **Envie** ou **Dégustation**.
4. Approche : brouillon et analyse côté téléphone (IndexedDB + route OCR existante), **enregistrement groupé par une nouvelle route en une transaction**.

## Hypothèses validées

- Une dégustation exige une fiche vin (`tasting_notes.wine_id NOT NULL`) : un vin goûté non acheté est créé à **0 bouteille** avec sa note.
- Vin déjà en cave → la ligne le propose et ajoute les bouteilles / la note à ce vin (pas de doublon).
- Les photos ne sont **pas conservées** après l'enregistrement.
- Bouteilles en « Non trié » ; rangement ensuite depuis le Plan.
- Enrichissement IA des nouvelles fiches lancé après l'enregistrement, comme aujourd'hui.

## Hors périmètre

Photo groupée de plusieurs bouteilles ; facture / bon de livraison ; partage de photo depuis l'app Photos d'iOS (Web Share Target non pris en charge par iOS) ; stockage des photos ; conversion Envies → Cave ; mode hors ligne général de l'app (piste « PWA hors ligne »).

## 1. Parcours

### « Ajouter » (`/add-wine`)

- Bouton **📷 Photo** à côté du champ « Étiquette » (`<input type="file" accept="image/*" capture="environment">`). La photo est lue (`POST /api/wines/extract-from-image`) et remplit le formulaire actuel : texte « Étiquette » (nom + cuvée + millésime), producteur, couleur ; appellation, région, pays, cépages, format sont gardés pour l'enregistrement. « Déjà en cave » (`findExisting`) s'affiche en tête comme aujourd'hui. Pendant la lecture : « Lecture de l'étiquette… » ; en échec : message et saisie texte inchangée.
- Bouton **Rafale (plusieurs vins)** → `/add-wine/rafale`.
- Si un brouillon de rafale existe : bannière « Rafale en cours · N photo(s) — Reprendre ».

### Écran Rafale (`/add-wine/rafale`), mobile d'abord

- En haut : champ facultatif **Occasion** (ex. « Salon des vins de Loire »), mention « Brouillon gardé sur ce téléphone » (ou « Brouillon non conservé si tu fermes l'app » quand IndexedDB est indisponible), action « Vider la rafale » (confirmation).
- Gros bouton **Photo suivante** (fixé en bas sur mobile, au-dessus de la barre d'enregistrement).
- Une **carte par photo**, la plus récente en haut : vignette, état, vin lu.
  - États : *en attente de réseau*, *lecture…*, *prêt*, *à vérifier* (lecture peu sûre), *échec* (actions : « Reprendre la photo », « Saisir le texte »).
  - Champs modifiables : nom, producteur, millésime, couleur (+ cuvée, appellation repliés).
  - **Destination** (sélecteur 3 choix, défaut Cave) :
    - **Cave** : quantité (1–99, défaut 1), prix unitaire (facultatif) ;
    - **Envie** : prix estimé (facultatif) ;
    - **Dégustation** : 1 à 5 étoiles (obligatoire), commentaire (facultatif).
  - **Vin reconnu en cave** : « Déjà en cave · Château X 2018 (3 btl) » ; bouteilles / note ajoutées à ce vin ; lien « Ce n'est pas lui » → nouvelle fiche (`forceNew`).
  - Supprimer la ligne.
- **Barre du bas** : « Enregistrer N lignes » + résumé (« 6 en cave · 21 btl · 2 envies · 2 dégustations ») ; désactivée tant qu'une ligne est *en attente*, *lecture…*, *à vérifier* ou *échec* — une ligne *à vérifier* devient *prête* dès que l'utilisateur la touche (« Valider ») ; le nombre de lignes bloquantes est affiché.
- Après succès : toast récapitulatif avec action « Ranger » (`/plan`), brouillon vidé, retour à « Ajouter ».

## 2. Brouillon et analyse (téléphone)

### Brouillon — `utils/quickAddDraft.ts`

Interface de stockage `DraftStore` (`list()`, `put(line)`, `delete(id)`, `clear()`, `getMeta()`, `putMeta(meta)`) avec deux implémentations : **IndexedDB** (base `vinoflow-quick-add`, magasins `lines` et `meta`) et **mémoire** (repli si IndexedDB indisponible, et pour les tests).

```
DraftLine = {
  id: string (uuid), createdAt: number,
  photo: Blob | null,                 // JPEG réduit ; null après « Saisir le texte »
  status: 'PENDING' | 'READING' | 'READY' | 'REVIEW' | 'FAILED',
  attempts: number, retryAt: number | null, error: string | null,
  ocr: OcrResult | null,               // dernière lecture
  edits: Partial<WineDraft>,           // saisies de l'utilisateur — priment sur ocr
  destination: 'CELLAR' | 'WISHLIST' | 'TASTING',
  quantity: number, price: number | null, estimatedPrice: number | null,
  rating: number | null, comment: string,
  matchWineId: string | null, forceNew: boolean,
}
DraftMeta = { batchId: string (uuid), occasion: string }
```

Vin affiché/enregistré = `{ ...fromOcr(ocr), ...edits }`.

### Photo

Réduction comme `loadImage` des Outils sommelier (côté max 1600 px, JPEG 0,85), puis qualité abaissée par paliers (0,7 ; 0,55) tant que le base64 dépasse **700 Ko** (limite JSON globale de l'API : 1 Mo). Fonction extraite dans `utils/labelImage.ts` et réutilisée par `OcrTool`.

### File d'analyse — `utils/quickAddQueue.ts` (pur) + `hooks/useQuickAddQueue.ts`

- Une photo à la fois, la plus ancienne `PENDING` dont `retryAt` est passé.
- Déclencheurs : ajout d'une photo, événement `online`, ouverture de l'écran, échéance de `retryAt`.
- Transitions (fonction pure `nextState(line, outcome, now)`) :

| Résultat de `extract-from-image` | Nouvel état |
|---|---|
| Succès, `confidence` HIGH/MEDIUM et nom ou producteur présent | `READY` |
| Succès, `confidence` LOW ou ni nom ni producteur | `REVIEW` |
| Pas de réseau (erreur `fetch`) ou 5xx | `PENDING`, `retryAt` = now + 30 s × 2^tentatives (max 5 min) |
| 429 | `PENDING`, `retryAt` = now + `Retry-After` (défaut 60 s) |
| 400/401/403/404/413, ou 5 échecs 5xx de suite | `FAILED` avec message |

- Une lecture qui arrive après une saisie utilisateur **ne remplace jamais** `edits`.
- Rapprochement après lecture : `findExisting` (extrait de `CockpitAddWine.tsx` vers `utils/findExisting.ts`) sur l'inventaire chargé ; s'il y a exactement un candidat dont le millésime correspond, `matchWineId` est pré-rempli (modifiable).

## 3. Enregistrement groupé (backend)

### Route `POST /api/quick-add`

Corps (aucune photo) :

```
{ batchId: uuid, occasion?: string, lines: [{
    clientId: string,
    destination: 'CELLAR' | 'WISHLIST' | 'TASTING',
    wine: { name, producer?, vintage?, type?, cuvee?, appellation?, region?, country?, grapeVarieties?, format? },
    matchWineId?: uuid, forceNew?: boolean,
    quantity?: int 1–99,  price?: number ≥ 0,      // CELLAR
    estimatedPrice?: number ≥ 0,                   // WISHLIST
    rating?: int 1–5, comment?: string             // TASTING
}] }
```

1–50 lignes. Validation complète avant toute écriture ; une ligne invalide → **400** `{ error, lines: [{ clientId, message }] }`, rien n'est écrit.

### Application (une transaction, `withTransaction`)

Pour chaque ligne, **trouver le vin** (sauf Envie) :

1. `matchWineId` s'il existe (sinon 400 « Ce vin n'existe plus dans la cave ») ;
2. sinon, si pas `forceNew` : vin existant de même **nom + producteur + millésime** (comparaison sans casse, accents ni espaces superflus) ;
3. sinon : fiche déjà créée **dans cette rafale** avec la même identité ;
4. sinon : **nouvelle fiche** (colonnes de `POST /wines` ; `format` par défaut `750ml`).

Puis selon la destination :

- **Cave** : `quantity` bouteilles (`location` « Non trié », `purchase_date` = maintenant, `purchase_price` = `price`, `added_by_user_id` = utilisateur) ; une entrée `journal` `IN` (`quantity`, `description` = « Rafale » ou « Rafale · <occasion> », `user_id`).
- **Envie** : ligne `wishlist` (name, producer, region, appellation, type, vintage, `estimated_price`, `source` = occasion ou « Rafale du JJ/MM », priorité MEDIUM). Pas de fiche vin.
- **Dégustation** : `tasting_notes` (`overall_rating` = étoiles, `general_notes` = commentaire, `occasion`, `date` = maintenant) sur le vin trouvé ou créé (0 bouteille si nouveau).

Réponse **200** :

```
{ batchId, summary: { winesCreated, bottlesAdded, wishlistAdded, tastingsAdded },
  lines: [{ clientId, wineId | null, created: boolean }] }
```

### Idempotence

Migration **`012_quick_add_batches.sql`** : `quick_add_batches (id uuid PRIMARY KEY, user_id varchar(255), result jsonb NOT NULL, created_at timestamptz DEFAULT now())`. Le compte-rendu est enregistré dans la même transaction ; un `batchId` déjà connu renvoie le compte-rendu stocké (200) **sans rien réécrire**. (009–011 sont pris par les PR #14 et #15.)

### Enrichissement

Après validation de la transaction, `requestEnrichment(wineId, 'manual')` pour chaque **nouvelle fiche avec bouteilles** (pas pour les fiches créées pour une dégustation seule).

### Limites

Parseur JSON global (1 Mo) ; pas d'appel IA donc pas de `aiLimiter` ; authentification requise.

## 4. Tests

- **Front (Vitest, `utils/`)** : `quickAddQueue` (toutes les transitions du tableau, `retryAt`, priorité des `edits`, choix de la prochaine ligne), récapitulatif de la barre du bas et lignes bloquantes, construction du corps `/api/quick-add` (vin = ocr + edits, champs par destination), `labelImage` (paliers de qualité sous 700 Ko — calcul de taille testé sur la fonction de choix de qualité), `findExisting` (comportement actuel conservé), `DraftStore` mémoire.
- **Backend unitaires** : validation des lignes ; normalisation d'identité.
- **Backend API (supertest)** : rafale mixte (cave + envie + dégustation) → vins, bouteilles, journal IN, wishlist, tasting_notes ; vin existant reçoit les bouteilles sans doublon ; `forceNew` crée une fiche ; deux lignes identiques → une seule fiche ; dégustation sur vin nouveau → fiche à 0 bouteille ; ligne invalide → 400 et rien d'écrit ; `matchWineId` disparu → 400 ; `batchId` rejoué → même compte-rendu, rien de recréé ; 401.
- **Bout en bout (navigateur, pile Docker locale)** : photo sur « Ajouter » ; rafale de 3 photos dont une hors ligne (simulation réseau), fermeture/reprise, enregistrement. Sans clé IA locale, la lecture est simulée par interception de la requête ; lecture réelle à vérifier sur le NAS.

## Risques

- **Safari iOS** peut effacer le stockage d'un site non installé après ~7 jours sans visite : acceptable pour une rafale reprise le jour même ; l'écran l'indique.
- **Limite IA** (60 appels / 15 min / utilisateur) : au-delà, les photos attendent (`PENDING`), sans erreur.
- **Lecture peu sûre** : `REVIEW` bloque l'enregistrement jusqu'à validation explicite.
- **Chevauchement avec la piste PWA hors ligne** : le brouillon est autonome (pas de service worker, pas de cache d'API) et réutilisable.
