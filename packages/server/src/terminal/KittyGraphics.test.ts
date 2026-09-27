import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KittyGraphicsTranslator, type TranslatedSegment } from "./KittyGraphics.js";
import { encodePng, isPng } from "./png.js";

const apc = (control: string, payload?: string): string =>
  `\x1b_G${control}${payload !== undefined ? `;${payload}` : ""}\x1b\\`;
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** 18×34 画素（基準のセル 9×17 でちょうど 2×2 セル）の PNG。 */
const PNG = encodePng(new Uint8Array(18 * 34 * 4).fill(200), 18, 34, 4);
const PNG_B64 = b64(PNG);

function texts(segs: TranslatedSegment[]): string {
  return segs.map((s) => (s.kind === "text" ? s.text : "")).join("");
}
function images(segs: TranslatedSegment[]): { client: string; mirror: string }[] {
  return segs.flatMap((s) => (s.kind === "image" ? [{ client: s.client, mirror: s.mirror }] : []));
}
function responses(segs: TranslatedSegment[]): string[] {
  return segs.flatMap((s) => (s.kind === "response" ? [s.data] : []));
}
/** ブラウザ向けの画像の指示を分解する。 */
function parseClient(client: string): {
  size: number;
  width: number;
  height: number;
  png: Buffer;
  move: string;
} {
  const m =
    /^\x1b\]1337;File=inline=1;size=(\d+);width=(\d+);height=(\d+);preserveAspectRatio=0:([A-Za-z0-9+/=]*)\x07((?:\x1b\[\d+[AC])?)$/.exec(
      client,
    );
  if (!m) throw new Error(`unexpected client: ${JSON.stringify(client.slice(0, 120))}`);
  return {
    size: Number(m[1]),
    width: Number(m[2]),
    height: Number(m[3]),
    png: Buffer.from(m[4]!, "base64"),
    move: m[5]!,
  };
}
function run(input: string | string[], t = new KittyGraphicsTranslator()): TranslatedSegment[] {
  const chunks = typeof input === "string" ? [input] : input;
  return chunks.flatMap((c) => t.process(c));
}

describe("KittyGraphicsTranslator: Kitty 以外の出力（AC12）", () => {
  const sample =
    "plain \x1b[31mred\x1b[0m\r\n" +
    "\x1b]0;title\x07\x1b_Xother apc\x1b\\" +
    "\x1bP$qm\x1b\\" +
    "tail \x1b_ESC-underscore-not-G\x1b\\ end\x1b";

  it("そのまま 1 つの text で返す（他の APC・DCS・OSC・末尾の ESC を含む）", () => {
    const segs = run(sample);
    expect(segs).toEqual([{ kind: "text", text: sample }]);
  });

  it("どの位置で 2 つに割っても、連結すれば元のまま（CAN も画像も応答も出ない）", () => {
    for (let i = 0; i <= sample.length; i++) {
      const segs = run([sample.slice(0, i), sample.slice(i)]);
      expect(segs.every((s) => s.kind === "text")).toBe(true);
      expect(texts(segs)).toBe(sample);
    }
  });

  it("末尾の ESC の次が `_G` でなければ CAN を出さない", () => {
    const t = new KittyGraphicsTranslator();
    expect(texts(t.process("a\x1b"))).toBe("a\x1b");
    expect(texts(t.process("[31mb"))).toBe("[31mb");
    expect(texts(t.process("c\x1b_"))).toBe("c\x1b_");
    expect(texts(t.process("X\x1b\\"))).toBe("X\x1b\\");
  });
});

