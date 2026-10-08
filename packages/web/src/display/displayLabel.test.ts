import { describe, expect, it } from "vitest";
import { displayBandLabel, displayLabel, scriptEnabledNotice, scriptEnabledNoticeFor } from "./displayLabel.js";

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
