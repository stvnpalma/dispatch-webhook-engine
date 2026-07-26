import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 1. Global Ignores
  {
    ignores: ["cdk.out/", "node_modules/", "dist/"],
  },

  // 2. TypeScript-aware base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // 3. Custom Rule Overrides
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // 4. CommonJS Config Files Override
  {
    files: ["**/*.config.js"],
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs",
    },
  },
);