describe("KittyGraphicsTranslator: 表示（AC1・AC5・AC7・AC11）", () => {
  it("a=T,f=100 の PNG を、前後の文字列はそのまま、画像はセル数を指定した iTerm2 形式と同じだけのカーソル移動にする", () => {
    const segs = run(`before${apc("a=T,f=100", PNG_B64)}after`);
    expect(segs.map((s) => s.kind)).toEqual(["text", "image", "text"]);
    expect(texts(segs)).toBe("beforeafter");
    const [img] = images(segs);
    const c = parseClient(img!.client);
    expect(c).toMatchObject({ size: PNG.length, width: 2, height: 2, move: "\x1b[2C" });
    expect(Buffer.compare(c.png, Buffer.from(PNG))).toBe(0);
    expect(img!.mirror).toBe("\x1bD\x1b[2C");
    expect(responses(segs)).toEqual([]); // i が無ければ応答しない
  });

  it("i があれば OK を返し、q=1 なら返さない", () => {
    expect(responses(run(apc("a=T,f=100,i=7", PNG_B64)))).toEqual(["\x1b_Gi=7;OK\x1b\\"]);
    expect(responses(run(apc("a=T,f=100,i=7,q=1", PNG_B64)))).toEqual([]);
  });

  it("m=1 の分割送信を 1 枚の画像にまとめる（途中の APC は出力に何も出さない）", () => {
    const parts = [PNG_B64.slice(0, 64), PNG_B64.slice(64, 128), PNG_B64.slice(128)];
    const input =
      apc("a=T,f=100,i=3,m=1", parts[0]) + "x" + apc("m=1", parts[1]) + apc("m=0", parts[2]);
    const segs = run(input);
    expect(segs.map((s) => s.kind)).toEqual(["text", "image", "response"]);
    expect(texts(segs)).toBe("x");
    expect(parseClient(images(segs)[0]!.client).png.equals(Buffer.from(PNG))).toBe(true);
    expect(responses(segs)).toEqual(["\x1b_Gi=3;OK\x1b\\"]);
  });

  it("APC がどの位置で割れて届いても、同じ画像と文字列になる（割れた `ESC`/`ESC _` の続きは CAN で打ち消す。decisions D7）", () => {
    const input =
      "ab" + apc("a=T,f=100,i=1,m=1", PNG_B64.slice(0, 40)) + apc("m=0", PNG_B64.slice(40)) + "cd";
    const whole = run(input);
    const starts = [...input.matchAll(/\x1b_G/g)].map((m) => m.index);
    expect(starts).toHaveLength(2);
    for (let i = 1; i < input.length; i++) {
      const segs = run([input.slice(0, i), input.slice(i)]);
      expect(images(segs)).toEqual(images(whole));
      expect(responses(segs)).toEqual(responses(whole));
      // 割れ目が APC の開始（ESC | _G、ESC _ | G）なら、流した ESC / ESC _ の後に CAN が 1 つ来る。
      const start = starts.find((s) => i === s + 1 || i === s + 2);
      const expected = start === undefined ? "abcd" : `ab${input.slice(start, i)}\x18cd`;
      expect(texts(segs)).toBe(expected);
    }
  });

  it("3 つに割れた `ESC` `_` `G` でも読む", () => {
    const t = new KittyGraphicsTranslator();
    const segs = [
      ...t.process("a\x1b"),
      ...t.process("_"),
      ...t.process(`G${apc("a=T,f=100", PNG_B64).slice(3)}`),
    ];
    expect(texts(segs)).toBe("a\x1b_\x18");
    expect(images(segs)).toHaveLength(1);
  });

  it("セル数: c と r・c だけ・r だけ・どちらも無し（基準のセル 9×17。0 は指定なし）（AC5）", () => {
    const cells = (control: string): [number, number] => {
      const c = parseClient(images(run(apc(`a=T,f=100,${control}`, PNG_B64)))[0]!.client);
      return [c.width, c.height];
    };
    expect(cells("c=5,r=3")).toEqual([5, 3]);
    expect(cells("c=4")).toEqual([4, 4]); // ceil(4*9*34 / (18*17)) = 4
    expect(cells("r=1")).toEqual([1, 1]); // ceil(1*17*18 / (34*9)) = 1
    expect(cells("r=3")).toEqual([3, 3]); // ceil(3*17*18/(34*9)) = 3
    expect(cells("c=0,r=0")).toEqual([2, 2]);
    const wide = encodePng(new Uint8Array(100 * 10 * 3), 100, 10, 3);
    const c = parseClient(images(run(apc("a=T,f=100", b64(wide))))[0]!.client);
    expect([c.width, c.height]).toEqual([12, 1]); // ceil(100/9), ceil(10/17)
    const wideCells = (control: string): [number, number] => {
      const p = parseClient(images(run(apc(`a=T,f=100,${control}`, b64(wide))))[0]!.client);
      return [p.width, p.height];
    };
    expect(wideCells("c=20")).toEqual([20, 2]); // ceil(20*9*10 / (100*17)) = ceil(1.06) = 2
    expect(wideCells("r=2")).toEqual([38, 2]); // ceil(2*17*100 / (10*9)) = ceil(37.8) = 38
  });

  it("C=1 はカーソルを元の行へ戻す（1 行なら動かさない）（AC5・AC7）", () => {
    const [a] = images(run(apc("a=T,f=100,C=1,r=3,c=2", PNG_B64)));
    expect(parseClient(a!.client).move).toBe("\x1b[2A");
    expect(a!.mirror).toBe("\x1bD\x1bD\x1b[2A");
    const [b] = images(run(apc("a=T,f=100,C=1,r=1,c=2", PNG_B64)));
    expect(parseClient(b!.client).move).toBe("");
    expect(b!.mirror).toBe("");
  });

  it("ブラウザ向けの指示は数値とサーバが作った base64 だけ（AC11）", () => {
    const [img] = images(run(apc("a=T,f=100,c=3,r=2", PNG_B64)));
    expect(img!.client).toMatch(
      /^\x1b\]1337;File=inline=1;size=\d+;width=\d+;height=\d+;preserveAspectRatio=0:[A-Za-z0-9+/=]+\x07\x1b\[\d+C$/,
    );
  });
});

