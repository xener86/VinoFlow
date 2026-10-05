import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: { __APP_VERSION__: JSON.stringify(version) },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Group vendor code into stable chunks so the app code can change
        // without busting the much-larger vendor cache. Keeps initial
        // payload smaller and improves repeat-visit performance.
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom', 'react-router-dom'],
              'recharts': ['recharts', 'react-is'],
              'simple-maps': ['react-simple-maps'],
              'lucide': ['lucide-react'],
              'ai': ['@google/genai'],
            },
          },
        },
        chunkSizeWarningLimit: 800,
      }
    };
});
