import { defineConfig } from 'vitest/config';

// Tests unitaires (tests/unit) : fonctions pures, sans base.
// Tests d'API (tests/api) : supertest sur app.js + Postgres de test, actifs
// seulement si TEST_DATABASE_URL est défini (base dédiée, VIDÉE à chaque run).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/globalSetup.js'],
    // Les fichiers d'API partagent la même base : pas d'exécution parallèle.
    fileParallelism: false,
    // bcrypt coût 12 (~250 ms par hash) : certains tests d'auth en enchaînent 20.
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test_secret_0123456789abcdef0123456789abcdef',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://invalid@127.0.0.1:1/none',
      FRONTEND_URL: 'http://localhost:5001',
      ALLOW_SIGNUP: 'false',
      GEMINI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      SWEEGO_API_KEY: '',
      NOTIFICATIONS_ENABLED: 'false',
    },
  },
});
