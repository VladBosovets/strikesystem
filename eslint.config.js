import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const sharedRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-unused-vars': 'off',
  'no-unused-vars': 'off',
};

export default defineConfig([
  tseslint.configs.recommended,
  // Server files — Node globals, type-aware
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/routes/**/*.ts', 'src/core/**/*.ts', 'src/index.ts'],
    ignores: ['src/**/*.test.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },
  // Client files — browser globals, type-aware
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/client/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, React: 'readonly' },
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },
  // Test files — no type-aware linting (excluded from tsconfig)
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.test.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { project: false },
    },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
