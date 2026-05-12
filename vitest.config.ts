import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'server',
          include: ['src/core/**/*.test.ts', 'src/routes/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'client',
          include: ['src/client/**/*.test.tsx', 'src/client/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['src/client/test-setup.ts'],
          globals: true,
        },
      },
    ],
  },
});
