# Contexte de build : la racine du dépôt (cf. docker-compose.yml), pour embarquer
# db/ (init.sql + migrations appliqués au démarrage par src/migrations.js).
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Claude Code (enrichissement des fiches par l'abonnement, comme SuperQuickie) :
# version figée, installé hors du HOME d'exécution, sans mise à jour automatique.
# Connexion par CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) dans .env.
ARG CLAUDE_CODE_VERSION=2.1.286
RUN HOME=/opt/claude bash -c "curl -fsSL https://claude.ai/install.sh | bash -s ${CLAUDE_CODE_VERSION}" \
    && chmod -R a+rX /opt/claude
ENV PATH="/opt/claude/.local/bin:$PATH" HOME=/var/lib/vinoflow DISABLE_AUTOUPDATER=1
RUN mkdir -p /var/lib/vinoflow

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ .
COPY db/ ./db/

EXPOSE 3100

CMD ["npm", "start"]
