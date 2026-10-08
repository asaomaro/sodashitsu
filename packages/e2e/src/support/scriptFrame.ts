import type { Page } from "@playwright/test";

/**
 * スクリプトが動く形式の枠の土台（`/display-view/script.html`）を、アプリの部品（`DisplayFrame`）を通さずに、**テスト自身が親になって**開く道具。
 * 前提の実測（差し込みで `load` が 1 回のままか・ふつうの HTML とライブラリが動くか）と、枠の中の探りに使う。
 * ページ（アプリの origin）に iframe を足し、合い札・通り道（`MessageChannel`）・`render` を、`DisplayFrame` と同じ順で渡す。
 * 状態は `window.__probe` に置く。ここで作る親は、本物の `DisplayFrame` ではない（`DisplayFrame` の動きは display-script.spec.ts の別の筋）。
 */
export interface ProbeFrame {
  /** 親から見た iframe の `load` の回数。 */
  loads(): Promise<number>;
  /** 枠から port で届いた知らせの全部。 */
  messages(): Promise<Record<string, unknown>[]>;
  /** 枠へ port で送る。 */
  send(msg: unknown): Promise<void>;
  /** 枠の中で式を評価する（Playwright の frame.evaluate）。 */
  remove(): Promise<void>;
}

export async function mountProbeFrame(
  page: Page,
  opts: { source: string; theme?: { dark: boolean; vars: Record<string, string> }; sandbox?: string; ticket?: string; render?: boolean },
): Promise<ProbeFrame> {
  await page.evaluate(
    async ({ source, theme, sandbox, ticket, render }) => {
      const w = window as unknown as { __probe?: { iframe: HTMLIFrameElement; port: MessagePort; msgs: Record<string, unknown>[]; loads: number } };
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", sandbox);
      iframe.setAttribute("data-probe-frame", "");
      iframe.style.cssText = "position:fixed;left:0;top:0;width:480px;height:320px;z-index:99999;background:#fff";
      const state = { iframe, port: undefined as unknown as MessagePort, msgs: [] as Record<string, unknown>[], loads: 0 };
      w.__probe = state as never;
      iframe.addEventListener("load", () => state.loads++);
      const ready = new Promise<void>((resolve) => {
        const h = (ev: MessageEvent): void => {
          if (ev.source === iframe.contentWindow && (ev.data as { type?: string })?.type === "display-ready") {
            window.removeEventListener("message", h);
            resolve();
          }
        };
        window.addEventListener("message", h);
      });
      iframe.src = `/display-view/script.html?t=${ticket}`;
      document.body.appendChild(iframe);
      await ready;
      // 親は、display-ready と最初の load の両方を見てから通り道と中身を渡す（DisplayFrame と同じ）。
      while (state.loads < 1) await new Promise((r) => setTimeout(r, 10));
      const ch = new MessageChannel();
      state.port = ch.port1;
      ch.port1.onmessage = (e) => state.msgs.push(e.data as Record<string, unknown>);
      iframe.contentWindow!.postMessage({ type: "display-init", v: 1 }, "*", [ch.port2]);
      if (render) ch.port1.postMessage({ type: "render", rev: 1, format: "script-html", source, theme, relayKeys: [] });
    },
    { source: opts.source, theme: opts.theme ?? { dark: true, vars: { "--soda-bg": "#1e1f29", "--soda-fg": "#f8f8f2" } }, sandbox: opts.sandbox ?? "allow-scripts", ticket: opts.ticket ?? "probe-ticket", render: opts.render ?? true },
  );
  return {
    loads: () => page.evaluate(() => (window as unknown as { __probe: { loads: number } }).__probe.loads),
    messages: () => page.evaluate(() => (window as unknown as { __probe: { msgs: Record<string, unknown>[] } }).__probe.msgs.slice()),
    send: (msg) => page.evaluate((m) => (window as unknown as { __probe: { port: MessagePort } }).__probe.port.postMessage(m), msg),
    remove: () => page.evaluate(() => (window as unknown as { __probe: { iframe: HTMLIFrameElement } }).__probe.iframe.remove()),
  };
}