describe("KittyGraphicsTranslator: 生の画素（AC2）", () => {
  const rgba = Uint8Array.from({ length: 2 * 3 * 4 }, (_, i) => i);
  const rgb = Uint8Array.from({ length: 2 * 3 * 3 }, (_, i) => 100 + i);

  it("f=32・f=24 を PNG にして表示する", () => {
    for (const [f, data, ch] of [
      ["32", rgba, 4],
      ["24", rgb, 3],
    ] as const) {
      const [img] = images(run(apc(`a=T,f=${f},s=2,v=3`, b64(data))));
      const c = parseClient(img!.client);
      expect(isPng(c.png)).toBe(true);
      expect(Buffer.from(c.png).equals(Buffer.from(encodePng(data, 2, 3, ch)))).toBe(true);
      expect([c.width, c.height]).toEqual([1, 1]);
    }
  });

  it("o=z は展開してから PNG にする", () => {
    const [img] = images(run(apc("a=T,f=32,s=2,v=3,o=z", b64(deflateSync(rgba)))));
    expect(
      Buffer.from(parseClient(img!.client).png).equals(Buffer.from(encodePng(rgba, 2, 3, 4))),
    ).toBe(true);
  });

  it("f の既定は 32", () => {
    expect(images(run(apc("a=T,s=2,v=3", b64(rgba))))).toHaveLength(1);
  });

  it("s・v が無い・0・画素が足りない・展開できないものはエラー", () => {
    expect(responses(run(apc("a=T,f=32,i=1", b64(rgba))))).toEqual([
      "\x1b_Gi=1;EINVAL:width and height required for raw pixel data\x1b\\",
    ]);
    expect(responses(run(apc("a=T,f=32,s=0,v=3,i=1", b64(rgba))))).toEqual([
      "\x1b_Gi=1;EINVAL:width and height required for raw pixel data\x1b\\",
    ]);
    expect(responses(run(apc("a=T,f=32,s=3,v=3,i=1", b64(rgba))))).toEqual([
      "\x1b_Gi=1;EINVAL:insufficient pixel data\x1b\\",
    ]);
    expect(responses(run(apc("a=T,f=32,s=2,v=3,o=z,i=1", b64(rgba))))).toEqual([
      "\x1b_Gi=1;EINVAL:decompression failed\x1b\\",
    ]);
    expect(responses(run(apc("a=T,f=32,s=2,v=3,o=x,i=1", b64(rgba))))).toEqual([
      "\x1b_Gi=1;EINVAL:unsupported compression\x1b\\",
    ]);
  });
});

