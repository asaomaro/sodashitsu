import { test as base } from "@playwright/test";
import type { ImageFetcher } from "@sodashitsu/server";
import { startAppServer, type AppServer, type ExtensionsInternal } from "./appServer.js";

/** `appServer` を追加した Playwright Test の `test`（05-e2e-docs T1）。全 spec はこれを import して使う。 */
/**
 * `UI_STYLE_E2E=modern` を渡すと、どの spec も、画面の様式 modern で流れる（20261008-ui-style の design 追補 D13）。localStorage の設定（`soda.prefs.v1`）の読み出しに
 * `uiStyle: "modern"` を足す（spec が自分で設定を書いても効く）。渡さなければ、何もしない（クラシック）。
 */
const MODERN = process.env["UI_STYLE_E2E"] === "modern";

export const test = base.extend<{ appServer: AppServer; askImageFetcher: ImageFetcher | undefined; askExposed: boolean; extensionsInternal: ExtensionsInternal | undefined }>({
  /** 拡張（20261007-ext-host）の差し替え（`test.use({ extensionsInternal: { timings: { backoffMinMs: 20 } } })`。既定は実物）。 */
  extensionsInternal: [undefined, { option: true }],
  /** 質問のフォームの外部 URL の画像の取得の差し替え（`test.use({ askImageFetcher })`。既定は実物）。 */
  askImageFetcher: [undefined, { option: true }],
  /** 外向きに公開した構成のサーバを立てる（`test.use({ askExposed: true })`。既定は手元だけのローカル起動）。 */
  askExposed: [false, { option: true }],
  context: async ({ context }, use) => {
    if (MODERN) {
      await context.addInitScript(() => {
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function (this: Storage, key: string): string | null {
          const v = get.call(this, key);
          if (key !== "soda.prefs.v1") return v;
          try {
            return JSON.stringify({ ...(v ? (JSON.parse(v) as object) : {}), uiStyle: "modern" });
          } catch {
            return v;
          }
        };
      });
    }
    await use(context);
  },
  appServer: async ({ askImageFetcher, askExposed, extensionsInternal }, use) => {
    const server = await startAppServer({ ...(askImageFetcher !== undefined ? { askImageFetcher } : {}), ...(askExposed ? { exposed: true } : {}), ...(extensionsInternal !== undefined ? { extensions: extensionsInternal } : {}) });
    await use(server);
    await server.close();
  },
});

export { expect } from "@playwright/test";
