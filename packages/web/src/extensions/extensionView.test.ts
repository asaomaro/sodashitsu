import type { ExtensionInfo } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { failedToastText, lastExitText, newlyFailed, sanitizeLogLine, scopeText, scriptDisabledNote, problemView, sanitizeText, stateMark, stateText, stateTone } from "./extensionView.js";

const info = (key: string, state: ExtensionInfo["state"], extra: Partial<ExtensionInfo> = {}): ExtensionInfo => ({
  key, id: key, scope: "user", configPath: "/x/extensions.json", allow: [], onUnresponsive: "pass", state, enabledInConfig: true, disabledByUser: false, failures: 0, displays: 0, ...extra,
});

describe("extensionView", () => {
  it("状態の文: disabled は設定で無効か画面で無効かを分ける。waiting は読めないので待っている", () => {
    expect(stateText(info("a", "running"))).toBe("動作中");
    expect(stateText(info("a", "disabled", { disabledByUser: true }))).toBe("無効（画面で無効にしました）");
    expect(stateText(info("a", "disabled", { enabledInConfig: false }))).toBe("無効（設定で無効です）");
    expect(stateText(info("a", "waiting"))).toContain("設定を読めない");
    expect(stateText(info("a", "failed"))).toContain("続けて落ちた");
  });
  it("lastExit の文", () => {
    expect(lastExitText(undefined)).toBe("");
    expect(lastExitText({ code: 1, signal: null, at: "x", reason: "crashed" })).toBe("前回: 異常終了しました（終了コード 1）");
    expect(lastExitText({ code: null, signal: "SIGKILL", at: "x", reason: "not_reading" })).toContain("合図 SIGKILL");
  });
  it("状態の調子と印: 失敗は error・待ちは warn・ほかは無し。印は色に頼らない", () => {
    expect(stateTone("failed")).toBe("error");
    expect(stateTone("backoff")).toBe("warn");
    expect(stateTone("waiting")).toBe("warn");
    for (const st of ["running", "disabled", "pending", "denied", "exited", "over_limit"] as const) expect(stateTone(st)).toBeNull();
    expect(stateMark("failed")).not.toBe("");
    expect(stateMark("backoff")).not.toBe("");
    expect(stateMark("waiting")).not.toBe("");
    expect(new Set([stateMark("failed"), stateMark("backoff"), stateMark("waiting")]).size).toBe(3);
    expect(stateMark("running")).toBe("");
  });
  it("設定の問題: 文の頭のファイル名がパスの末尾と同じなら重ねない。パス・文を無害化する", () => {
    expect(problemView({ path: "/home/u/.config/sodashitsu/extensions.json", problem: "extensions.json: JSON として読めません" })).toEqual({
      path: "/home/u/.config/sodashitsu/extensions.json",
      text: "JSON として読めません",
    });
    expect(problemView({ path: "/p/extensions.json", problem: "別の文: x" }).text).toBe("別の文: x");
    expect(problemView({ path: "C:\\x\\extensions.json", problem: "extensions.json: y" }).text).toBe("y");
    expect(problemView({ path: "/a\u202eb\u200bc", problem: "p\u2028q\u2029r\ufeffs" })).toEqual({ path: "/a?b?c", text: "p?q?r?s" });
  });
  it("newlyFailed: 前が無ければ出さない／前に failed でなかったものだけ／すでに failed は出し直さない", () => {
    const next = [info("a", "failed"), info("b", "failed"), info("c", "running")];
    expect(newlyFailed(null, next)).toEqual([]);
    expect(newlyFailed([info("a", "running"), info("b", "failed")], next).map((e) => e.key)).toEqual(["a"]);
    expect(newlyFailed([], next).map((e) => e.key)).toEqual(["a", "b"]);
    expect(failedToastText("hello")).toBe("拡張『hello』が続けて落ちたので止めました（設定 › 拡張）");
  });
  it("script-html の注意: allow に持ち、設定が無効のときだけ", () => {
    const e = info("a", "running", { allow: ["script-html"] });
    expect(scriptDisabledNote(e, false)).toBe("サーバの設定『スクリプトが動く表示』が無効なので、スクリプトの面は出ません");
    expect(scriptDisabledNote(e, true)).toBeNull();
    expect(scriptDisabledNote(info("b", "running"), false)).toBeNull();
  });
  it("種類の印", () => {
    expect(scopeText(info("a", "running"))).toBe("利用者");
    expect(scopeText(info("a", "running", { scope: "project", root: "/r" }))).toBe("プロジェクト /r");
  });
  it("ログの無害化: 制御文字・書字方向の文字を ? に替える（タブは残す）", () => {
    expect(sanitizeLogLine("a\u001b[31mb\u202ec\u2066d\te")).toBe("a?[31mb?c?d\te");
    expect(sanitizeLogLine("<b>x</b>")).toBe("<b>x</b>");
    // ゼロ幅の文字・BOM・行区切りも
    expect(sanitizeText("a\u200bb\u200cc\u200dd\u2060e\ufefff\u2028g\u2029h")).toBe("a?b?c?d?e?f?g?h");
    expect(sanitizeText("日本語 ok\t")).toBe("日本語 ok\t");
  });
});
