import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageAddon } from "./imageAddon.js";
import { installQueryFilter } from "./QueryFilter.js";

/** 1×1 の PNG（中身は addon が先頭のバイトで形式と大きさを読むだけ。復号は下の createImageBitmap の差し替えが受ける）。 */
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_BYTES = atob(PNG_1x1).length;

/** サーバの `KittyGraphicsTranslator` がブラウザへ送る形（`packages/server/src/terminal/KittyGraphics.ts` の `display`）。 */
function serverImage(cols: number, rows: number, cursorBack: boolean): string {
  const move = cursorBack ? (rows > 1 ? `\x1b[${rows - 1}A` : "") : `\x1b[${cols}C`;
  return `\x1b]1337;File=inline=1;size=${PNG_BYTES};width=${cols};height=${rows};preserveAspectRatio=0:${PNG_1x1}\x07${move}`;
}

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

/**
 * 20260926-kitty-graphics の AC7 のブラウザ側。実物の xterm.js と addon 0.9.0 に、サーバが作る画像の指示を書き、画像の後のカーソルが
 * サーバのミラーと同じ位置（`packages/server/src/terminal/TerminalHost.test.ts` の CPR `6;6R`＝0 始まりで 5 行 5 列）になることを確かめる。
 * happy-dom には画像の復号が無いので、`createImageBitmap` だけを「求められた大きさの画像」を返すものに差し替える（描画は確かめない）。
 */
describe("画像の後のカーソル位置（ブラウザ側。AC7）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeTerm(): Terminal {
    vi.stubGlobal(
      "createImageBitmap",
      async (_blob: Blob, opts?: { resizeWidth?: number; resizeHeight?: number }) => ({
        width: opts?.resizeWidth ?? 1,
        height: opts?.resizeHeight ?? 1,
        close: () => undefined,
      }),
    );
    const term = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    term.open(document.createElement("div"));
    term.loadAddon(createImageAddon());
    installQueryFilter(term);
    return term;
  }

  it("C=0: 画像（2×2 セル）の最後の行・右隣の列（ミラーの IND＋CUF と同じ）", async () => {
    const term = makeTerm();
    await write(term, `\x1b[5;3HA${serverImage(2, 2, false)}`);
    expect([term.buffer.active.cursorY, term.buffer.active.cursorX]).toEqual([5, 5]);
    term.dispose();
  });

  it("C=1: 元の位置に戻る。LNM が有効でも列は画像の左端から数える", async () => {
    const term = makeTerm();
    await write(term, `\x1b[5;3HA${serverImage(2, 3, true)}`);
    expect([term.buffer.active.cursorY, term.buffer.active.cursorX]).toEqual([4, 3]);
    await write(term, `\x1b[20h\x1b[10;7HB${serverImage(3, 2, false)}`);
    expect([term.buffer.active.cursorY, term.buffer.active.cursorX]).toEqual([10, 10]);
    term.dispose();
  });

  it("画面の下端では画像の行数ぶんスクロールし、ミラーの IND と同じ行に止まる", async () => {
    const term = makeTerm();
    await write(term, `\x1b[24;1H${serverImage(2, 3, false)}`);
    expect([term.buffer.active.cursorY, term.buffer.active.cursorX]).toEqual([23, 2]);
    expect(term.buffer.active.baseY).toBe(2);
    term.dispose();
  });
});
