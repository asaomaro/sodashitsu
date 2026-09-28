import { afterEach, describe, expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";

/** 統合の review ラウンド 1 の差し戻し（止め方の注意の表示・利用者が止めたサーバの後の終わり方）。 */
describe("統合の review r1（端末版）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  it("初回の token と止め方の注意の両方を、代替画面の前に標準エラーへ出し、画面の知らせにも順に出す", async () => {
    const h = await startedApp({
      target: { startupNotice: "soda: token URL\n2 行目", stopHint: "soda: 止め方の注意" },
    });
    closers.push(h.close);
    const err = h.io.errors();
    expect(err).toContain("soda: token URL");
    expect(err).toContain("soda: 止め方の注意");
    const app = h.app as unknown as {
      notice: string | null;
      showNotices(t: readonly string[], ms: number): void;
    };
    expect(app.notice).toBe("soda: token URL");
    app.showNotices(["一つ目", "二つ目"], 30);
    expect(app.notice).toBe("一つ目");
    await vi.waitFor(() => expect(app.notice).toBe("二つ目"));
  });

  it("止め方の注意だけのときも標準エラーと知らせに出す", async () => {
    const h = await startedApp({ target: { stopHint: "soda: 止め方の注意" } });
    closers.push(h.close);
    expect(h.io.errors()).toContain("soda: 止め方の注意");
    expect((h.app as unknown as { notice: string | null }).notice).toBe("soda: 止め方の注意");
  });

  it("手元のサーバを止めた後にサーバが居なくなったら、終了コード 0 で「サーバを止めました」", async () => {
    const h = await startedApp({ respond: { "server.stop": {} } });
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.app.ui.openDialogWithContext({ kind: "confirmStopServer", target: "h", remote: false });
    (
      h.app as unknown as { dispatcher: { confirmStopServer(): void } }
    ).dispatcher.confirmStopServer();
    const net = (h.app as unknown as { net: { stopExpected: boolean; h: { onStopped(): void } } })
      .net;
    await vi.waitFor(() => expect(net.stopExpected).toBe(true));
    net.h.onStopped();
    expect(await h.running).toBe(0);
    expect(h.io.errors()).toContain("サーバを止めました");
    h.outer.dispose();
  });
});
