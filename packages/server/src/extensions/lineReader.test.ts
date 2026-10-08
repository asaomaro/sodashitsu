import { describe, expect, it } from "vitest";
import { LineReader, type LineItem } from "./lineReader.js";

const b = (s: string) => Buffer.from(s, "utf8");
function drain(r: LineReader): LineItem[] {
  const out: LineItem[] = [];
  for (let it = r.next(); it !== null; it = r.next()) out.push(it);
  return out;
}
const texts = (items: LineItem[]) => items.map((i) => (i.kind === "line" ? i.text : i.kind));

describe("LineReader", () => {
  it("改行で切る。直前の \\r は除く。空白だけの行は飛ばす", () => {
    const r = new LineReader();
    r.push(b('{"a":1}\r\n  \n\t\r\n{"b":2}\n'));
    expect(texts(drain(r))).toEqual(['{"a":1}', '{"b":2}']);
    expect(r.next()).toBeNull();
  });
  it("片をまたぐ行", () => {
    const r = new LineReader();
    r.push(b("ab"));
    expect(r.next()).toBeNull();
    r.push(b("cd"));
    expect(r.next()).toBeNull();
    r.push(b("ef\ngh"));
    expect(texts(drain(r))).toEqual(["abcdef"]);
    r.push(b("i\n"));
    expect(texts(drain(r))).toEqual(["ghi"]);
  });
  it("1 片に 1000 行", () => {
    const r = new LineReader();
    r.push(b(Array.from({ length: 1000 }, (_, i) => `l${i}\n`).join("")));
    const items = drain(r);
    expect(items).toHaveLength(1000);
    expect(texts(items)[999]).toBe("l999");
  });
  it("ちょうど上限は通り、1 バイト超は too_long", () => {
    const max = 1024;
    const r = new LineReader(max);
    r.push(b("a".repeat(max) + "\nok\n"));
    const first = drain(r);
    expect(first.map((i) => i.kind)).toEqual(["line", "line"]);
    r.push(b("a".repeat(max + 1) + "\nok\n"));
    const second = drain(r);
    expect(second.map((i) => i.kind)).toEqual(["too_long", "line"]);
    expect(second[1]).toMatchObject({ text: "ok" });
  });
  it("改行が無いまま超えたら 1 回だけ too_long。捨てている間、持っているバイト数が増えない", () => {
    const max = 1000;
    const r = new LineReader(max);
    for (let i = 0; i < 5; i++) r.push(b("x".repeat(300)));
    expect(drain(r).map((i) => i.kind)).toEqual(["too_long"]);
    expect(r.heldBytes()).toBe(0);
    for (let i = 0; i < 50; i++) r.push(b("x".repeat(300)));
    expect(r.heldBytes()).toBe(0);
    expect(r.next()).toBeNull();
    r.push(b("tail\n{\"ok\":1}\n"));
    expect(texts(drain(r))).toEqual(['{"ok":1}']);
  });
  it("1 つの片が上限を超え、途中に改行がある場合も順序を保つ", () => {
    const r = new LineReader(10);
    r.push(b("a\n" + "x".repeat(30)));
    expect(drain(r).map((i) => i.kind)).toEqual(["line", "too_long"]);
    r.push(b("zz\nb\n"));
    expect(texts(drain(r))).toEqual(["b"]);
  });
  it("too_long の印は、その前に完成した行より後ろに出る", () => {
    const r = new LineReader(5);
    r.push(b("aa\nbb\n" + "x".repeat(10)));
    r.push(b("\ncc\n"));
    expect(texts(drain(r))).toEqual(["aa", "bb", "too_long", "cc"]);
  });
  it("壊れた UTF-8 は bad_utf8。続く行は読める", () => {
    const r = new LineReader();
    r.push(Buffer.concat([Buffer.from([0x7b, 0xff, 0xfe, 0x7d, 0x0a]), b("ok\n")]));
    const items = drain(r);
    expect(items.map((i) => i.kind)).toEqual(["bad_utf8", "line"]);
  });
  it("多バイト文字が片をまたぐ", () => {
    const bytes = b("日本語\n");
    const r = new LineReader();
    for (let i = 0; i < bytes.length; i++) r.push(bytes.subarray(i, i + 1));
    expect(texts(drain(r))).toEqual(["日本語"]);
  });
  it("既定の上限は 4 MiB（4 MiB ちょうどは通り、1 バイト超は too_long）", () => {
    const max = 4 * 1024 * 1024;
    const r = new LineReader();
    r.push(Buffer.concat([Buffer.alloc(max, 0x61), b("\n")]));
    expect(drain(r).map((i) => i.kind)).toEqual(["line"]);
    r.push(Buffer.concat([Buffer.alloc(max + 1, 0x61), b("\n")]));
    expect(drain(r).map((i) => i.kind)).toEqual(["too_long"]);
  });
});
