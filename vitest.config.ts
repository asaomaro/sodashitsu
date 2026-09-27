import { defineConfig } from "vitest/config";

/**
 * `defineWorkspace`/`vitest.workspace.ts` は vitest 5 系で削除されている（型・実装のどちらにも存在しない。
 * 実測すると各 project の `vitest.config.ts` が無視され、環境が既定の node に落ちて packages/web の
 * `environment: "happy-dom"` が効かなくなる。`test.projects` に置き換える。decisions.md 参照）。
 */
export default defineConfig({
  test: {
    projects: ["packages/*", "scripts"],
  },
});
