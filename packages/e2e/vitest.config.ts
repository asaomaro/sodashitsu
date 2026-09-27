import { defineConfig } from "vitest/config";

/**
 * `packages/e2e` は Playwright Test（`@playwright/test`）で動かす（`pnpm --filter @sodashitsu/e2e test`）。
 * root の `vitest.config.ts`（`test.projects: ["packages/*"]`）にこのパッケージも含まれてしまうが、
 * vitest の既定の include（`**\/*.{test,spec}.?(c|m)[jt]s?(x)`）は `.spec.ts` も拾うため、そのままでは
 * `pnpm -s test`（vitest）が Playwright の spec ファイルを vitest の `test`/`expect` として実行しようとして
 * 壊れる。このパッケージを vitest の対象から完全に外す（05-e2e-docs T1）。
 */
export default defineConfig({
  test: {
    include: [],
  },
});
