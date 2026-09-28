import { DEFAULT_THEME, TERMINAL_PALETTES } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { XtermMirror, parseOsc7, parseOsc9Cwd } from "./Mirror.js";
import { sanitizeHistoryAnsi } from "./historyAnsi.js";

function writeAndWait(mirror: XtermMirror, data: string): Promise<void> {
  return new Promise((resolve) => mirror.write(data, resolve));
}

describe("XtermMirror — query responses (evidence/query-response*.mjs)", () => {
  it("responds to DA1/DA2/CPR/DECRQM/DECRQSS (E1)", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[c\x1b[>c\x1b[6n\x1b[?25$p");
    expect(responses.join("")).toContain("\x1b[?1;2c"); // DA1
    // eslint-disable-next-line no-control-regex -- CPR (cursor position report) の形を確かめる
    expect(responses.join("")).toMatch(/\x1b\[\d+;\d+R/); // CPR（カーソル位置。初期位置は 1;1）
    mirror.dispose();
  });

  it("answers color queries (OSC 10/11/12) with the default theme, unlike headless alone (D17)", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b]10;?\x07\x1b]11;?\x07\x1b]12;?\x07");
    const joined = responses.join("");
    expect(joined).toContain(`\x1b]10;${expectedRgb(DEFAULT_THEME.foreground)}\x07`);
    expect(joined).toContain(`\x1b]11;${expectedRgb(DEFAULT_THEME.background)}\x07`);
    expect(joined).toContain(`\x1b]12;${expectedRgb(DEFAULT_THEME.cursor)}\x07`);
    mirror.dispose();
  });

  it("答える配色は関数で受け、問い合わせの瞬間に引き直す（20260921-theme-settings の design D6）", async () => {
    let palette = TERMINAL_PALETTES["catppuccin-latte"];
    const mirror = new XtermMirror(80, 24, 1000, () => palette);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b]11;?\x07\x1b]4;1;?\x07");
    expect(responses.join("")).toBe(
      `\x1b]11;${expectedRgb(palette.background)}\x07\x1b]4;1;${expectedRgb(palette.ansi[1]!)}\x07`,
    );
    // 権限者がテーマを変えた後の問い合わせは、新しい配色で答える（作るときに引いて保持しない）。
    palette = TERMINAL_PALETTES.nord;
    responses.length = 0;
    await writeAndWait(mirror, "\x1b]10;?\x07\x1b]12;?\x07\x1b]4;4;?\x07");
    expect(responses.join("")).toBe(
      `\x1b]10;${expectedRgb(palette.foreground)}\x07\x1b]12;${expectedRgb(palette.cursor)}\x07\x1b]4;4;${expectedRgb(palette.ansi[4]!)}\x07`,
    );
    mirror.dispose();
  });

  it("answers palette queries (OSC 4)", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b]4;1;?\x07");
    expect(responses.join("")).toBe(`\x1b]4;1;${expectedRgb(DEFAULT_THEME.ansi[1]!)}\x07`);
    mirror.dispose();
  });

  it("does not answer XTVERSION / XTWINOPS / kitty keyboard queries (unanswered, per evidence)", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[>q\x1b[18t\x1b[?u");
    expect(responses.join("")).toBe("");
    mirror.dispose();
  });
});

function expectedRgb(hex: string): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex)!;
  const [, r, g, b] = m;
  return `rgb:${r}${r}/${g}${g}/${b}${b}`;
}

