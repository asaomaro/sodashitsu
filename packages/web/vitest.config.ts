import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `<ask-form>` は Vue の部品ではなくカスタム要素（`src/ask/askFormElement.ts` が登録する）。Vue に解決させない。
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "ask-form" } } }),
  ],
  test: {
    environment: "happy-dom",
    // 既定では、CSS は空に置き換わる（`?raw` の中身も空）。様式のトークンの CSS（`src/styles/uiStyle.css`）は、中身を読んで検査する（`uiStyle.test.ts`）。
    css: { include: [/uiStyle\.css/, /buttonTheme\.css/] },
    include: ["src/**/*.test.ts"],
    // 設定画面の試験（`SettingsDialog.test.ts`）は 1 件ごとに約 21MB を残し（pinia ごとの settings の store が window の `storage` の listener を外さない等）、
    // 2026-09-28 時点で 93 件・約 2GB と worker の既定のヒープの上限に張り付いていた。操作が 1 つ増えた（20260927-agent-graph の open_graph）ところで
    // 溢れて worker ごと落ち始めたので、上限を上げる。2026-11-07には147件で4GBも超えたため、
    // SettingsDialog.test.tsでwrapper/Pinia/storage listenerの後始末を追加。既存の上限は維持する。
    execArgv: ["--max-old-space-size=4096"],
  },
});
