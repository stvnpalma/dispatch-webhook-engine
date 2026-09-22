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

  // 4. Test File Safeguards
  {
    files: ['test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:test',
              message:
                'Do not import node:test — Jest globals (test, describe, expect) are already available without importing anything. This shadows Jest and silently breaks the whole file.',
            },
          ],
        },
      ],
    },
  },

  // 5. CommonJS Config Files Override
  {
    files: ['**/*.config.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },

  // 6. Prettier Config
  eslintConfigPrettier,
]);