describe("XtermMirror — lastLogicalLines（20260927-agent-graph の受け渡し）", () => {
  it("折り返した行は 1 行につなぎ、末尾の空行を除いてから最後の N 行を返す", async () => {
    const mirror = new XtermMirror(10, 6, 1000);
    await writeAndWait(mirror, "first\r\n" + "0123456789ABCDEFGHIJ-long\r\n" + "last\r\n\r\n");
    expect(mirror.lastLogicalLines(2)).toEqual(["0123456789ABCDEFGHIJ-long", "last"]);
    expect(mirror.lastLogicalLines(10)).toEqual(["first", "0123456789ABCDEFGHIJ-long", "last"]);
    mirror.dispose();
  });

  it("スクロールバックに押し出された行も数える。何も無ければ空", async () => {
    const mirror = new XtermMirror(10, 3, 1000);
    expect(mirror.lastLogicalLines(3)).toEqual([]);
    await writeAndWait(mirror, "a\r\nb\r\nc\r\nd\r\ne");
    expect(mirror.lastLogicalLines(4)).toEqual(["b", "c", "d", "e"]);
    mirror.dispose();
  });
});

describe("XtermMirror — serialize / bottomLines / OSC capture", () => {
  it("serializes scrollback and current screen content", async () => {
    const mirror = new XtermMirror(20, 5, 1000);
    await writeAndWait(mirror, "hello\r\nworld");
    const snap = mirror.serialize(1000);
    expect(snap.cols).toBe(20);
    expect(snap.rows).toBe(5);
    expect(snap.text).toContain("hello");
    expect(snap.text).toContain("world");
    mirror.dispose();
  });

  it("bottomLines returns the last N rendered rows", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, "line1\r\nline2\r\nline3\r\n");
    const lines = mirror.bottomLines(3);
    expect(lines.some((l) => l.includes("line3"))).toBe(true);
    mirror.dispose();
  });

  it("captures the terminal title via OSC 0/2", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, "\x1b]2;my title\x07");
    expect(mirror.title()).toBe("my title");
    mirror.dispose();
  });

  it("captures OSC 9;4 progress reports", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, "\x1b]9;4;1;42\x07");
    expect(mirror.progress()).toBe("4;1;42");
    mirror.dispose();
  });

  it("captures OSC 7 cwd hints", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, `\x1b]7;file://host/home/user/project\x07`);
    expect(mirror.cwdHint()).toBe("/home/user/project");
    mirror.dispose();
  });

  it("OSC 7 のドライブ付きパスは、サーバが Windows のときだけ Windows の形に直す", () => {
    expect(parseOsc7("file://host/C:/Users/u/My%20Work", "win32")).toBe("C:\\Users\\u\\My Work");
    expect(parseOsc7("file://host/C:", "win32")).toBe("C:\\");
    expect(parseOsc7("file://host/C:/Users/u", "linux")).toBe("/C:/Users/u");
    expect(parseOsc7("file://host/home/u", "win32")).toBe("/home/u");
  });

  // 20260928-windows-pane-cwd の D-5：Windows Terminal の場所の知らせ（OSC 9;9）も pane の場所として受ける。
  it("OSC 9;9 の場所（引用符あり・なし）を cwdHint として受ける", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, '\x1b]9;9;"/home/user/my work"\x1b\\');
    expect(mirror.cwdHint()).toBe("/home/user/my work");
    await writeAndWait(mirror, "\x1b]9;9;/srv/a#b%20c\x07");
    expect(mirror.cwdHint(), "符号化しない（% や # もそのまま）").toBe("/srv/a#b%20c");
    mirror.dispose();
  });

  it("OSC 9;9 の後の OSC 7 は今までどおり場所を上書きする", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, '\x1b]9;9;"/a"\x07');
    await writeAndWait(mirror, "\x1b]7;file://host/b\x07");
    expect(mirror.cwdHint()).toBe("/b");
    mirror.dispose();
  });

  it("ほかの OSC 9（通知・進捗）は場所を変えず、進捗も今までどおり受ける", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, '\x1b]9;9;"/keep"\x07');
    await writeAndWait(mirror, "\x1b]9;hello\x07");
    await writeAndWait(mirror, "\x1b]9;4;1;42\x07");
    await writeAndWait(mirror, "\x1b]9;9;\x07"); // 空の 9;9 も場所を消さない
    await writeAndWait(mirror, '\x1b]9;9;""\x07');
    expect(mirror.cwdHint()).toBe("/keep");
    expect(mirror.progress()).toBe("4;1;42");
    mirror.dispose();
  });

  it("OSC 9;9 の中身：両端の引用符を外し、サーバが Windows のときだけ win32.normalize で直す", () => {
    expect(parseOsc9Cwd('9;"C:\\Users\\u\\My Work"', "win32")).toBe("C:\\Users\\u\\My Work");
    expect(parseOsc9Cwd("9;C:/Users/u/", "win32")).toBe("C:\\Users\\u\\");
    expect(parseOsc9Cwd('9;"\\\\server\\share\\dir"', "win32")).toBe("\\\\server\\share\\dir");
    expect(parseOsc9Cwd('9;"C:\\a%b#c\\日本語"', "win32")).toBe("C:\\a%b#c\\日本語");
    expect(parseOsc9Cwd("9;/home/u", "linux")).toBe("/home/u");
    for (const data of ["9;", '9;""', "4;1;42", "hello", "99;x"]) {
      expect(parseOsc9Cwd(data, "win32"), data).toBeNull();
    }
  });

  it("OSC 9;9 の中身：前後の空白を落としてから引用符を外す", () => {
    expect(parseOsc9Cwd('9; "C:\\a b" ', "win32")).toBe("C:\\a b");
    expect(parseOsc9Cwd('9;  "/home/u/x y"\t', "linux")).toBe("/home/u/x y");
  });

  it("OSC 9;9 の中身：そのサーバの形の絶対パスでなければ場所にしない（相対パス・ゴミ）", () => {
    for (const data of [
      '9;"src"',
      "9;.\\x",
      "9;\\x",
      "9;C:",
      "9;C:rel",
      '9;"',
      "9;\\\\server",
      "9;/home/u",
      "9;garbage",
    ]) {
      expect(parseOsc9Cwd(data, "win32"), `win32 ${data}`).toBeNull();
    }
    for (const data of ['9;"src"', "9;./x", '9;"C:/Users/u"', "9;C:\\x", '9;"']) {
      expect(parseOsc9Cwd(data, "linux"), `linux ${data}`).toBeNull();
    }
    // UNC は受ける（既知の危険として受け入れた。parseOsc9Cwd のコメント）。/ 区切りの UNC も win32.normalize で直す。
    expect(parseOsc9Cwd("9;//server/share/d", "win32")).toBe("\\\\server\\share\\d");
  });

  it("相対パスの OSC 9;9 は、それまでの場所を変えない", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, '\x1b]9;9;"/keep"\x07');
    await writeAndWait(mirror, '\x1b]9;9;"relative/dir"\x07');
    expect(mirror.cwdHint()).toBe("/keep");
    mirror.dispose();
  });

  it("OSC 9 のハンドラは 9;9 を扱い終えたら true（壊れた中身でも）、通常の通知は false を返す", () => {
    const mirror = new XtermMirror(20, 3, 1000);
    const handle = (data: string) =>
      (mirror as unknown as { handleOsc9(d: string): boolean }).handleOsc9(data);
    expect(handle('9;"/a"')).toBe(true);
    expect(handle("9;relative")).toBe(true);
    expect(handle("4;1;42")).toBe(true);
    expect(handle("hello")).toBe(false);
    mirror.dispose();
  });

  it("resize updates cols/rows reflected in the next serialize", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    mirror.resize(40, 10);
    const snap = mirror.serialize(0);
    expect(snap.cols).toBe(40);
    expect(snap.rows).toBe(10);
    mirror.dispose();
  });
});

