import { test as base } from "@playwright/test";
import type { ImageFetcher } from "@sodashitsu/server";
import { startAppServer, type AppServer } from "./appServer.js";

/** `appServer` を追加した Playwright Test の `test`（05-e2e-docs T1）。全 spec はこれを import して使う。 */
export const test = base.extend<{ appServer: AppServer; askImageFetcher: ImageFetcher | undefined; askExposed: boolean }>({
  /** 質問のフォームの外部 URL の画像の取得の差し替え（`test.use({ askImageFetcher })`。既定は実物）。 */
  askImageFetcher: [undefined, { option: true }],
  /** 外向きに公開した構成のサーバを立てる（`test.use({ askExposed: true })`。既定は手元だけのローカル起動）。 */
  askExposed: [false, { option: true }],
  appServer: async ({ askImageFetcher, askExposed }, use) => {
    const server = await startAppServer({ ...(askImageFetcher !== undefined ? { askImageFetcher } : {}), ...(askExposed ? { exposed: true } : {}) });
    await use(server);
    await server.close();
  },
});

export { expect } from "@playwright/test";
