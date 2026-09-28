/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: "module",
    project: false,
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    es2023: true,
  },
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "*.cjs"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
  overrides: [
    {
      // packages/web はブラウザで動く（Node の env ではない。.vue 自体は vue-tsc が型検査するのでここでは対象外）。
      files: ["packages/web/src/**/*.ts"],
      env: { node: false, browser: true, es2023: true },
    },
    {
      // packages/client-core は web（ブラウザ）と tui（Node）の両方で動く。型のために `@types/node` を入れているので、
      // Node だけのグローバルを使っても tsc は通ってしまう——ここで止める（20260927-cli-mode の 01 の点検）。
      files: ["packages/client-core/src/**/*.ts"],
      env: { node: false, es2023: true },
      rules: { "no-restricted-globals": ["error", "process", "Buffer", "setImmediate", "clearImmediate", "require", "__dirname", "__filename", "global"] },
    },
  ],
};