describe("XtermMirror — flow control", () => {
  it("pendingBytes returns to 0 and fires onDrained after a write completes", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    let drained = false;
    mirror.onDrained(() => (drained = true));
    expect(mirror.pendingBytes()).toBe(0);
    await writeAndWait(mirror, "x".repeat(1000));
    expect(mirror.pendingBytes()).toBe(0);
    expect(drained).toBe(true);
    mirror.dispose();
  });
});

// 20260924-dark-mode-report。design「振る舞いの詳細」参照。
describe("XtermMirror — appearance report (CSI ?996n / mode 2031)", () => {
  it("CSI ?996n に、appearance() が dark なら ?997;1n、light なら ?997;2n で答える", async () => {
    let appearance: "light" | "dark" = "dark";
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => appearance);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));

    await writeAndWait(mirror, "\x1b[?996n");
    expect(responses.join("")).toBe("\x1b[?997;1n");

    responses.length = 0;
    appearance = "light";
    await writeAndWait(mirror, "\x1b[?996n");
    expect(responses.join("")).toBe("\x1b[?997;2n");
    mirror.dispose();
  });

  it("appearance を渡さなければ既定（dracula=dark）で答える", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[?996n");
    expect(responses.join("")).toBe("\x1b[?997;1n");
    mirror.dispose();
  });

  it("CSI ?2031h の直後は、appearance が変わっていなければ通知しない（herdr と同じ。design「設計方針」）", async () => {
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => "dark");
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[?2031h");
    expect(responses.join("")).toBe(""); // 有効化そのものでは通知しない
    mirror.notifyAppearanceMayHaveChanged(); // 値は変わっていない（まだ dark のまま）
    expect(responses.join("")).toBe("");
    mirror.dispose();
  });

  it("CSI ?2031h を送っていれば、appearance が変わったときに notifyAppearanceMayHaveChanged で通知される", async () => {
    let appearance: "light" | "dark" = "dark";
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => appearance);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[?2031h");

    appearance = "light";
    mirror.notifyAppearanceMayHaveChanged();
    expect(responses.join("")).toBe("\x1b[?997;2n");

    // 同じ値のまま再度呼んでも、二重には通知しない。
    responses.length = 0;
    mirror.notifyAppearanceMayHaveChanged();
    expect(responses.join("")).toBe("");
    mirror.dispose();
  });

  it("CSI ?2031l を送ると、以後 appearance が変わっても通知しない", async () => {
    let appearance: "light" | "dark" = "dark";
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => appearance);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[?2031h");
    await writeAndWait(mirror, "\x1b[?2031l");

    appearance = "light";
    mirror.notifyAppearanceMayHaveChanged();
    expect(responses.join("")).toBe("");
    mirror.dispose();
  });

  it("mode 2031 を一度も有効にしていなければ、notifyAppearanceMayHaveChanged は何もしない", () => {
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => "light");
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    mirror.notifyAppearanceMayHaveChanged();
    expect(responses.join("")).toBe("");
    mirror.dispose();
  });

  it("RIS（ESC c）で継続通知の登録がリセットされる（herdr と同じ挙動。design「振る舞いの詳細」手順6）", async () => {
    let appearance: "light" | "dark" = "dark";
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => appearance);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[?2031h");
    await writeAndWait(mirror, "\x1bc"); // RIS

    appearance = "light";
    mirror.notifyAppearanceMayHaveChanged();
    expect(responses.join("")).toBe(""); // リセットされたので通知しない
    mirror.dispose();
  });

  it("CSI ?2031h が他のモードと同じ CSI に束ねられても、束ねられた側（1049＝オルタネートスクリーン）を無効化しない（review round1 must）", async () => {
    let appearance: "light" | "dark" = "dark";
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => appearance);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));

    await writeAndWait(mirror, "main-buffer-marker");
    expect(mirror.bottomLines(24).join("")).toContain("main-buffer-marker");

    // 2031（継続通知の有効化）と 1049（オルタネートスクリーン）を同じ CSI に束ねて送る。
    await writeAndWait(mirror, "\x1b[?2031;1049h");
    // 1049 が適用されていれば、画面はオルタネートバッファ（空）に切り替わっているはず。
    expect(mirror.bottomLines(24).join("")).not.toContain("main-buffer-marker");

    // 2031 も適用されているなら、継続通知が機能しているはず。
    appearance = "light";
    mirror.notifyAppearanceMayHaveChanged();
    expect(responses.join("")).toBe("\x1b[?997;2n");

    await writeAndWait(mirror, "\x1b[?1049l"); // 後始末（メインバッファへ戻す）
    mirror.dispose();
  });

  it("CSI ?2031h が他のモードの後ろに束ねられても、2031 自体が無視されない（review round1 must）", async () => {
    let appearance: "light" | "dark" = "dark";
    const mirror = new XtermMirror(80, 24, 1000, undefined, () => appearance);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));

    // 25（カーソル可視化。既存の私用モード）の後ろに 2031 を束ねて送る。
    await writeAndWait(mirror, "\x1b[?25;2031h");

    appearance = "light";
    mirror.notifyAppearanceMayHaveChanged();
    expect(responses.join("")).toBe("\x1b[?997;2n"); // 2031 が認識されていれば通知される
    mirror.dispose();
  });

  it("CSI ?996n/?2031h/?2031l 以外の私用 CSI（?25h・6n 等）には関与しない（既存の応答を壊さない）", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    // ?25h（カーソル可視化。headless が既定で処理する私用モード）と 6n（CPR。prefix 無し）は
    // 新しいハンドラの登録先（{prefix:"?", final:"h"}・{final:"n"} 無 prefix）とは別の識別子な
    // ので、素通りして既存どおり動く。
    await writeAndWait(mirror, "\x1b[?25h\x1b[6n");
    // eslint-disable-next-line no-control-regex -- CPR の形を確かめる
    expect(responses.join("")).toMatch(/\x1b\[\d+;\d+R/);
    expect(responses.join("")).not.toContain("?997"); // 明暗の応答は混ざらない
    mirror.dispose();
  });
});

