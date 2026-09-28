import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    // 設定画面の試験（`SettingsDialog.test.ts`）は 1 件ごとに約 21MB を残し（pinia ごとの settings の store が window の `storage` の listener を外さない等）、
    // 2026-09-28 時点で 93 件・約 2GB と worker の既定のヒープの上限に張り付いていた。操作が 1 つ増えた（20260927-agent-graph の open_graph）ところで
    // 溢れて worker ごと落ち始めたので、上限を上げる。漏れそのものの解消は別の課題。
    execArgv: ["--max-old-space-size=4096"],
  },
});
