import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { installQueryFilter, isColorQuery, isPaletteQuery } from "./QueryFilter.js";

function makeTerm(): { term: Terminal; responses: string[] } {
  const term = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
  term.open(document.createElement("div"));
  const responses: string[] = [];
  term.onData((data) => responses.push(data));
  return { term, responses };
}

/**
 * xterm.js の問い合わせへの応答は `write()` のコールバックより後（マクロタスク）で届く（実測で確認。
 * マイクロタスクを 2 回流すだけでは間に合わない）。応答が「出なかった」ことを確かめるテストは、
 * この待ちを挟まないと、実際には握りつぶせていなくても「まだ出ていないだけ」で誤って通ってしまう。
 */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("isColorQuery / isPaletteQuery（Mirror.ts の判定と対になる純関数）", () => {
  it("OSC 10/11/12: '?' だけが問い合わせ", () => {
    expect(isColorQuery("?")).toBe(true);
    expect(isColorQuery("rgb:ff/ff/ff")).toBe(false);
  });

  it("OSC 4: 1 組でも '?' を含めば問い合わせ", () => {
    expect(isPaletteQuery("5;?")).toBe(true);
    expect(isPaletteQuery("5;?;10;?")).toBe(true);
    expect(isPaletteQuery("5;rgb:00/00/00")).toBe(false);
  });
});

describe("installQueryFilter（実物の @xterm/xterm）", () => {
  it("DA1・DA2・DSR5/CPR・DECRQM・XTVERSION・DECRQSS への応答を出させない", async () => {
    const { term, responses } = makeTerm();
    installQueryFilter(term);
    term.write("\x1b[c"); // DA1
    term.write("\x1b[>c"); // DA2
    term.write("\x1b[n"); // DSR/CPR の一般形（DSR 5 等）
    term.write("\x1b[?1$p"); // DECRQM
    term.write("\x1b[>q"); // XTVERSION
    term.write("\x1bP$q$}\x1b\\"); // DECRQSS（ダミーの問い合わせ本体）
    await tick();
    expect(responses).toEqual([]);
    term.dispose();
  });

  it("素の Terminal（filter 無し）は DA1 に応答する（filter が無ければ拾ってしまうことの確認）", async () => {
    const { term, responses } = makeTerm();
    term.write("\x1b[c");
    await tick();
    expect(responses.length).toBeGreaterThan(0);
    term.dispose();
  });

  it("色の問い合わせ（OSC 10/11/12;?・OSC 4;n;?）への応答を出させない", async () => {
    const { term, responses } = makeTerm();
    installQueryFilter(term);
    term.write("\x1b]10;?\x07");
    term.write("\x1b]11;?\x07");
    term.write("\x1b]12;?\x07");
    term.write("\x1b]4;5;?\x07");
    await tick();
    expect(responses).toEqual([]);
    term.dispose();
  });

  it("XTSMGRAPHICS（CSI ? Pi ; Pa ; Pv S）を、先に登録された応答者（画像の addon 相当）へ届かせない（20260926-kitty-graphics）", async () => {
    const { term, responses } = makeTerm();
    const seen: unknown[] = [];
    term.parser.registerCsiHandler({ prefix: "?", final: "S" }, (params) => {
      seen.push(params);
      term.input("\x1b[?1;0;256S", false); // 応答を出す代役（addon の `_report` と同じく onData へ出る）
      return true;
    });
    installQueryFilter(term);
    term.write("\x1b[?1;1;0S\x1b[?2;1;0S\x1b[?1;3;4096S"); // 読み取り 2 つと設定（Pa=3）
    await tick();
    expect(seen).toEqual([]);
    expect(responses).toEqual([]);
    term.dispose();
  });
});