describe("XtermMirror — plainText（20260926-edit-scrollback の AC3）", () => {
  it("スクロールバックへ押し出された行も含めて、全行を順に返す", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    const lines = Array.from({ length: 10 }, (_, i) => `line${String(i + 1).padStart(2, "0")}`);
    await writeAndWait(mirror, lines.join("\r\n"));
    expect(mirror.plainText()).toBe(`${lines.join("\n")}\n`);
    mirror.dispose();
  });

  it("折り返しで分かれた行は 1 行に戻す（折り返しの境目の空白も落とさない）", async () => {
    const mirror = new XtermMirror(10, 5, 1000);
    await writeAndWait(mirror, "abcdefghi jklmnopqrs tuv\r\nnext");
    expect(mirror.plainText()).toBe("abcdefghi jklmnopqrs tuv\nnext\n");
    mirror.dispose();
  });

  it("全角の文字が右端に入らず折り返したときの空きのセルは、1 行に戻すときに挟まない", async () => {
    const mirror = new XtermMirror(10, 5, 1000);
    await writeAndWait(mirror, "abcdefghiあいう");
    expect(mirror.plainText()).toBe("abcdefghiあいう\n");
    mirror.dispose();
  });

  it("色などの制御列を含まず、各行の右端の空白と末尾の空行を落とす", async () => {
    const mirror = new XtermMirror(20, 6, 1000);
    await writeAndWait(mirror, "\x1b[31mred\x1b[0m plain   \r\n\x1b[1mbold\x1b[0m");
    expect(mirror.plainText()).toBe("red plain\nbold\n");
    mirror.dispose();
  });

  it("代替画面（vim・less 等）の中でも通常バッファを読む", async () => {
    const mirror = new XtermMirror(20, 3, 1000);
    await writeAndWait(mirror, "history-1\r\nhistory-2\r\n\x1b[?1049haltscreen");
    expect(mirror.bottomLines(3).join("")).toContain("altscreen"); // 前提：代替画面に切り替わっている
    const text = mirror.plainText();
    expect(text).toContain("history-1\nhistory-2");
    expect(text).not.toContain("altscreen");
    mirror.dispose();
  });

  it("何も書いていなければ空文字", () => {
    const mirror = new XtermMirror(20, 3, 1000);
    expect(mirror.plainText()).toBe("");
    mirror.dispose();
  });
});

