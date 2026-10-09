import { describe, expect, it } from "vitest";
import { PrefsModel } from "../model/PrefsModel.js";
import { SettingsWriter } from "./SettingsWriter.js";

/** 20261008-ui-style: 端末版は `uiStyle` を読まず・書かないが、端末版が設定を書いても、サーバの `uiStyle` は消えない。 */
describe("SettingsWriter と知らない項目 uiStyle", () => {
  it("端末版が別の項目を書いても、送る patch に uiStyle は載らず、返事で受けた全体の uiStyle が保たれる", async () => {
    const prefs = new PrefsModel();
    prefs.apply({ theme: "dracula", uiStyle: "modern" }, 1);
    const sent: Record<string, unknown>[] = [];
    let server: Record<string, unknown> = { theme: "dracula", uiStyle: "modern" };
    const writer = new SettingsWriter({
      prefs,
      conn: {
        request: async (method: string, params: { patch: Record<string, unknown> }) => {
          expect(method).toBe("prefs.set");
          sent.push(params.patch);
          server = { ...server, ...params.patch }; // サーバの項目ごとの浅いマージ
          return { prefs: server, rev: 2 };
        },
      },
      toast: () => undefined,
      setLocal: () => undefined,
    } as never);
    const done = new Promise<boolean>((resolve) => writer.setShared({ paneGaps: false }, resolve));
    expect(await done).toBe(true);
    expect(sent).toEqual([{ paneGaps: false }]);
    expect("uiStyle" in sent[0]!).toBe(false);
    expect(prefs.shared.uiStyle).toBe("modern");
    expect(prefs.shared.paneGaps).toBe(false);
    // tui 節を書いても同じ。
    writer.setTui("sidebarCols", 30);
    await new Promise((r) => setTimeout(r, 10));
    expect(prefs.shared.uiStyle).toBe("modern");
    expect(sent.every((p) => !("uiStyle" in p))).toBe(true);
  });
});