describe("KittyGraphicsTranslator: 問い合わせと応答（AC3）", () => {
  it("a=q は検査だけして OK（表示も保存もしない）", () => {
    const t = new KittyGraphicsTranslator();
    const segs = run(apc("a=q,i=31,s=1,v=1,t=d,f=24", "AAAA"), t);
    expect(segs).toEqual([{ kind: "response", data: "\x1b_Gi=31;OK\x1b\\" }]);
    expect(responses(run(apc("a=p,i=31"), t))).toEqual(["\x1b_Gi=31;ENOENT:image not found\x1b\\"]);
    expect(responses(run(apc("a=q,i=2")))).toEqual(["\x1b_Gi=2;OK\x1b\\"]);
  });

  it("i も I も無ければ応答しない", () => {
    expect(run(apc("a=q,s=1,v=1,f=24", "AAAA"))).toEqual([]);
    expect(run(apc("a=q,t=f", "L2V0Yy9wYXNzd2Q="))).toEqual([]);
  });

  it("非対応はエラー。q=2 ならエラーも返さない", () => {
    expect(responses(run(apc("a=q,i=1,f=99", "AAAA")))).toEqual([
      "\x1b_Gi=1;EINVAL:unsupported format\x1b\\",
    ]);
    expect(responses(run(apc("a=f,i=1")))).toEqual(["\x1b_Gi=1;EINVAL:unsupported action\x1b\\"]);
    expect(responses(run(apc("a=q,i=1,f=99,q=2", "AAAA")))).toEqual([]);
    expect(responses(run(apc("a=q,i=1,f=100", b64(Uint8Array.of(1, 2, 3)))))).toEqual([
      "\x1b_Gi=1;EINVAL:invalid png\x1b\\",
    ]);
  });

  it("i と I の両方はエラー", () => {
    expect(responses(run(apc("a=q,i=1,I=2")))).toEqual([
      "\x1b_Gi=1,I=2;EINVAL:cannot specify both i and I keys\x1b\\",
    ]);
  });

  it("形の誤った制御は無視する（応答しない・何も出さない）", () => {
    expect(run(apc("a=T,i=1,bogus", PNG_B64))).toEqual([]);
    expect(run(apc("a=T,i=99999999999", PNG_B64))).toEqual([]);
    expect(run(apc("a=T,i=9999999999", PNG_B64))).toEqual([]); // 10 桁でも 32 ビットを超える値は形の誤り
  });
});

