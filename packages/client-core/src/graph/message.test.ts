import { describe, expect, it } from "vitest";
import { RUN_TEXT_PREVIEW_CHARS } from "./defaults.js";
import {
  approvalNotice,
  buildTriggerText,
  outputText,
  runTextPreview,
  stripControl,
  supervisorNotice,
  type GraphPaneInfo,
} from "./message.js";

// 20260927-agent-graph の T2（message）：文面の組み立て・{output}・制御文字の除去。
describe("stripControl", () => {
  it("ANSI の色・カーソル移動・OSC・DCS・2 バイトの ESC 列を落とす", () => {
    expect(stripControl("\u001B[31mred\u001B[0m \u001B[2;5H!")).toBe("red !");
    expect(stripControl("a\u001B]0;title\u0007b\u001B]8;;http://x\u001B\\c")).toBe("abc");
    expect(stripControl("a\u001BPq#0;2;0;0;0\u001B\\b")).toBe("ab");
    expect(stripControl("a\u001B7b\u001B(Bc")).toBe("abc");
  });

  it("C0（改行・タブ以外）・DEL・C1 を落とし、CRLF は LF に", () => {
    expect(stripControl("a\u0000b\u0007c\u0008d\u007Fe\u0084f\u0085g")).toBe("abcdefg");
    expect(stripControl("a\tb\r\nc\rd")).toBe("a\tb\ncd");
  });

  it("未終端の OSC は始まりの ESC ] だけ落ちる（残りは文字として残る）", () => {
    expect(stripControl("x\u001B]0;never ends")).toBe("x0;never ends");
  });

  it("日本語・絵文字はそのまま", () => {
    expect(stripControl("完了しました 🎉")).toBe("完了しました 🎉");
  });
  it("双方向の上書き（U+202A-202E・U+2066-2069）は落とす。LRM・RLM はそのまま（g05 点検）", () => {
    expect(stripControl("a\u202Eb\u202Ac\u2066d\u2069e\u200Ef")).toBe("abcde\u200Ef");
  });
});

describe("8 ビットの C1 の列（g01 点検）", () => {
  it("CSI（U+009B）は引数ごと、OSC（U+009D）は ST/BEL まで、DCS（U+0090）は ST まで落とす", () => {
    expect(stripControl("a\u009B31mb\u009B0mc")).toBe("abc");
    expect(stripControl("a\u009D0;title\u0007b\u009D8;;http://x\u009Cc")).toBe("abc");
    expect(stripControl("a\u009D0;t\u001B\\b")).toBe("ab");
    expect(stripControl("a\u0090q#0\u009Cb")).toBe("ab");
  });
});

describe("outputText", () => {
  it("行の右端の空白と前後の空行を除いて繋ぐ", () => {
    expect(outputText(["", "  ", "one  ", "\u001B[1mtwo\u001B[0m", "", "three", "", ""])).toBe(
      "one\ntwo\n\nthree",
    );
    expect(outputText([])).toBe("");
  });
});

describe("buildTriggerText", () => {
  it("{output} の位置（すべて）へ差し込む", () => {
    expect(buildTriggerText("前\n{output}\n後 {output}", "結果")).toBe("前\n結果\n後 結果");
  });

  it("{output} が無ければ末尾に空行を挟んで足す。文面が空なら結果だけ", () => {
    expect(buildTriggerText("見て", "結果")).toBe("見て\n\n結果");
    expect(buildTriggerText("  ", "結果")).toBe("結果");
  });

  it('画面が空（""）で {output} が無ければ、末尾に空行を足さない', () => {
    expect(buildTriggerText("見て", "")).toBe("見て");
  });

  it("受け渡さない（null）なら {output} は空、無ければ文面そのまま", () => {
    expect(buildTriggerText("a{output}b", null)).toBe("ab");
    expect(buildTriggerText("見て", null)).toBe("見て");
  });

  it("結果の中の $ や {output} を置換の記法として解釈しない", () => {
    expect(buildTriggerText("<{output}>", "$& $1 {output}")).toBe("<$& $1 {output}>");
  });
});

const impl: GraphPaneInfo = { name: "impl", paneId: "p3", kind: "claude", machine: null };
const reviewer: GraphPaneInfo = { name: "reviewer", paneId: "p7", kind: "codex", machine: "box" };

describe("supervisorNotice", () => {
  it("配下の呼び名・pane・種類・場所と、sodactl の使い方", () => {
    const text = supervisorNotice([impl, reviewer]);
    expect(text).toContain(
      "あなたは Sodashitsu の監督役です。配下: impl（pane p3・claude・手元）, reviewer（pane p7・codex・マシン box）。",
    );
    expect(text).toContain("`sodactl agent prompt|wait|read|send-keys <pane>`");
    expect(text).toContain("--machine");
    expect(text).toContain("`sodactl skill`");
  });

  it("エージェントが検出されていない配下・配下がいない", () => {
    expect(supervisorNotice([{ ...impl, kind: null }])).toContain(
      "impl（pane p3・エージェント未検出・手元）",
    );
    expect(supervisorNotice([])).toContain("今は配下がいません");
  });
});

describe("approvalNotice", () => {
  it("delegate は send-keys で答える指示（別のマシンは --machine）", () => {
    const text = approvalNotice(impl, "Allow? (y/n)", { mode: "delegate", lines: 40 });
    expect(text).toContain("配下 impl（p3）が承認待ちです。画面の末尾（40 行）:\n\nAllow? (y/n)");
    expect(text).toContain("`sodactl agent send-keys p3 <キー>` で答えてください");
    expect(approvalNotice(reviewer, "?", { mode: "delegate", lines: 5 })).toContain(
      "`sodactl --machine box agent send-keys p7 <キー>`",
    );
  });

  it("notify は返答しないよう伝える", () => {
    const text = approvalNotice(impl, "Allow?", { mode: "notify", lines: 40 });
    expect(text).toContain("返答は利用者が行います");
    expect(text).not.toContain("send-keys");
  });
});

describe("runTextPreview", () => {
  it(`先頭 ${RUN_TEXT_PREVIEW_CHARS} 文字（サロゲートを割らない）`, () => {
    expect(runTextPreview("短い")).toBe("短い");
    const long = "🎉".repeat(RUN_TEXT_PREVIEW_CHARS + 5);
    expect(runTextPreview(long)).toBe(`${"🎉".repeat(RUN_TEXT_PREVIEW_CHARS)}…`);
    expect(runTextPreview("a".repeat(RUN_TEXT_PREVIEW_CHARS))).toBe(
      "a".repeat(RUN_TEXT_PREVIEW_CHARS),
    );
  });
});
