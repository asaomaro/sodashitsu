import { defineConfig } from "vitest/config";

/**
 * `scripts/` の道具のテスト（20260927-rename-sodashitsu の decisions D3。移行スクリプト `migrate-from-wtm.sh` を sh で実際に起動する）。
 * ルートの `vitest.config.ts` の `projects` から読まれる。
 */
export default defineConfig({
  test: {
    name: "scripts",
    environment: "node",
    include: ["*.test.ts"],
    testTimeout: 60_000,
  },
});