describe("KittyGraphicsTranslator: 保存と後からの配置（AC4）", () => {
  it("a=t で保存し a=p で表示する。無い id は ENOENT", () => {
    const t = new KittyGraphicsTranslator();
    const sent = run(apc("a=t,f=100,i=5", PNG_B64), t);
    expect(images(sent)).toEqual([]);
    expect(responses(sent)).toEqual(["\x1b_Gi=5;OK\x1b\\"]);
    const placed = run(apc("a=p,i=5,c=4,r=4"), t);
    expect(parseClient(images(placed)[0]!.client)).toMatchObject({ width: 4, height: 4 });
    expect(responses(placed)).toEqual(["\x1b_Gi=5;OK\x1b\\"]);
    expect(responses(run(apc("a=p,i=6"), t))).toEqual(["\x1b_Gi=6;ENOENT:image not found\x1b\\"]);
    expect(run(apc("a=p"), t)).toEqual([]); // id が無ければ何もしない
  });

  it("I（番号）はサーバが振った id で答え、a=p の I で引ける", () => {
    const t = new KittyGraphicsTranslator();
    const [r1] = responses(run(apc("a=t,f=100,I=9", PNG_B64), t));
    const m = /^\x1b_Gi=(\d+),I=9;OK\x1b\\$/.exec(r1!);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(0x8000_0000);
    expect(responses(run(apc("a=p,I=9"), t))).toEqual([`\x1b_Gi=${m![1]},I=9;OK\x1b\\`]);
  });

  it("a=d: d=I は保存を捨て、d=i・d 無しは捨てない。応答しない", () => {
    const t = new KittyGraphicsTranslator();
    run(apc("a=t,f=100,i=1", PNG_B64), t);
    expect(run(apc("a=d,d=i,i=1"), t)).toEqual([]);
    expect(run(apc("a=d"), t)).toEqual([]);
    expect(images(run(apc("a=p,i=1"), t))).toHaveLength(1);
    run(apc("a=d,d=I,i=1"), t);
    expect(responses(run(apc("a=p,i=1"), t))).toEqual(["\x1b_Gi=1;ENOENT:image not found\x1b\\"]);
    run(apc("a=t,f=100,i=2", PNG_B64), t);
    run(apc("a=d,d=A"), t);
    expect(responses(run(apc("a=p,i=2"), t))).toEqual(["\x1b_Gi=2;ENOENT:image not found\x1b\\"]);
  });

  it("U=1 の表示はエラーだが保存はする", () => {
    const t = new KittyGraphicsTranslator();
    const segs = run(apc("a=T,f=100,i=4,U=1", PNG_B64), t);
    expect(images(segs)).toEqual([]);
    expect(responses(segs)).toEqual(["\x1b_Gi=4;EINVAL:unicode placeholders not supported\x1b\\"]);
    expect(images(run(apc("a=p,i=4"), t))).toHaveLength(1);
  });

  it("保存は枚数と合計の上限を超えると古いものから捨てる", () => {
    const t = new KittyGraphicsTranslator({ limits: { maxStoredImages: 2 } });
    for (const i of [1, 2, 3]) run(apc(`a=t,f=100,i=${i}`, PNG_B64), t);
    expect(responses(run(apc("a=p,i=1,q=1"), t))).toEqual([
      "\x1b_Gi=1;ENOENT:image not found\x1b\\",
    ]);
    expect(images(run(apc("a=p,i=2"), t))).toHaveLength(1);
    const bytes = new KittyGraphicsTranslator({ limits: { maxStoredBytes: PNG.length * 2 } });
    for (const i of [1, 2, 3]) run(apc(`a=t,f=100,i=${i}`, PNG_B64), bytes);
    expect(responses(run(apc("a=p,i=1"), bytes))).toEqual([
      "\x1b_Gi=1;ENOENT:image not found\x1b\\",
    ]);
    expect(images(run(apc("a=p,i=3"), bytes))).toHaveLength(1);
  });

  it("dispose で保存を捨てる", () => {
    const t = new KittyGraphicsTranslator();
    run(apc("a=t,f=100,i=1", PNG_B64), t);
    t.dispose();
    expect(responses(run(apc("a=p,i=1"), t))).toEqual(["\x1b_Gi=1;ENOENT:image not found\x1b\\"]);
  });
});

describe("KittyGraphicsTranslator: ファイル・共有メモリの転送の拒否（AC9）", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  it("t=f/t/s は中身のパスを開かず（t=t でも消さず）エラーで答える。表示もしない", () => {
    dir = mkdtempSync(join(tmpdir(), "kitty-"));
    const file = join(dir, "tty-graphics-protocol-image.png");
    writeFileSync(file, PNG);
    const path = b64(Buffer.from(file));
    for (const medium of ["f", "t", "s"]) {
      const segs = run(apc(`a=T,f=100,t=${medium},i=1`, path));
      expect(segs).toEqual([
        { kind: "response", data: "\x1b_Gi=1;EINVAL:unsupported transmission medium\x1b\\" },
      ]);
      const q = run(apc(`a=q,f=100,t=${medium},i=2`, path));
      expect(responses(q)).toEqual(["\x1b_Gi=2;EINVAL:unsupported transmission medium\x1b\\"]);
    }
    expect(existsSync(file)).toBe(true);
  });
});

