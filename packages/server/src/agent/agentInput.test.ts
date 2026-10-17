import { describe, expect, it } from "vitest";
import { AGENT_PROMPT_SUBMIT_DELAY_MS, encodeKey, parseKey, pastePayload } from "./agentInput.js";

const NORMAL = { bracketedPaste: false, applicationCursorKeys: false };
const APP_CURSOR = { bracketedPaste: false, applicationCursorKeys: true };

function enc(name: string, modes = NORMAL): string | null {
  const spec = parseKey(name);
  return spec === null ? null : encodeKey(spec, modes);
}

describe("pastePayload（herdr の encode_api_text）", () => {
  it("bracketed paste が有効なら ESC[200~ と ESC[201~ で包み、無効なら包まない", () => {
    expect(pastePayload("a\nb", true)).toBe("\u001b[200~a\nb\u001b[201~");
    expect(pastePayload("a\nb", false)).toBe("a\nb");
  });

  it("包むときは本文の中の貼り付けの印（ESC[200~・ESC[201~）を取り除く（印の後ろが打鍵として届かないように）", () => {
    expect(pastePayload("a\u001b[201~\rrm x\u001b[200~b", true)).toBe(
      "\u001b[200~a\rrm xb\u001b[201~",
    );
    expect(pastePayload("x\u001b[201~y", false)).toBe("x\u001b[201~y");
    // 取り除いた後に印が組み上がる入れ子も残さない。
    expect(pastePayload("a\u001b[20\u001b[201~1~\rrm x", true)).toBe(
      "\u001b[200~a\rrm x\u001b[201~",
    );
    expect(pastePayload("\u001b[2\u001b[20\u001b[200~0~01~z", true)).toBe(
      "\u001b[200~z\u001b[201~",
    );
  });

  it("貼り付け処理の完了を待つため、Enter まで1000ms空ける", () => {
    expect(AGENT_PROMPT_SUBMIT_DELAY_MS).toBe(1000);
  });
});

describe("parseKey / encodeKey（xterm の既定の符号化）", () => {
  it.each([
    ["enter", "\r"],
    ["return", "\r"],
    ["Enter", "\r"],
    ["esc", "\u001b"],
    ["escape", "\u001b"],
    ["tab", "\t"],
    ["shift+tab", "\u001b[Z"],
    ["backspace", "\u007f"],
    ["bs", "\u007f"],
    ["space", " "],
    ["up", "\u001b[A"],
    ["down", "\u001b[B"],
    ["right", "\u001b[C"],
    ["left", "\u001b[D"],
    ["shift+up", "\u001b[1;2A"],
    ["ctrl+left", "\u001b[1;5D"],
    ["alt+shift+right", "\u001b[1;4C"],
    ["f1", "\u001bOP"],
    ["f4", "\u001bOS"],
    ["f5", "\u001b[15~"],
    ["f6", "\u001b[17~"],
    ["f7", "\u001b[18~"],
    ["f8", "\u001b[19~"],
    ["f9", "\u001b[20~"],
    ["f10", "\u001b[21~"],
    ["f11", "\u001b[23~"],
    ["f12", "\u001b[24~"],
    ["ctrl+f5", "\u001b[15;5~"],
    ["shift+f1", "\u001b[1;2P"],
    ["ctrl+c", "\u0003"],
    ["C-c", "\u0003"],
    ["c-c", "\u0003"],
    ["control+a", "\u0001"],
    ["ctrl+shift+c", "\u0003"],
    ["ctrl+A", "\u0001"],
    ["ctrl+[", "\u001b"],
    ["ctrl+space", "\u0000"],
    ["ctrl+?", "\u007f"],
    ["alt+x", "\u001bx"],
    ["meta+enter", "\u001b\r"],
    ["alt+backspace", "\u001b\u007f"],
    ["alt+esc", "\u001b\u001b"],
    ["alt+tab", "\u001b\t"],
    ["alt+space", "\u001b "],
    ["ctrl+alt+a", "\u001b\u0001"],
    ["ctrl+@", "\u0000"],
    ["ctrl+backslash", "\u001c"],
    ["ctrl+]", "\u001d"],
    ["ctrl+^", "\u001e"],
    ["ctrl+_", "\u001f"],
    ["Ctrl+C", "\u0003"],
    ["CTRL+x", "\u0018"],
    ["F5", "\u001b[15~"],
    ["option+x", "\u001bx"],
    ["Alt+x", "\u001bx"],
    ["comma", ","],
    ["period", "."],
    ["slash", "/"],
    ["backslash", "\\"],
    ["quote", "'"],
    ["double_quote", '"'],
    ["semicolon", ";"],
    ["colon", ":"],
    ["percent", "%"],
    ["ampersand", "&"],
    ["backtick", "`"],
    ["a", "a"],
    ["A", "A"],
    ["shift+a", "A"],
    ["y", "y"],
    ["1", "1"],
    ["minus", "-"],
    ["plus", "+"],
    ["+", "+"],
    ["double-quote", '"'],
    ["shift+minus", "-"],
    ["shift+space", " "],
  ])("%s", (name, bytes) => {
    expect(enc(name)).toBe(bytes);
  });

  it("矢印はアプリケーションカーソルモードでは ESC O で送る（修飾つきは CSI のまま）", () => {
    expect(enc("up", APP_CURSOR)).toBe("\u001bOA");
    expect(enc("left", APP_CURSOR)).toBe("\u001bOD");
    expect(enc("shift+up", APP_CURSOR)).toBe("\u001b[1;2A");
  });

  it.each([
    "",
    "foo",
    "ctrl",
    "ctrl+",
    "ctrl++",
    "+a",
    "a+",
    "super+a",
    "cmd+c",
    "ctrl+a+b",
    "f13",
    "f0",
    "home",
    "C-x",
  ])("不明なキー名は null: %j", (name) => {
    expect(parseKey(name)).toBeNull();
  });

  it.each([
    "ctrl+enter",
    "shift+enter",
    "ctrl+esc",
    "ctrl+tab",
    "alt+shift+tab",
    "ctrl+backspace",
    "ctrl+1",
    "ctrl+minus",
  ])("符号化できない組み合わせは null: %s", (name) => {
    expect(parseKey(name)).not.toBeNull();
    expect(enc(name)).toBeNull();
    expect(enc(name, APP_CURSOR)).toBeNull();
  });
});
