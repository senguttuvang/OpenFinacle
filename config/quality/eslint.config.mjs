import promise from "eslint-plugin-promise";
import regexp from "eslint-plugin-regexp";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";
export default [
  {
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { promise, regexp, security, sonarjs, unicorn },
    rules: {
      complexity: ["error", 50],
      "max-depth": ["error", 6],
      "max-lines": [
        "error",
        { max: 700, skipBlankLines: false, skipComments: false },
      ],
      "promise/no-return-wrap": "error",
      "regexp/no-super-linear-backtracking": "error",
      "security/detect-eval-with-expression": "error",
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-all-duplicated-branches": "error",
      "sonarjs/no-redundant-boolean": "error",
      "unicorn/prefer-node-protocol": "error",
    },
  },
];
