# Contexte de build : la racine du dépôt (cf. docker-compose.yml), pour embarquer
# db/ (init.sql + migrations appliqués au démarrage par src/migrations.js).
FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ .
COPY db/ ./db/

EXPOSE 3100

CMD ["npm", "start"]