describe("KittyGraphicsTranslator: 上限（AC10）と異常な列", () => {
  it("APC が maxApcBytes を超えたら ST まで読み捨て、後ろの出力は通す", () => {
    const t = new KittyGraphicsTranslator({ limits: { maxApcBytes: 100 } });
    const segs = run(
      [
        "x" + apc("a=T,f=100,i=1", PNG_B64.slice(0, 60)),
        apc("a=T,f=100,i=2", PNG_B64.slice(0, 200)) + "y",
      ],
      t,
    );
    expect(texts(segs)).toBe("xy");
    expect(images(segs)).toEqual([]);
    // 境目より短い APC は読む
    const ok = new KittyGraphicsTranslator({ limits: { maxApcBytes: PNG_B64.length + 20 } });
    expect(images(run(apc("a=T,f=100", PNG_B64), ok))).toHaveLength(1);
  });

  it("分割送信の合計が maxPayloadBytes を超えたら捨てて EFBIG", () => {
    const t = new KittyGraphicsTranslator({ limits: { maxPayloadBytes: PNG.length - 1 } });
    const segs = run(
      apc("a=T,f=100,i=1,m=1", PNG_B64.slice(0, 40)) + apc("m=0", PNG_B64.slice(40)),
      t,
    );
    expect(images(segs)).toEqual([]);
    expect(responses(segs)).toEqual(["\x1b_Gi=1;EFBIG:image data too large\x1b\\"]);
    const ok = new KittyGraphicsTranslator({ limits: { maxPayloadBytes: PNG.length } });
    expect(images(run(apc("a=T,f=100", PNG_B64), ok))).toHaveLength(1);
  });

  it("画素数・1 辺・展開後の大きさ・表示の箱の上限", () => {
    const px = new KittyGraphicsTranslator({ limits: { maxPixels: 18 * 34 - 1 } });
    expect(responses(run(apc("a=T,f=100,i=1", PNG_B64), px))).toEqual([
      "\x1b_Gi=1;EFBIG:image too large\x1b\\",
    ]);
    const side = new KittyGraphicsTranslator({ limits: { maxSide: 33 } });
    expect(responses(run(apc("a=T,f=100,i=1", PNG_B64), side))).toEqual([
      "\x1b_Gi=1;EFBIG:image too large\x1b\\",
    ]);
    const raw = new KittyGraphicsTranslator({ limits: { maxRawBytes: 23 } });
    const z = b64(deflateSync(new Uint8Array(24)));
    expect(responses(run(apc("a=T,f=32,s=2,v=3,o=z,i=1", z), raw))).toEqual([
      "\x1b_Gi=1;EINVAL:decompression failed\x1b\\",
    ]);
    const cells = new KittyGraphicsTranslator({ limits: { maxBoxCells: 9 } });
    expect(responses(run(apc("a=T,f=100,i=1,c=10,r=1", PNG_B64), cells))).toEqual([
      "\x1b_Gi=1;EFBIG:placement too large\x1b\\",
    ]);
    expect(images(run(apc("a=T,f=100,c=9,r=9", PNG_B64), cells))).toHaveLength(1);
    const box = new KittyGraphicsTranslator({ limits: { maxBoxPixels: 9 * 17 * 4 - 1 } });
    expect(responses(run(apc("a=T,f=100,i=1,c=2,r=2", PNG_B64), box))).toEqual([
      "\x1b_Gi=1;EFBIG:placement too large\x1b\\",
    ]);
  });

  it("base64 でない中身（制御文字を含む）はエラー（AC11）", () => {
    expect(responses(run(apc("a=T,f=100,i=1", "AAAA\x07]1337;File=inline=1:AAAA")))).toEqual([
      "\x1b_Gi=1;EINVAL:invalid base64 data\x1b\\",
    ]);
  });

  it("APC の途中の CAN・SUB・ESC（ST 以外）で APC を取り消し、後ろは通常の出力として読む", () => {
    expect(run(`a\x1b_Ga=T,i=1;AAAA\x18b`)).toEqual([
      { kind: "text", text: "a" },
      { kind: "text", text: "\x18b" },
    ]);
    expect(texts(run(`a\x1b_Ga=T,i=1;AAAA\x1ab`))).toBe("a\x1ab");
    expect(texts(run(`a\x1b_Ga=T,i=1;AAAA\x1b[31mb`))).toBe("a\x1b[31mb");
    // 割れ目が APC の中の ESC の直後
    const t = new KittyGraphicsTranslator();
    expect(texts([...t.process("a\x1b_Ga=q,i=1\x1b"), ...t.process("[0mz")])).toBe("a\x1b[0mz");
    const u = new KittyGraphicsTranslator();
    const segs = [...u.process("a\x1b_Ga=q,i=1\x1b"), ...u.process("\\z")];
    expect(texts(segs)).toBe("az");
    expect(responses(segs)).toEqual(["\x1b_Gi=1;OK\x1b\\"]);
  });

  it("APC の中の CAN が出力の末尾でも、次の出力の `\\` を ST と取り違えない", () => {
    const t = new KittyGraphicsTranslator();
    const segs = [...t.process("a\x1b_Ga=q,i=1\x18"), ...t.process("\\z")];
    expect(texts(segs)).toBe("a\x18\\z");
    expect(responses(segs)).toEqual([]);
  });

  it("分割送信の途中に m を持つ新しい分割送信が来たら、前の分を捨てて新しい方だけをまとめる", () => {
    const t = new KittyGraphicsTranslator();
    const other = b64(encodePng(new Uint8Array(9 * 17 * 3), 9, 17, 3));
    const segs = run(
      apc("a=T,f=100,i=1,m=1", PNG_B64.slice(0, 40)) +
        apc("a=T,f=100,i=2,m=1", other.slice(0, 40)) +
        apc("m=0", other.slice(40)),
      t,
    );
    expect(responses(segs)).toEqual(["\x1b_Gi=2;OK\x1b\\"]);
    expect(parseClient(images(segs)[0]!.client).png.toString("base64")).toBe(other);
  });

  it("分割送信の途中に別のコマンドが来たら、途中の分を捨てて新しいコマンドとして読む", () => {
    const t = new KittyGraphicsTranslator();
    const segs = run(
      apc("a=T,f=100,i=1,m=1", PNG_B64.slice(0, 40)) +
        apc("a=q,i=2") +
        apc("m=0", PNG_B64.slice(40)),
      t,
    );
    expect(images(segs)).toEqual([]);
    expect(responses(segs)).toEqual(["\x1b_Gi=2;OK\x1b\\"]);
  });
});

