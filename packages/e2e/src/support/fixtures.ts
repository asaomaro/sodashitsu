import { test as base } from "@playwright/test";
import type { ImageFetcher } from "@sodashitsu/server";
import { startAppServer, type AppServer } from "./appServer.js";

/** `appServer` を追加した Playwright Test の `test`（05-e2e-docs T1）。全 spec はこれを import して使う。 */
export const test = base.extend<{ appServer: AppServer; askImageFetcher: ImageFetcher | undefined }>({
  /** 質問のフォームの外部 URL の画像の取得の差し替え（`test.use({ askImageFetcher })`。既定は実物）。 */
  askImageFetcher: [undefined, { option: true }],
  appServer: async ({ askImageFetcher }, use) => {
    const server = await startAppServer(askImageFetcher !== undefined ? { askImageFetcher } : {});
    await use(server);
    await server.close();
  },
});

export { expect } from "@playwright/test";
