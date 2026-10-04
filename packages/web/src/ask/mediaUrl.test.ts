import type { AskPending } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { loadMedia } from "./mediaUrl.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const b64 = (x: string | Uint8Array): string =>
  btoa(String.fromCharCode(...(typeof x === "string" ? enc(x) : x)));
const buf = (x: string | number[]): Uint8Array =>
  typeof x === "string" ? enc(x) : Uint8Array.from(x);
const code = (c: string): Error => Object.assign(new Error(`${c}: x`), { code: c });
const base = (over: Partial<AskPending>): AskPending => ({
  askId: "a1",
  paneId: "p1",
  spec: { title: "T", submit: "決定", note: true, questions: [] },
  ...over,
});

/** メディアごとのバイト列を 6 バイトごとの片で返す偽の `ask.media`。 */
function fake(files: Record<number, Uint8Array | Error>, chunk = 6) {
  const calls: { id: number; offset: number }[] = [];
  let live = 0;
  let peak = 0;
  const request = (async (_m: string, p: { id: number; offset: number }) => {
    calls.push(p);
    live++;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 3));
    live--;
    const f = files[p.id];
    if (f instanceof Error) throw f;
    if (f === undefined) throw code("invalid_params");
    const part = f.subarray(p.offset, p.offset + chunk);
    return { base64: b64(part), size: f.length, eof: p.offset + part.length >= f.length };
  }) as never;
  return { request, calls, peak: () => peak };
}
const yes = (): boolean => true;

describe("loadMedia", () => {
  it("メディアが無ければ何も取らずに空の結果", async () => {
    const f = fake({});
    expect(await loadMedia(f.request, base({}), yes)).toEqual({ urls: {}, views: [] });
    expect(f.calls).toEqual([]);
  });

  it("片に分けて取って連結し、画像・音は media:<id> → data: の URL にする。片の境界で壊れない", async () => {
    const png = buf("0123456789abcdefghij"); // 20 バイト＝片 6 バイトで 4 片
    const wav = buf("RIFFxxxxWAVE");
    const f = fake({ 0: png, 1: wav });
    const r = await loadMedia(
      f.request,
      base({
        media: [
          { id: 0, kind: "image", mime: "image/png", bytes: png.length },
          { id: 1, kind: "audio", mime: "audio/wav", bytes: wav.length },
        ],
      }),
      yes,
    );
    expect(r).toEqual({
      urls: {
        "media:0": `data:image/png;base64,${b64(png)}`,
        "media:1": `data:audio/wav;base64,${b64(wav)}`,
      },
      views: [],
    });
    expect(f.calls.filter((c) => c.id === 0).map((c) => c.offset)).toEqual([0, 6, 12, 18]);
  });

  it("成果物は text・markdown・html を UTF-8 の文字列に、image は data: の URL にする（日本語が壊れない）", async () => {
    const md = buf("# 見出し\n日本語の本文");
    const img = buf([0x89, 0x50, 0x4e, 0x47]);
    const f = fake({ 0: md, 1: img, 2: buf("<p>x</p>"), 3: buf("plain") }, 6);
    const r = await loadMedia(
      f.request,
      base({
        media: [
          { id: 0, kind: "markdown", mime: "text/markdown", bytes: md.length },
          { id: 1, kind: "image", mime: "image/png", bytes: 4 },
          { id: 2, kind: "html", mime: "text/html", bytes: 8 },
          { id: 3, kind: "text", mime: "text/plain", bytes: 5 },
        ],
        view: [
          { title: "設計", kind: "markdown", media: 0 },
          { title: "図", kind: "image", media: 1 },
          { title: "h", kind: "html", media: 2 },
          { title: "t", kind: "text", media: 3 },
        ],
      }),
      yes,
    );
    expect(r).not.toBeNull();
    expect(r).not.toBe("view_failed");
    const ok = r as Exclude<typeof r, null | "view_failed">;
    expect(ok.views).toEqual([
      { title: "設計", kind: "markdown", text: "# 見出し\n日本語の本文" },
      { title: "図", kind: "image", url: `data:image/png;base64,${b64(img)}` },
      { title: "h", kind: "html", text: "<p>x</p>" },
      { title: "t", kind: "text", text: "plain" },
    ]);
    expect(ok.urls).toEqual({ "media:1": `data:image/png;base64,${b64(img)}` }); // 成果物の画像も data: だが、参照としては解けるだけ（定義は参照しない）
  });

  it("同時に取るのは 3 つまで", async () => {
    const files = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, buf("x".repeat(30))]));
    const f = fake(files);
    await loadMedia(
      f.request,
      base({
        media: Array.from({ length: 8 }, (_, i) => ({
          id: i,
          kind: "image" as const,
          mime: "image/png",
          bytes: 30,
        })),
      }),
      yes,
    );
    expect(f.peak()).toBeLessThanOrEqual(3);
  });

  it("画像・音が取れなければ、その参照だけ渡さない（質問は出す）", async () => {
    const f = fake({ 0: code("internal"), 1: buf("ok") });
    const r = await loadMedia(
      f.request,
      base({
        media: [
          { id: 0, kind: "image", mime: "image/png", bytes: 3 },
          { id: 1, kind: "image", mime: "image/png", bytes: 2 },
        ],
      }),
      yes,
    );
    expect(r).toEqual({ urls: { "media:1": `data:image/png;base64,${b64("ok")}` }, views: [] });
  });

  it("成果物が取れなければ view_failed（見ないまま答えさせない）", async () => {
    const f = fake({ 0: code("internal") });
    expect(
      await loadMedia(
        f.request,
        base({
          media: [{ id: 0, kind: "markdown", mime: "text/markdown", bytes: 3 }],
          view: [{ title: "t", kind: "markdown", media: 0 }],
        }),
        yes,
      ),
    ).toBe("view_failed");
  });

  it("取っている間に質問が閉じた（ask_closed）・もう現在の質問でない（isCurrent が偽）なら null（捨てる）", async () => {
    const closed = fake({ 0: code("ask_closed") });
    expect(
      await loadMedia(
        closed.request,
        base({ media: [{ id: 0, kind: "image", mime: "image/png", bytes: 3 }] }),
        yes,
      ),
    ).toBeNull();
    const f = fake({ 0: buf("x") });
    expect(
      await loadMedia(
        f.request,
        base({ media: [{ id: 0, kind: "image", mime: "image/png", bytes: 1 }] }),
        () => false,
      ),
    ).toBeNull();
  });
});