describe("KittyGraphicsTranslator: 投げない（design「エラー処理」）", () => {
  afterEach(() => vi.restoreAllMocks());

  it("コマンドの処理の中の想定外の例外は EINVAL:internal error の応答になり、後ろの出力は通る", () => {
    vi.spyOn(Buffer, "concat").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const segs = run(`${apc("a=T,f=100,i=1", PNG_B64)}after`);
    expect(responses(segs)).toEqual(["\x1b_Gi=1;EINVAL:internal error\x1b\\"]);
    expect(texts(segs)).toBe("after");
  });

  it("形の崩れた列を並べても投げない", () => {
    const t = new KittyGraphicsTranslator();
    const inputs = [
      "\x1b_G",
      "\x1b_G;",
      "\x1b_G,,\x1b\\",
      "\x1b_Ga=\x1b\\",
      "\x1b_Gm=1;@@@@\x1b\\",
      "\x1b_Gm=0\x1b\\",
      "\x1b_Ga=p,i=-5\x1b\\",
      "\x1b_Ga=T,f=100,s=99999999,v=99999999;AAAA\x1b\\",
      "\x1b_Ga=T,f=32,s=4294967295,v=4294967295,i=1;AAAA\x1b\\",
      "\x1b\x1b\x1b_G\x1b\x1b\\",
    ];
    for (const input of inputs) expect(() => t.process(input)).not.toThrow();
    expect(responses(run(apc("a=T,f=32,s=4294967295,v=4294967295,i=1", "AAAA")))).toEqual([
      "\x1b_Gi=1;EFBIG:image too large\x1b\\",
    ]);
  });
});

