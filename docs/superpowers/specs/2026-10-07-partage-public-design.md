# Partage public — fiche vin et carte des vins d'un dîner

## Objectif

Partager par un **lien public** (sans compte) :

1. **une fiche vin** ;
2. **la carte des vins d'un dîner**, composée à la main (titre, date, vins de la cave dans l'ordre de service, plat associé facultatif).

**Critère de succès** : la veille du dîner, je compose la carte en une minute et j'envoie le lien ; les invités l'ouvrent sur leur téléphone sans compte ; après le dîner j'ajoute mes notes et le même lien les montre ; un lien révoqué affiche « Ce lien n'est plus actif ».

## Décisions

1. Partages : **fiche vin** et **carte de dîner** (pas de vitrine de cave ni de liste d'envies).
2. Carte de dîner **composée à la main** (aucune dépendance à la passerelle MenuFlow #14).
3. Contenu visible : **identité + description** (nom, producteur, millésime, appellation, région, pays, couleur, cépages, description, arômes, accords mets) et **mes notes de dégustation** (étoiles, commentaire, date). Jamais : prix, cote, bouteilles, emplacements, stock, apogée, identifiants internes, occasion et convives des dégustations.
4. Lien valable **jusqu'à révocation** ; liste et révocation dans Réglages.
5. Approche **A** : page publique dans l'app (`/p/:jeton`) + une seule route API publique en lecture seule. L'aperçu du lien (iMessage/WhatsApp) reste générique.

## Hypothèses validées

- URL `https://<hôte>/p/<jeton>` (prod : `vinoflow.lauziere17.com`, déjà exposée derrière nginx-proxy-manager).
- Données **en direct** : la page montre l'état actuel (une dégustation ajoutée après coup apparaît).
- Page en lecture seule, non indexée, limitée en débit ; aucune autre route de l'API n'est ouverte.
- Cave partagée : tous les comptes du foyer voient et révoquent tous les liens.

## 1. Données et serveur

### Migration `013_shares.sql` (012 est pris par #18)

```sql
CREATE TABLE IF NOT EXISTS shares (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    token text NOT NULL UNIQUE,
    kind text NOT NULL CHECK (kind IN ('WINE', 'DINNER')),
    wine_id uuid REFERENCES wines(id) ON DELETE CASCADE,
    title text,
    dinner_date date,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    view_count integer NOT NULL DEFAULT 0,
    last_viewed_at timestamp with time zone,
    CHECK ((kind = 'WINE' AND wine_id IS NOT NULL) OR (kind = 'DINNER' AND title IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS share_items (
    share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    position integer NOT NULL,
    wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
    dish text,
    PRIMARY KEY (share_id, position)
);
```

Supprimer un vin supprime son lien de fiche (cascade) et le retire des cartes.

### Jeton

`crypto.randomBytes(32).toString('base64url')` (43 caractères, 256 bits).

### Routes authentifiées (`backend/src/routes/shares.js`)

| Route | Effet |
|---|---|
| `GET /api/shares` | Tous les liens : `{ id, token, kind, title, dinnerDate, wineName, wineVintage, itemCount, createdAt, revokedAt, viewCount, lastViewedAt }`, plus récents d'abord |
| `GET /api/shares/:id` | Une carte de dîner pour le compositeur : `{ id, token, title, dinnerDate, items: [{ wineId, dish, name, producer, vintage }] }` |
| `POST /api/shares` `{ kind: 'WINE', wineId }` | Crée le lien de la fiche, ou **renvoie le lien actif existant** pour ce vin (200) ; 201 si créé ; 404 si le vin n'existe pas |
| `POST /api/shares` `{ kind: 'DINNER', title, date?, items: [{ wineId, dish? }] }` | Crée une carte (1 à 20 vins, titre 1–120 caractères, `dish` ≤ 200, date `AAAA-MM-JJ` facultative) ; 400 si invalide ou vin inconnu |
| `PUT /api/shares/:id` | Modifie titre / date / vins / ordre / plats d'une carte **active** ; le jeton ne change pas ; 404 si inconnue, 409 si révoquée, 400 si c'est une fiche |
| `POST /api/shares/:id/revoke` | Révoque (définitif, idempotent) |

Réponse de création/modification : `{ id, token, kind, url }` où `url` = `/p/<token>` (le front y ajoute `window.location.origin`).

### Route publique (`backend/src/routes/publicShares.js`)

`GET /api/public/shares/:token`, montée **avant** `authenticate` dans `app.js`, avec un limiteur dédié `publicLimiter` (120 requêtes / 15 min / IP). En-têtes : `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`.

- Jeton inconnu, mal formé ou révoqué → **404** `{ error: 'Ce lien n’est plus actif.' }` (réponse identique).
- Sinon : `view_count += 1`, `last_viewed_at = now()`, puis **200** :

```
{ kind: 'WINE' | 'DINNER', title: string | null, date: 'AAAA-MM-JJ' | null,
  wines: [{ position, dish, name, cuvee, producer, vintage, type, appellation, region, country,
            grapeVarieties, sensoryDescription, aromaProfile, suggestedFoodPairings,
            tastings: [{ date, rating, comment }] }] }
```

Construite par une fonction pure `toPublicShare(share, wines, tastings)` (`backend/src/shares/publicView.js`) qui **ne copie que la liste blanche** ; dégustations du vin triées par date décroissante, `rating` = `overall_rating`, `comment` = `general_notes` ; dégustations sans note ni commentaire ignorées.

## 2. Écrans

- **Fiche vin** (`pages/CockpitWineDetails.tsx`) : boutons **Partager** (crée/reprend le lien → `navigator.share({ title, url })` si disponible, sinon copie + toast « Lien copié ») et **Ajouter à une carte de dîner** (→ `/partages/diner?wine=<id>`).
- **Compositeur** (`pages/ShareDinner.tsx`, routes `/partages/diner` et `/partages/diner/:id`) : Titre, Date, recherche « Ajouter un vin » (vins de la cave, en stock d'abord, filtre texte sans accents sur nom, cuvée, producteur, appellation et millésime ; 8 résultats au plus), liste ordonnée (↑ ↓, retirer), champ « Servi avec » par vin ; **Enregistrer et partager** (création ou modification, puis partage comme ci-dessus). Erreurs du serveur affichées en toast.
- **Réglages → « Liens partagés »** (`pages/Settings.tsx`) : une ligne par lien (fiche/dîner, titre ou vin, date, « ouvert N fois », état), actions Copier, Modifier (dîner actif), Révoquer (confirmation) ; bouton « Nouvelle carte de dîner ». Liens révoqués en grisé.
- **Palette de commandes** : action « Nouvelle carte de dîner ».
- **Page publique** (`pages/PublicShare.tsx`, route `/p/:token` **hors** `ProtectedRoute` et hors `CockpitLayout`) : mise en page autonome mobile d'abord ; en-tête (titre + date en toutes lettres pour un dîner) ; un bloc par vin (numéro pour un dîner, « Servi avec … », nom, producteur · millésime, appellation, pastille de couleur, cépages, description, arômes, accords, dégustations en étoiles avec commentaire et date) ; pied « Partagé depuis VinoFlow » ; `<meta name="robots" content="noindex">` ajoutée à l'affichage ; 404 → « Ce lien n'est plus actif » ; autre erreur → « Impossible de charger la carte, réessaie. » L'appel public n'utilise pas `apiFetch` (pas de jeton, pas de déconnexion sur erreur).

## 3. Sécurité

- Une seule route publique, en lecture seule ; création et révocation réservées aux comptes.
- Jeton 256 bits ; 404 indistinct ; limiteur dédié contre l'énumération.
- Liste blanche testée : la réponse publique ne contient jamais `price`, `purchasePrice`, `bottles`, `location`, `companions`, `occasion`, `peak*`, `valuation`, `id`/`wineId`.
- Rendu React (texte échappé) ; aucune donnée HTML injectée.

## 4. Tests

- **Backend unitaires** : `toPublicShare` (liste blanche, ordre, tri et filtrage des dégustations, carte vs fiche).
- **Backend API (supertest)** : fiche créée puis reprise ; carte créée puis modifiée (même jeton, nouvel ordre, plats) ; route publique sans compte avec champs autorisés uniquement ; 404 identique (inconnu / révoqué) ; compteur d'ouvertures ; 401 sur les routes de gestion ; validation (0 ou 21 vins, vin inconnu, titre vide) ; PUT sur carte révoquée → 409 ; vin supprimé → retiré de la carte, lien de fiche inactif.
- **Front (Vitest, `utils/`)** : `utils/shareView.ts` (étoiles, date en français, libellé de couleur) et `moveItem` (réordonnancement).
- **Bout en bout** (navigateur, pile Docker locale) : partager une fiche, composer une carte de 3 vins, ouvrir le lien dans un onglet **non connecté**, ajouter une dégustation et la voir apparaître, révoquer → « Ce lien n'est plus actif ».

## Risques

- Un lien transféré donne accès à cette carte seulement (principe du lien public) ; révocation et compteur d'ouvertures pour garder la main.
- Aperçu du lien générique (accepté).
- Numéro de migration 013 : à vérifier selon l'ordre de fusion de #14, #15, #18.
