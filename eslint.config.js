import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["build/**", "dist/**", "manifest.json", "node_modules/**", "*.cjs"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        figma: "readonly"
      }
    }
  }
);