describe("KittyGraphicsTranslator: 点検の指摘（T2）", () => {
  it("番号の対応表は、画像を捨てると縮み、保存しなかった画像では増えない", () => {
    const t = new KittyGraphicsTranslator({ limits: { maxStoredImages: 2 } });
    const table = (t as unknown as { numberToId: Map<number, number> }).numberToId;
    for (let n = 1; n <= 10; n++) run(apc(`a=t,f=100,I=${n}`, PNG_B64), t);
    expect(table.size).toBe(2);
    expect(responses(run(apc("a=p,I=1"), t))).toEqual(["\x1b_GI=1;ENOENT:image not found\x1b\\"]);
    run(apc("a=d,d=I,I=10"), t);
    expect(table.size).toBe(1);
    const small = new KittyGraphicsTranslator({ limits: { maxStoredBytes: PNG.length - 1 } });
    run(apc("a=t,f=100,I=1", PNG_B64), small);
    expect((small as unknown as { numberToId: Map<number, number> }).numberToId.size).toBe(0);
  });

  it("空の出力は途中の状態を崩さない（APC の中の ESC の直後に空の出力が来ても ST を読む）", () => {
    const t = new KittyGraphicsTranslator();
    const segs = [...t.process("\x1b_Ga=q,i=1\x1b"), ...t.process(""), ...t.process("\\z")];
    expect(texts(segs)).toBe("z");
    expect(responses(segs)).toEqual(["\x1b_Gi=1;OK\x1b\\"]);
    const u = new KittyGraphicsTranslator();
    const segs2 = [
      ...u.process("a\x1b"),
      ...u.process(""),
      ...u.process(`_G${apc("a=T,f=100", PNG_B64).slice(3)}`),
    ];
    expect(images(segs2)).toHaveLength(1);
  });
});

describe("KittyGraphicsTranslator: 送る PNG の大きさの上限（配信の stale の閾値の手前。decisions D5）", () => {
  it("PNG・生の画素から作った PNG が maxPngBytes を超えたら EFBIG で表示しない。境目ちょうどは送る", () => {
    const over = new KittyGraphicsTranslator({ limits: { maxPngBytes: PNG.length - 1 } });
    expect(responses(run(apc("a=T,f=100,i=1", PNG_B64), over))).toEqual([
      "\x1b_Gi=1;EFBIG:image too large to transfer\x1b\\",
    ]);
    const raw = new Uint8Array(18 * 34 * 4).fill(200);
    expect(responses(run(apc("a=T,f=32,s=18,v=34,i=2", b64(raw)), over))).toEqual([
      "\x1b_Gi=2;EFBIG:image too large to transfer\x1b\\",
    ]);
    const exact = new KittyGraphicsTranslator({ limits: { maxPngBytes: PNG.length } });
    expect(images(run(apc("a=T,f=100", PNG_B64), exact))).toHaveLength(1);
  });

  it("既定の上限は、base64 にしても配信の stale の閾値（2MB）を下回る", async () => {
    const { DEFAULT_KITTY_LIMITS } = await import("./KittyGraphics.js");
    expect(Math.ceil(DEFAULT_KITTY_LIMITS.maxPngBytes / 3) * 4 + 200).toBeLessThan(2 * 1024 * 1024);
  });
});
