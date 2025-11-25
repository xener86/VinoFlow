# VinoFlow - Cave à Vin Intelligente 🍷

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Self-Hosted](https://img.shields.io/badge/Self--Hosted-Yes-orange)]()

VinoFlow est une application web moderne (PWA) conçue pour gérer votre cave à vin et votre bar à spiritueux. Elle s'appuie sur l'IA pour enrichir automatiquement vos fiches, vous suggérer des accords mets-vins parfaits et optimiser la gestion de votre stock.

![VinoFlow Screenshot](docs/screenshot.png)

## ✨ Fonctionnalités

### 🍇 Gestion de Cave
- Inventaire visuel complet avec fiches détaillées
- Plan de cave 2D interactif (étagères, caisses)
- Drag & drop pour organiser vos bouteilles
- Historique des mouvements et consommations
- Recherche globale et filtres avancés

### 🤖 Sommelier IA
- Enrichissement automatique des fiches via photo d'étiquette
- Suggestions "Quoi boire ce soir ?" contextualisées
- Accords mets-vins personnalisés selon votre stock
- Planification de soirées complètes
- Analyse de cave pour la Foire aux Vins

### 🍸 Bar & Mixologie
- Gestion des spiritueux avec niveaux de bouteille
- Recettes de cocktails intelligentes selon votre stock
- Mode "Party" avec calcul des ingrédients
- Protection des bouteilles de prestige

### 📊 Analytics
- Statistiques de consommation
- Valorisation du stock
- Profil gustatif personnel
- Alertes d'apogée

### 📱 Mobile First
- Interface PWA fluide
- Mode clair/sombre premium
- Installation sur écran d'accueil
- Fonctionne hors-ligne (données locales)

### 🏠 Auto-hébergeable
- Vos données restent chez vous
- Docker ready pour NAS
- Pas de cloud obligatoire

---

## 🚀 Installation

### Option 1: Docker (Recommandé pour NAS)

#### Prérequis
- Docker et Docker Compose installés
- Une clé API IA (Gemini recommandé - gratuit)

#### Déploiement rapide

```bash
# Cloner le dépôt
git clone https://github.com/votre-repo/vinoflow.git
cd vinoflow

# Configurer l'environnement
cp .env.example .env
# Éditez .env avec vos clés API

# Lancer en production
docker-compose up -d

# L'application est accessible sur http://votre-ip:8080
```

#### Configuration avancée

Modifiez le fichier `.env` :

```env
# Port d'exposition (défaut: 8080)
VINOFLOW_PORT=8080

# Timezone
TZ=Europe/Paris

# IA - Au moins une clé requise pour les fonctions IA
VITE_GEMINI_API_KEY=votre_cle_gemini
VITE_OPENAI_API_KEY=sk-...
VITE_MISTRAL_API_KEY=...

# Authentification Supabase (optionnel)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Option 2: Développement local

```bash
# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev

# Build pour production
npm run build
```

### Option 3: Docker Compose avec Développement

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## 🛠 Configuration

### Intelligence Artificielle

VinoFlow supporte 3 fournisseurs IA :

| Fournisseur | Modèle | Gratuit | Vision |
|-------------|--------|---------|--------|
| **Google Gemini** | gemini-2.5-flash | ✅ Oui | ✅ Oui |
| OpenAI | gpt-4o-mini | ❌ Payant | ✅ Oui |
| Mistral | mistral-large | ❌ Payant | ❌ Non |

**Recommandé**: [Google Gemini](https://aistudio.google.com/app/apikey) - Gratuit et supporte l'analyse d'images.

Les clés API peuvent être configurées :
1. Via les variables d'environnement (`.env`)
2. Dans l'interface **Paramètres** de l'application

### Authentification (Optionnel)

Par défaut, VinoFlow stocke tout dans le localStorage du navigateur.

Pour activer l'authentification multi-utilisateurs :

1. Créez un projet sur [Supabase](https://supabase.com)
2. Configurez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
3. L'écran de connexion apparaîtra automatiquement

---

## 📱 Installation PWA (Mobile)

VinoFlow est une Progressive Web App :

### iOS (Safari)
1. Ouvrez l'app dans Safari
2. Appuyez sur **Partager** → **Sur l'écran d'accueil**

### Android (Chrome)
1. Ouvrez l'app dans Chrome
2. Menu **⋮** → **Installer l'application**

---

## 🗂 Structure du Projet

```
vinoflow/
├── components/          # Composants React réutilisables
│   ├── FlavorRadar.tsx
│   ├── Layout.tsx
│   ├── RackGrid.tsx
│   └── CellarModals.tsx
├── contexts/            # Contextes React (Auth, Theme)
├── pages/               # Pages de l'application
│   ├── Dashboard.tsx
│   ├── CellarMap.tsx
│   ├── AddWine.tsx
│   └── ...
├── services/            # Services (API, stockage)
│   ├── storageService.ts
│   ├── geminiService.ts
│   └── supabase.ts
├── types.ts             # Types TypeScript
├── docker/              # Configuration Docker
│   └── nginx.conf
├── docker-compose.yml
├── Dockerfile
└── ...
```

---

## 🔄 Mise à jour

```bash
cd vinoflow
git pull
docker-compose down
docker-compose up -d --build
```

---

## 💾 Sauvegarde des Données

### Export manuel
**Paramètres** → **Sauvegarde (JSON)**

### Import
**Paramètres** → **Restaurer** → Sélectionner le fichier `.json`

### Sauvegarde automatique (Docker)
Les données sont dans le localStorage du navigateur. Pour une persistance serveur, configurez Supabase.

---

## 🤝 Contribution

Les Pull Requests sont les bienvenues !

1. Fork le projet
2. Créez votre branche (`git checkout -b feature/AmazingFeature`)
3. Committez (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

---

## 🛠 Tech Stack

| Catégorie | Technologies |
|-----------|-------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS |
| **Icons** | Lucide React |
| **Charts** | Recharts |
| **IA** | Google GenAI SDK, OpenAI API, Mistral API |
| **Auth** | Supabase (optionnel) |
| **Deploy** | Docker, Nginx |

---

## 📝 License

MIT License - voir [LICENSE](LICENSE)

---

## 🙏 Remerciements

- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)
- [Recharts](https://recharts.org/)
- [TheCocktailDB](https://www.thecocktaildb.com/)

---

**Fait avec ❤️ pour les amateurs de vin**
