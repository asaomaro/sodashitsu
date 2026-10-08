import { describe, expect, it } from "vitest";
import { displayBandLabel, displayLabel, displayLabelPrefix, scriptEnabledNotice, scriptEnabledNoticeFor } from "./displayLabel.js";

describe("displayLabel", () => {
  it("固定の文は面の名前だけで決まる。知らない項目（source など）があっても壊れない", () => {
    expect(displayLabel({ name: "main" })).toBe("pane のプログラムの表示（隔離）· main");
    const withExtra = { name: "main", title: "<b>x</b>", source: "ext-a", other: 1 } as unknown as Parameters<typeof displayLabel>[0];
    expect(displayLabel(withExtra)).toBe("pane のプログラムの表示（隔離）· main");
  });
  it("帯の印は題を添える（題は文字のまま）", () => {
    expect(displayBandLabel({ name: "b", title: "<i>t</i>" })).toBe("pane のプログラムの表示（隔離）· b: <i>t</i>");
  });
});

describe("scriptEnabledNotice", () => {
  it("無効 → 有効に変わったときだけ出す。自分の画面で変えた（手元がもう有効）・有効のままの変更・無効への変更では出さない", () => {
    expect(scriptEnabledNoticeFor({ prefs: { displayScriptEnabled: true } }, false)).toContain("有効になりました");
    expect(scriptEnabledNoticeFor({ prefs: { displayScriptEnabled: true } }, true)).toBeNull();
    expect(scriptEnabledNoticeFor({ prefs: { displayScriptEnabled: false } }, false)).toBeNull();
    expect(scriptEnabledNoticeFor({ prefs: {} }, false)).toBeNull();
    expect(scriptEnabledNoticeFor({ prefs: { displayScriptEnabled: "true" } }, false)).toBeNull();
  });
  it("変えた接続の種類を添える（ほかの画面／sodactl・外部の接続）。分からなければ添えない", () => {
    expect(scriptEnabledNotice("external")).toContain("sodactl");
    expect(scriptEnabledNotice("desktop")).toContain("ほかの画面");
    expect(scriptEnabledNotice("mobile")).toContain("ほかの画面");
    expect(scriptEnabledNotice(undefined)).not.toContain("変えました");
  });
});

describe("displayLabel: 拡張が出した面（source）", () => {
  it("形の合う source（利用者・プロジェクト）で文が替わる", () => {
    expect(displayLabel({ name: "main", source: { type: "extension", id: "hello", scope: "user" } })).toBe("拡張『hello』の表示（利用者・隔離）· main");
    expect(displayLabel({ name: "main", source: { type: "extension", id: "a_b-1", scope: "project" } })).toBe("拡張『a_b-1』の表示（プロジェクト・隔離）· main");
    expect(displayBandLabel({ name: "b", title: "t", source: { type: "extension", id: "hello", scope: "user" } })).toBe("拡張『hello』の表示（利用者・隔離）· b: t");
    expect(displayLabelPrefix({ source: { type: "extension", id: "x", scope: "user" } })).toBe("拡張『x』の表示（利用者・隔離）");
  });
  it("形の合わない source は、今までの文（文字列・id が規則外・scope が知らない値・null・type が違う・空）", () => {
    const old = "pane のプログラムの表示（隔離）· main";
    for (const source of ["ext-a", { type: "extension", id: "<b>x</b>", scope: "user" }, { type: "extension", id: "A", scope: "user" }, { type: "extension", id: "ok", scope: "global" }, { type: "extension", id: "ok" }, { type: "plugin", id: "ok", scope: "user" }, { type: "extension", id: 1, scope: "user" }, null, undefined, 1, []]) {
      expect(displayLabel({ name: "main", source }), JSON.stringify(source)).toBe(old);
    }
    expect(displayLabelPrefix({})).toBe("pane のプログラムの表示（隔離）");
  });
  it("id に HTML を書いても、文字のまま出る（そもそも id の規則に合わず、今までの文になる）", () => {
    expect(displayLabel({ name: "m", source: { type: "extension", id: "<img src=x>", scope: "user" } })).not.toContain("<img");
  });
});