describe("XtermMirror — inputModes / flush（20260926-agent-prompt-send-keys）", () => {
  it("既定ではどちらのモードも無効", () => {
    const mirror = new XtermMirror(80, 24, 1000);
    expect(mirror.inputModes()).toEqual({ bracketedPaste: false, applicationCursorKeys: false });
    mirror.dispose();
  });

  it("書いた直後ではなく、flush の後にモードの切り替えが反映される（送る瞬間のモードを読むには flush を待つ）", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    mirror.write("\x1b[?2004h\x1b[?1h");
    expect(mirror.inputModes()).toEqual({ bracketedPaste: false, applicationCursorKeys: false });
    await mirror.flush();
    expect(mirror.inputModes()).toEqual({ bracketedPaste: true, applicationCursorKeys: true });
    mirror.write("\x1b[?2004l");
    await mirror.flush();
    expect(mirror.inputModes()).toEqual({ bracketedPaste: false, applicationCursorKeys: true });
    mirror.dispose();
  });

  it("大きな出力の後ろのモードの切り替えも、flush はその処理を待つ（タイマー 1 回分を待つだけでは足りない）", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const chunk = `${"x".repeat(100)}\r\n`.repeat(280);
    for (let i = 0; i < 200; i++) mirror.write(chunk);
    mirror.write("\x1b[?2004h");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mirror.inputModes().bracketedPaste).toBe(false);
    await mirror.flush();
    expect(mirror.inputModes().bracketedPaste).toBe(true);
    mirror.dispose();
  });
});

