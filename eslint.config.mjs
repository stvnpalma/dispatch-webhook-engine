import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // 1. Global Ignores
  {
    ignores: ['cdk.out/', 'node_modules/', 'dist/'],
  },

  // 2. TypeScript-aware base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 3. Custom Rule Overrides
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // 4. CommonJS Config Files Override
  {
    files: ['**/*.config.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },

  // 5. Prettier Config
  eslintConfigPrettier,
]);
