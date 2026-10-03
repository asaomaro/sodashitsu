import type { Page } from "@playwright/test";

/**
 * ブラウザが送った `ask.answer`（回答）・`ask.cancel`（取り消し）の要求の数（CDP の `Network.webSocketFrameSent`。`support/frames.ts` の流儀。
 * テストの側のクライアントではなく、ブラウザが送ったもの）。「決定されていない／取り消されていない」を `sodactl` の終了の有無の 1 回の読み取りで済ませず、
 * 送られたフレームの数で見る（決定は非同期なので、終わっていないことは決定していないことの証拠にならない）。
 * このページを開いてからの累計。**`page.goto()` の前に `await` して呼ぶ**。`ask-form.spec.ts` の `openBrowser` も、ほかの spec もこれを使う（数え方を 1 つにしておく）。
 */
export async function watchSentAsk(page: Page): Promise<{ answers(): number; cancels(): number }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let answers = 0;
  let cancels = 0;
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return; // テキストのフレーム（JSON の要求）だけ
    try {
      const method = (JSON.parse(e.response.payloadData) as { method?: unknown }).method;
      if (method === "ask.answer") answers++;
      else if (method === "ask.cancel") cancels++;
    } catch {
      // JSON でないフレームは無視する
    }
  });
  return { answers: () => answers, cancels: () => cancels };
}
