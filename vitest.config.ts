import { defineConfig } from 'vitest/config';

// Tests unitaires du front (fonctions pures de utils/). Le backend a sa propre
// config (backend/vitest.config.js).
export default defineConfig({
  test: {
    include: ['utils/**/*.test.ts'],
    environment: 'node',
  },
});