describe("XtermMirror.historyAnsi（画面履歴として保存する内容。20260926-screen-history-replay）", () => {
  it("通常バッファの最後の空でない行までを色つきで返し、モードとカーソルの位置合わせは含めない（AC1）", async () => {
    const mirror = new XtermMirror(20, 5, 1000);
    await writeAndWait(
      mirror,
      `\x1b[31mred\x1b[0m line\r\n${"x".repeat(45)}\r\n\r\nlast\r\n$ \x1b[?2004h\x1b[?1h`,
    );
    const ansi = mirror.historyAnsi();
    expect(ansi).toContain("\x1b[31mred");
    expect(ansi).not.toContain("\x1b[?"); // モード（bracketed paste・カーソルキー）を含めない
    // eslint-disable-next-line no-control-regex -- 絶対位置の指定（CUP）の形を確かめる
    expect(ansi).not.toMatch(/\x1b\[\d+;\d+H/); // 絶対位置の指定を含めない
    expect(sanitizeHistoryAnsi(ansi)).toBe(ansi); // 安全化で何も失わない（decisions D4）

    // 幅の違う端末へ流しても、行の区切りと内容は同じ（折り返しの位置だけが変わる。research F3）。
    const replay = new XtermMirror(30, 6, 1000);
    await writeAndWait(replay, ansi);
    expect(replay.plainText()).toBe(mirror.plainText());
    mirror.dispose();
    replay.dispose();
  });

  it("代替画面（vim・less 等）の中でも通常バッファの側を返す（AC1）", async () => {
    const mirror = new XtermMirror(40, 5, 1000);
    // 通常バッファの最後の行（"$ last"）を代替画面の中身より下の行に置く——読む先が代替画面なら最後の行を取りこぼす。
    await writeAndWait(mirror, "normal-history\r\n2\r\n3\r\n$ last\x1b[?1049h\x1b[Halt-screen-app");
    const ansi = mirror.historyAnsi();
    expect(ansi).toBe("normal-history\r\n2\r\n3\r\n$ last");
    expect(ansi).not.toContain("alt-screen-app");
    expect(ansi).not.toContain("\x1b[?1049h");
    mirror.dispose();
  });

  it("最後の空でない行までを返し、カーソルを戻す移動も末尾の空行も含めない（区切りの行を上書きしない）", async () => {
    // カーソルを画面の途中へ戻した状態（プロンプトの再描画等）。位置合わせを含めると、後ろに足す区切りの行が上の行を上書きする。
    const moved = new XtermMirror(20, 5, 1000);
    await writeAndWait(moved, "one\r\ntwo\r\nthree\x1b[2A\r");
    expect(moved.historyAnsi()).toBe("one\r\ntwo\r\nthree");
    moved.dispose();

    // スクロールバックがあり、末尾に空行が続く状態。
    const trailing = new XtermMirror(20, 3, 1000);
    await writeAndWait(trailing, "1\r\n2\r\n3\r\n4\r\n5\r\n\r\n\r\n");
    expect(trailing.historyAnsi()).toBe("1\r\n2\r\n3\r\n4\r\n5");
    trailing.dispose();
  });

  it("先頭の 1 行だけが空でなければ、その 1 行を返す", async () => {
    const mirror = new XtermMirror(40, 5, 1000);
    await writeAndWait(mirror, "hello");
    expect(mirror.historyAnsi()).toBe("hello");
    mirror.dispose();
  });

  it("空でない行が無ければ空", async () => {
    const mirror = new XtermMirror(40, 5, 1000);
    await writeAndWait(mirror, "\r\n\r\n");
    expect(mirror.historyAnsi()).toBe("");
    mirror.dispose();
  });

  it("安全化した内容を流しても、問い合わせに応答せず、端末のモードもタイトルも変わらない（AC8）", async () => {
    const hostile =
      "shown\x1b[c\x1b[6n\x1b]11;?\x07\x1b[?996n\x1b[?2004h\x1b[?1h\x1b]0;evil\x07\x9b6n\x1bP$qm\x1b\\\r\n";
    // 対照：安全化しなければ応答が出る（この確かめ方が意味を持つこと）。
    const raw = new XtermMirror(40, 5, 1000);
    const rawResponses: string[] = [];
    raw.onResponse((d) => rawResponses.push(d));
    await writeAndWait(raw, hostile);
    expect(rawResponses.length).toBeGreaterThan(0);
    raw.dispose();

    const mirror = new XtermMirror(40, 5, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, sanitizeHistoryAnsi(hostile));
    expect(responses).toEqual([]);
    expect(mirror.inputModes()).toEqual({ bracketedPaste: false, applicationCursorKeys: false });
    expect(mirror.title()).toBe("");
    expect(mirror.plainText()).toContain("shown");
    mirror.dispose();
  });
});

describe("XtermMirror — 画素の大きさの問い合わせ（CSI 14 t・CSI 16 t。20260926-kitty-graphics の AC8）", () => {
  it("基準のセル 9×17 で 1 回だけ答える（CSI 14 ; 2 t も同じ）。大きさを変えたら新しい大きさで答える", async () => {
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[14t");
    expect(responses).toEqual([`\x1b[4;${24 * 17};${80 * 9}t`]);
    responses.length = 0;
    await writeAndWait(mirror, "\x1b[16t\x1b[14;2t");
    expect(responses).toEqual(["\x1b[6;17;9t", `\x1b[4;${24 * 17};${80 * 9}t`]);
    responses.length = 0;
    mirror.resize(100, 30);
    await writeAndWait(mirror, "\x1b[14t");
    expect(responses).toEqual([`\x1b[4;${30 * 17};${100 * 9}t`]);
    mirror.dispose();
  });

  it("他の CSI … t（18 t 等）は今までどおり xterm.js に任せる（headless だけのときと同じ応答）", async () => {
    const xtermHeadless = (await import("@xterm/headless")).default;
    const raw = new xtermHeadless.Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    const rawResponses: string[] = [];
    raw.onData((d) => rawResponses.push(d));
    await new Promise<void>((resolve) => raw.write("\x1b[18t\x1b[t\x1b[22;0t", resolve));
    const mirror = new XtermMirror(80, 24, 1000);
    const responses: string[] = [];
    mirror.onResponse((d) => responses.push(d));
    await writeAndWait(mirror, "\x1b[18t\x1b[t\x1b[22;0t");
    expect(responses).toEqual(rawResponses);
    raw.dispose();
    mirror.dispose();
  });
});
